-- =====================================================
-- MIGRACIÓN: Cobro FXU por renombrar planetas y alianzas
-- =====================================================
-- Primera vez asignar nombre → GRATIS
-- Cambiar nombre después → COBRA FXU (configurable desde admin)
-- Planeta: 100 FXU por defecto
-- Alianza: 1000 FXU por defecto
-- VIP tiene 50% descuento
-- =====================================================

-- 1. Agregar columna name_changed a planets (para saber si ya usó el nombre gratis)
ALTER TABLE planets ADD COLUMN IF NOT EXISTS name_changed boolean DEFAULT false;

-- Marcar planetas que ya tienen nombre personalizado (diferente de 'Planeta')
UPDATE planets SET name_changed = true WHERE name != 'Planeta' AND name != 'Luna';

-- 2. Agregar columna name_changed a alliances 
-- Las alianzas siempre se crean con nombre, así que el primer cambio sería el de cobro
-- Pero para ser justos con alianzas existentes: la primera vez que editan DESPUÉS de esta migración es gratis
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS name_changed boolean DEFAULT false;

-- Marcar alianzas existentes como que ya tienen nombre (ya eligieron al crear)
UPDATE alliances SET name_changed = true;

-- 3. Agregar 'planet_rename' y 'alliance_rename' al constraint de revenue_type
ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee', 'withdrawal_fee', 'instant_build', 'instant_research',
    'instant_ship', 'referral_bonus', 'officer_fxu', 'expedition_fee',
    'supply_box', 'fleet_acceleration', 'swap_fee', 'transfer_fee',
    'plus_subscription', 'colony_abandon', 'planet_rename', 'alliance_rename', 'alliance_creation', 'other'
  ]));

-- 4. Insertar configuración de costos en game_settings
INSERT INTO game_settings (key, value, description)
VALUES ('fxu_rename_planet_cost', '100', 'Costo en FXU para renombrar un planeta (primera vez gratis)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('fxu_rename_alliance_cost', '1000', 'Costo en FXU para renombrar una alianza (primera vez gratis)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('fxu_create_alliance_cost', '1000', 'Costo en FXU para crear una alianza. VIP tiene 50% descuento.')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 5. Función: secure_rename_planet
-- =====================================================
CREATE OR REPLACE FUNCTION secure_rename_planet(p_planet_id uuid, p_new_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_planet record;
  v_cost integer;
  v_user_fxu numeric;
  v_is_plus boolean;
  v_admin_id uuid;
  v_final_cost integer;
  v_admin_amount integer;
  v_pool_amount integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validar nombre
  IF p_new_name IS NULL OR LENGTH(TRIM(p_new_name)) < 2 OR LENGTH(TRIM(p_new_name)) > 24 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre debe tener entre 2 y 24 caracteres');
  END IF;

  p_new_name := TRIM(p_new_name);

  -- Buscar planeta del usuario
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado');
  END IF;

  -- Si el nombre no cambió, no hacer nada
  IF v_planet.name = p_new_name THEN
    RETURN jsonb_build_object('success', true, 'message', 'Nombre sin cambios', 'cost', 0);
  END IF;

  -- Si es la primera vez (name_changed = false), es GRATIS
  IF v_planet.name_changed = false THEN
    UPDATE planets SET name = p_new_name, name_changed = true WHERE id = p_planet_id;
    RETURN jsonb_build_object('success', true, 'message', 'Planeta renombrado gratis (primera vez)', 'cost', 0);
  END IF;

  -- A partir de aquí COBRA FXU
  SELECT COALESCE(value::integer, 100) INTO v_cost
  FROM game_settings WHERE key = 'fxu_rename_planet_cost';
  IF v_cost IS NULL THEN v_cost := 100; END IF;

  -- Descuento VIP 50%
  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_cost * 0.50);
  END IF;

  -- Verificar saldo
  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  IF v_user_fxu < v_final_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente. Necesitas ' || v_final_cost || ' FXU, tienes ' || v_user_fxu || ' FXU',
      'required', v_final_cost,
      'available', v_user_fxu
    );
  END IF;

  -- Cobrar FXU
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_final_cost WHERE id = v_user_id;

  -- Split 50% admin / 50% pools de recompensa
  v_pool_amount := FLOOR(v_final_cost * 0.50);
  v_admin_amount := v_final_cost - v_pool_amount;

  -- 50% al admin
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue('planet_rename', v_admin_amount, 'Rename planet (50% admin): ' || v_planet.name || ' → ' || p_new_name, v_user_id, p_planet_id);

  -- 50% a pools de recompensa
  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'planet_rename', v_user_id);
  END IF;

  -- Renombrar
  UPDATE planets SET name = p_new_name WHERE id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Planeta renombrado exitosamente',
    'cost', v_final_cost,
    'admin_share', v_admin_amount,
    'pool_share', v_pool_amount,
    'new_name', p_new_name,
    'vip_discount', v_is_plus
  );
