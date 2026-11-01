-- =====================================================================
-- Alliance Reset: dissolve all, new system
-- 1. Track founders before dissolve
-- 2. Dissolve all alliances
-- 3. Max members 5 (was 10)
-- 4. First alliance creation FREE, subsequent cost 1000 FXU
-- =====================================================================

-- =====================================================================
-- STEP 1: Add tracking column to profiles
-- =====================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_created_alliance boolean NOT NULL DEFAULT false;

-- Mark current founders
UPDATE profiles SET has_created_alliance = true
WHERE id IN (SELECT DISTINCT founder_id FROM alliances WHERE founder_id IS NOT NULL);

-- =====================================================================
-- STEP 2: Dissolve all alliances (order matters: child tables first)
-- =====================================================================
DELETE FROM alliance_applications;
DELETE FROM alliance_members;
DELETE FROM alliance_diplomacy;
DELETE FROM alliances;

-- =====================================================================
-- STEP 3: Max members from 10 → 5
-- =====================================================================

CREATE OR REPLACE FUNCTION public.accept_alliance_application(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_alliance_id uuid;
v_applicant_id uuid;
v_user_id uuid;
v_membership record;
v_member_count int;
v_max_members int := 3;
v_existing_member boolean;
v_app_status text;
BEGIN
v_user_id := auth.uid();

IF v_user_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
END IF;

SELECT alliance_id, user_id, status INTO v_alliance_id, v_applicant_id, v_app_status
FROM alliance_applications
WHERE id = p_application_id;

IF v_alliance_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada');
END IF;

IF v_app_status != 'pending' THEN
RETURN jsonb_build_object('success', false, 'error', 'La solicitud ya fue procesada');
END IF;

SELECT * INTO v_membership
FROM alliance_members
WHERE alliance_id = v_alliance_id AND user_id = v_user_id;

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'No eres miembro de esta alianza');
END IF;

IF NOT COALESCE(v_membership.can_invite, false) THEN
RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para aceptar solicitudes');
END IF;

SELECT EXISTS(
SELECT 1 FROM alliance_members WHERE user_id = v_applicant_id
) INTO v_existing_member;

IF v_existing_member THEN
UPDATE alliance_applications SET status = 'rejected' WHERE id = p_application_id;
RETURN jsonb_build_object('success', false, 'error', 'El jugador ya pertenece a una alianza');
END IF;

SELECT COUNT(*) INTO v_member_count FROM alliance_members WHERE alliance_id = v_alliance_id;

IF v_member_count >= v_max_members THEN
RETURN jsonb_build_object(
'success', false,
'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
);
END IF;

INSERT INTO alliance_members (alliance_id, user_id)
VALUES (v_alliance_id, v_applicant_id);

UPDATE alliance_applications SET status = 'accepted' WHERE id = p_application_id;

DELETE FROM alliance_applications
WHERE user_id = v_applicant_id
AND status = 'pending'
AND id != p_application_id;

UPDATE alliances SET member_count = v_member_count + 1 WHERE id = v_alliance_id;

RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_open_alliance(p_alliance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_member_count int;
v_max_members int := 3;
v_is_open boolean;
v_existing_member boolean;
BEGIN
SELECT EXISTS(
SELECT 1 FROM alliance_members WHERE user_id = auth.uid()
) INTO v_existing_member;

IF v_existing_member THEN
RETURN jsonb_build_object('success', false, 'error', 'Ya perteneces a una alianza');
END IF;

SELECT is_open INTO v_is_open FROM alliances WHERE id = p_alliance_id;
IF v_is_open IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Alianza no encontrada');
END IF;

IF NOT v_is_open THEN
RETURN jsonb_build_object('success', false, 'error', 'Esta alianza requiere solicitud');
END IF;

SELECT COUNT(*) INTO v_member_count FROM alliance_members WHERE alliance_id = p_alliance_id;

IF v_member_count >= v_max_members THEN
RETURN jsonb_build_object(
'success', false,
'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
);
END IF;

INSERT INTO alliance_members (alliance_id, user_id)
VALUES (p_alliance_id, auth.uid());

UPDATE alliance_applications
SET status = 'rejected'
WHERE user_id = auth.uid() AND status = 'pending';

UPDATE alliances SET member_count = v_member_count + 1 WHERE id = p_alliance_id;

RETURN jsonb_build_object('success', true);
END;
$function$;

-- =====================================================================
-- STEP 4: First alliance creation FREE
-- =====================================================================

CREATE OR REPLACE FUNCTION public.secure_create_alliance(p_tag text, p_name text, p_description text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_has_created boolean;
  v_free_creation boolean;
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

  -- Check if this is user's FIRST alliance creation (ever)
  SELECT has_created_alliance INTO v_has_created FROM profiles WHERE id = v_user_id;
  v_free_creation := (v_has_created IS FALSE);

  IF v_free_creation THEN
    -- First creation: FREE
    v_final_cost := 0;
    v_admin_amount := 0;
    v_pool_amount := 0;
    v_is_plus := false;
  ELSE
    -- Subsequent creation: normal cost
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
  END IF;

  -- Crear alianza
  INSERT INTO alliances (tag, name, description, founder_id, leader_id, member_count, is_open, name_changed)
  VALUES (p_tag, p_name, COALESCE(p_description, ''), v_user_id, v_user_id, 1, false, true)
  RETURNING id INTO v_alliance_id;

  -- Agregar fundador como miembro
  INSERT INTO alliance_members (alliance_id, user_id, rank_name, rank_level, can_invite, can_kick, can_edit)
  VALUES (v_alliance_id, v_user_id, 'Fundador', 10, true, true, true);

  -- Mark user as having created an alliance
  UPDATE profiles SET has_created_alliance = true WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN v_free_creation THEN '¡Alianza creada gratis! (primera creación)' ELSE 'Alianza creada exitosamente' END,
    'alliance_id', v_alliance_id,
    'cost', v_final_cost,
    'admin_share', v_admin_amount,
    'pool_share', v_pool_amount,
    'vip_discount', v_is_plus,
    'free_creation', v_free_creation
  );
END;
$function$;