END;
$$;

GRANT EXECUTE ON FUNCTION secure_rename_planet(uuid, text) TO authenticated;

-- =====================================================
-- 6. Función: secure_rename_alliance
-- =====================================================
CREATE OR REPLACE FUNCTION secure_rename_alliance(p_alliance_id uuid, p_new_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_alliance record;
  v_member record;
  v_cost integer;
  v_user_fxu numeric;
  v_is_plus boolean;
  v_admin_id uuid;
  v_final_cost integer;
  v_admin_amount integer;
  v_pool_amount integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validar nombre
  IF p_new_name IS NULL OR LENGTH(TRIM(p_new_name)) < 2 OR LENGTH(TRIM(p_new_name)) > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre debe tener entre 2 y 30 caracteres');
  END IF;

  p_new_name := TRIM(p_new_name);

  -- Buscar alianza
  SELECT * INTO v_alliance FROM alliances WHERE id = p_alliance_id;
  IF v_alliance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alianza no encontrada');
  END IF;

  -- Verificar que el usuario es líder o fundador
  SELECT * INTO v_member FROM alliance_members 
  WHERE alliance_id = p_alliance_id AND user_id = v_user_id;
  
  IF v_member IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres miembro de esta alianza');
  END IF;

  IF v_alliance.leader_id != v_user_id AND v_alliance.founder_id != v_user_id AND v_member.can_edit = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permisos para renombrar la alianza');
  END IF;

  -- Si el nombre no cambió
  IF v_alliance.name = p_new_name THEN
    RETURN jsonb_build_object('success', true, 'message', 'Nombre sin cambios', 'cost', 0);
  END IF;

  -- Si es la primera vez (name_changed = false), es GRATIS
  IF v_alliance.name_changed = false THEN
    UPDATE alliances SET name = p_new_name, name_changed = true WHERE id = p_alliance_id;
    RETURN jsonb_build_object('success', true, 'message', 'Alianza renombrada gratis (primera vez)', 'cost', 0);
  END IF;

  -- A partir de aquí COBRA FXU
  SELECT COALESCE(value::integer, 1000) INTO v_cost
  FROM game_settings WHERE key = 'fxu_rename_alliance_cost';
  IF v_cost IS NULL THEN v_cost := 1000; END IF;

  -- Descuento VIP 50%
  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_cost * 0.50);
  END IF;

  -- Verificar saldo
  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  IF v_user_fxu < v_final_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente. Necesitas ' || v_final_cost || ' FXU, tienes ' || v_user_fxu || ' FXU',
      'required', v_final_cost,
      'available', v_user_fxu
    );
  END IF;

  -- Cobrar FXU
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_final_cost WHERE id = v_user_id;

  -- Split 50% admin / 50% pools de recompensa
  v_pool_amount := FLOOR(v_final_cost * 0.50);
  v_admin_amount := v_final_cost - v_pool_amount;

  -- 50% al admin
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue('alliance_rename', v_admin_amount, 'Rename alliance (50% admin): ' || v_alliance.name || ' → ' || p_new_name, v_user_id, p_alliance_id);

  -- 50% a pools de recompensa
  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'alliance_rename', v_user_id);
  END IF;

  -- Renombrar
  UPDATE alliances SET name = p_new_name WHERE id = p_alliance_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Alianza renombrada exitosamente',
    'cost', v_final_cost,
    'admin_share', v_admin_amount,
    'pool_share', v_pool_amount,
    'new_name', p_new_name,
    'vip_discount', v_is_plus
  );
END;
$$;

GRANT EXECUTE ON FUNCTION secure_rename_alliance(uuid, text) TO authenticated;

-- =====================================================
-- 7. Función helper: get_rename_costs (para que el frontend sepa los precios)
-- =====================================================
CREATE OR REPLACE FUNCTION get_rename_costs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_planet_cost integer;
  v_alliance_cost integer;
  v_create_alliance_cost integer;
  v_is_plus boolean;
BEGIN
  SELECT COALESCE(value::integer, 100) INTO v_planet_cost
  FROM game_settings WHERE key = 'fxu_rename_planet_cost';
  IF v_planet_cost IS NULL THEN v_planet_cost := 100; END IF;

  SELECT COALESCE(value::integer, 1000) INTO v_alliance_cost
  FROM game_settings WHERE key = 'fxu_rename_alliance_cost';
  IF v_alliance_cost IS NULL THEN v_alliance_cost := 1000; END IF;

  SELECT COALESCE(value::integer, 1000) INTO v_create_alliance_cost
  FROM game_settings WHERE key = 'fxu_create_alliance_cost';
  IF v_create_alliance_cost IS NULL THEN v_create_alliance_cost := 1000; END IF;

  v_is_plus := is_user_plus(auth.uid());

  RETURN jsonb_build_object(
    'planet_cost', v_planet_cost,
    'alliance_cost', v_alliance_cost,
    'create_alliance_cost', v_create_alliance_cost,
    'planet_cost_vip', CEIL(v_planet_cost * 0.50),
    'alliance_cost_vip', CEIL(v_alliance_cost * 0.50),
    'create_alliance_cost_vip', CEIL(v_create_alliance_cost * 0.50),
    'is_vip', v_is_plus
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_rename_costs() TO authenticated;

-- =====================================================
-- 8. Función admin: admin_update_rename_costs
-- =====================================================
-- Drop old signature if exists
DROP FUNCTION IF EXISTS admin_update_rename_costs(integer, integer);

CREATE OR REPLACE FUNCTION admin_update_rename_costs(
  p_planet_cost integer DEFAULT NULL,
  p_alliance_cost integer DEFAULT NULL,
  p_create_alliance_cost integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_planet_cost IS NOT NULL THEN
    IF p_planet_cost < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planet cost cannot be negative');
    END IF;
    INSERT INTO game_settings (key, value, description)
    VALUES ('fxu_rename_planet_cost', p_planet_cost::text, 'Costo FXU renombrar planeta')
    ON CONFLICT (key) DO UPDATE SET value = p_planet_cost::text;
  END IF;

  IF p_alliance_cost IS NOT NULL THEN
    IF p_alliance_cost < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Alliance rename cost cannot be negative');
    END IF;
    INSERT INTO game_settings (key, value, description)
    VALUES ('fxu_rename_alliance_cost', p_alliance_cost::text, 'Costo FXU renombrar alianza')
    ON CONFLICT (key) DO UPDATE SET value = p_alliance_cost::text;
  END IF;

  IF p_create_alliance_cost IS NOT NULL THEN
    IF p_create_alliance_cost < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Alliance creation cost cannot be negative');
    END IF;
    INSERT INTO game_settings (key, value, description)
    VALUES ('fxu_create_alliance_cost', p_create_alliance_cost::text, 'Costo FXU crear alianza')
    ON CONFLICT (key) DO UPDATE SET value = p_create_alliance_cost::text;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_rename_costs(integer, integer, integer) TO authenticated;

-- =====================================================
-- 9. Función: secure_create_alliance
-- =====================================================
CREATE OR REPLACE FUNCTION secure_create_alliance(
  p_tag text,
  p_name text,
  p_description text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_cost integer;
  v_user_fxu numeric;
  v_is_plus boolean;
  v_final_cost integer;
  v_admin_id uuid;
  v_admin_amount integer;
  v_pool_amount integer;
  v_existing_tag uuid;
  v_existing_member record;
  v_alliance_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validar tag
  IF p_tag IS NULL OR LENGTH(TRIM(p_tag)) < 2 OR LENGTH(TRIM(p_tag)) > 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El tag debe tener entre 2 y 8 caracteres');
  END IF;

  -- Validar nombre
  IF p_name IS NULL OR LENGTH(TRIM(p_name)) < 2 OR LENGTH(TRIM(p_name)) > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre debe tener entre 2 y 30 caracteres');
  END IF;

  p_tag := UPPER(TRIM(p_tag));
  p_name := TRIM(p_name);

  -- Verificar que el usuario no esté ya en una alianza
  SELECT * INTO v_existing_member FROM alliance_members WHERE user_id = v_user_id LIMIT 1;
  IF v_existing_member IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya eres miembro de una alianza');
  END IF;

  -- Verificar tag único
  SELECT id INTO v_existing_tag FROM alliances WHERE tag = p_tag;
  IF v_existing_tag IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta etiqueta ya está en uso');
  END IF;

  -- Obtener costo de creación
  SELECT COALESCE(value::integer, 1000) INTO v_cost
  FROM game_settings WHERE key = 'fxu_create_alliance_cost';
  IF v_cost IS NULL THEN v_cost := 1000; END IF;

  -- Descuento VIP 50%
  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_cost * 0.50);
  END IF;

  -- Si el costo es > 0, verificar y cobrar
  IF v_final_cost > 0 THEN
    SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu FROM profiles WHERE id = v_user_id;
    IF v_user_fxu < v_final_cost THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'FXU insuficiente. Necesitas ' || v_final_cost || ' FXU, tienes ' || v_user_fxu || ' FXU',
        'required', v_final_cost,
        'available', v_user_fxu
      );
    END IF;

    -- Cobrar FXU
    PERFORM _internal_set_fxu_context();
    UPDATE profiles SET fxu_balance = fxu_balance - v_final_cost WHERE id = v_user_id;

    -- Split 50% admin / 50% pools de recompensa
    v_pool_amount := FLOOR(v_final_cost * 0.50);
    v_admin_amount := v_final_cost - v_pool_amount;

    -- 50% al admin
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id AND v_admin_amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
    END IF;

    PERFORM record_admin_revenue('alliance_creation', v_admin_amount, 'Create alliance (50% admin): [' || p_tag || '] ' || p_name, v_user_id, NULL);

    -- 50% a pools de recompensa
    IF v_pool_amount > 0 THEN
      PERFORM contribute_to_jackpot(v_pool_amount, 'alliance_creation', v_user_id);
    END IF;
  ELSE
    v_admin_amount := 0;
    v_pool_amount := 0;
  END IF;

  -- Crear alianza
  INSERT INTO alliances (tag, name, description, founder_id, leader_id, member_count, is_open, name_changed)
  VALUES (p_tag, p_name, COALESCE(p_description, ''), v_user_id, v_user_id, 1, false, true)
  RETURNING id INTO v_alliance_id;

  -- Agregar fundador como miembro
  INSERT INTO alliance_members (alliance_id, user_id, rank_name, rank_level, can_invite, can_kick, can_edit)
  VALUES (v_alliance_id, v_user_id, 'Fundador', 10, true, true, true);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Alianza creada exitosamente',
    'alliance_id', v_alliance_id,
    'cost', v_final_cost,
    'admin_share', v_admin_amount,
    'pool_share', v_pool_amount,
    'vip_discount', v_is_plus
  );
END;
$$;

GRANT EXECUTE ON FUNCTION secure_create_alliance(text, text, text) TO authenticated;
