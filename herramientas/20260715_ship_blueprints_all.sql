-- =====================================================================
-- 20260715_ship_blueprints_all.sql
-- Planos de naves: un plano por cada tipo de nave, precio en USD (cobrado
-- en TUNG al precio de mercado), desbloqueo PERMANENTE (no se consume) y
-- reparto global 50% pool / 50% empresa / 20% de empresa a referido.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Esquema: precio en USD
-- ---------------------------------------------------------------------
ALTER TABLE ship_blueprints
  ADD COLUMN IF NOT EXISTS price_usd numeric NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- 2. Sembrar un plano para CADA tipo de nave que aun no lo tenga
-- ---------------------------------------------------------------------
INSERT INTO ship_blueprints
  (code, ship_type_id, name, description, image_url, price_fxu, price_usd,
   is_active, is_droppable, expedition_drop_chance, drop_cooldown_seconds)
SELECT
  'bp_' || st.code,
  st.id,
  'Plano ' || st.name,
  'Plano permanente de ' || st.name ||
    '. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.',
  NULL,
  100000,
  CASE st.code
    WHEN 'small_cargo'        THEN 1
    WHEN 'large_cargo'        THEN 2
    WHEN 'colony_ship'        THEN 5
    WHEN 'recycler'           THEN 2
    WHEN 'espionage_probe'    THEN 1
    WHEN 'solar_satellite'    THEN 1
    WHEN 'light_fighter'      THEN 2
    WHEN 'heavy_fighter'      THEN 3
    WHEN 'cruiser'            THEN 5
    WHEN 'battleship'         THEN 8
    WHEN 'battlecruiser'      THEN 10
    WHEN 'bomber'             THEN 10
    WHEN 'destroyer'          THEN 12
    WHEN 'deathstar'          THEN 50
    WHEN 'nova'               THEN 15
    WHEN 'large_frigate'      THEN 12
    WHEN 'destruccion_masiva' THEN 40
    WHEN 'falco_x_clasica'    THEN 20
    WHEN 'mega_recycler'      THEN 10
    ELSE 5
  END,
  true, false, 0, 86400
FROM ship_types st
WHERE NOT EXISTS (
  SELECT 1 FROM ship_blueprints sb WHERE sb.ship_type_id = st.id
);

-- Precio USD para los 2 planos que ya existian (si aun estan en 0)
UPDATE ship_blueprints SET price_usd = 20 WHERE code = 'bp_falco_x_clasica' AND price_usd = 0;
UPDATE ship_blueprints SET price_usd = 10 WHERE code = 'bp_mega_recycler'   AND price_usd = 0;

-- ---------------------------------------------------------------------
-- 3. Compra de plano: precio USD -> TUNG, desbloqueo permanente, reparto global
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_ship_blueprint(p_blueprint_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_bp        ship_blueprints%ROWTYPE;
  v_balance   numeric;
  v_tung_usd  numeric;
  v_cost      numeric;
  v_already   integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_bp
  FROM ship_blueprints
  WHERE code = p_blueprint_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no disponible');
  END IF;

  -- Desbloqueo PERMANENTE: si ya lo tiene, no cobrar de nuevo
  SELECT COUNT(*)::integer INTO v_already
  FROM user_ship_blueprints
  WHERE user_id = v_user_id AND blueprint_id = v_bp.id;
  IF v_already > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes este plano desbloqueado');
  END IF;

  -- Coste en TUNG
  IF COALESCE(v_bp.price_usd, 0) > 0 THEN
    v_tung_usd := get_live_tung_price_usd();
    IF v_tung_usd IS NULL OR v_tung_usd <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Precio de TUNG no disponible en este momento, intenta mas tarde');
    END IF;
    v_cost := CEIL(v_bp.price_usd / v_tung_usd);
  ELSE
    v_cost := COALESCE(v_bp.price_fxu, 0);
  END IF;

  IF v_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este plano no tiene precio configurado');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance
  FROM profiles WHERE id = v_user_id FOR UPDATE;

  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente',
      'required', v_cost, 'balance', v_balance);
  END IF;

  -- Debitar al usuario
  PERFORM _internal_set_fxu_context();
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_cost
  WHERE id = v_user_id;

  -- Reparto global: 50% pool de recompensas / 50% empresa / 20% de empresa a referido
  PERFORM distribute_spend_fee(
    v_cost,
    'blueprint',
    'blueprint_sale',
    v_user_id,
    'Plano: ' || v_bp.code,
    NULL
  );

  -- Registrar el plano (desbloqueo permanente)
  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    v_user_id,
    v_bp.id,
    'shop',
    jsonb_build_object('price_usd', v_bp.price_usd, 'cost_tung', v_cost)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Plano desbloqueado',
    'blueprint_code', v_bp.code,
    'cost', v_cost
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. Trigger de requisito: desbloqueo permanente (no consume planos)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_ship_blueprint_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id       uuid;
  v_blueprint_id   bigint;
  v_ship_name      text;
  v_shipyard_level integer;
  v_owned          integer;
  v_validation     jsonb;
BEGIN
  IF NEW.item_type <> 'ship' OR NEW.ship_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_owner_id FROM planets p WHERE p.id = NEW.planet_id;
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Hangar nivel 1 minimo siempre
  SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = NEW.planet_id AND bt.code = 'shipyard'
  LIMIT 1;

  IF COALESCE(v_shipyard_level, 0) < 1 THEN
    RAISE EXCEPTION 'Necesitas Hangar nivel 1 para construir esta nave.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Localizar plano de la nave
  SELECT sb.id, st.name INTO v_blueprint_id, v_ship_name
  FROM ship_blueprints sb
  JOIN ship_types st ON st.id = sb.ship_type_id
  WHERE sb.ship_type_id = NEW.ship_type_id AND sb.is_active = true
  LIMIT 1;

  -- Nave sin plano definido: sin restriccion extra
  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer INTO v_owned
  FROM user_ship_blueprints usb
  WHERE usb.user_id = v_owner_id AND usb.blueprint_id = v_blueprint_id;

  -- Desbloqueo PERMANENTE: con >= 1 plano solo se exige Hangar 1 + recursos.
  -- NO se consume el plano.
  IF v_owned >= 1 THEN
    RETURN NEW;
  END IF;

  -- Sin plano: requisitos completos de la nave
  v_validation := validate_ship_requirements(NEW.planet_id, NEW.ship_type_id);
  IF NOT COALESCE((v_validation->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'No cumples los requisitos para construir % sin su plano. Compra el plano para desbloquearla.',
      COALESCE(v_ship_name, 'esta nave')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. secure_add_to_shipyard_queue (4 args): con >= 1 plano basta Hangar 1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secure_add_to_shipyard_queue(p_planet_id uuid, p_item_type text, p_type_id integer, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_planet planets%ROWTYPE;
v_resources planet_resources%ROWTYPE;
v_shipyard_level integer;
v_nanite_level integer;
v_metal_cost bigint;
v_crystal_cost bigint;
v_deuterium_cost bigint;
v_build_time_per_unit integer;
v_queue_position integer;
v_validation jsonb;
v_game_speed integer;
v_ship_type ship_types%ROWTYPE;
v_defense_type defense_types%ROWTYPE;
v_existing_count integer;
v_queued_count integer;
v_silo_level integer;
v_silo_max integer;
v_current_ipm integer;
v_current_abm integer;
v_queued_ipm integer;
v_queued_abm integer;
v_total_missiles integer;
v_available_slots integer;
v_ipm_type_id integer;
v_abm_type_id integer;
v_blueprint_id bigint;
v_owned_blueprints integer;
v_has_enough_blueprints boolean;
BEGIN
IF auth.uid() IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
END IF;

IF is_user_in_vacation_mode(auth.uid()) THEN
RETURN jsonb_build_object('success', false, 'error', 'Cannot build ships or defenses while in vacation mode');
END IF;

IF p_quantity <= 0 OR p_quantity > 10000 THEN
RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
END IF;

SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
END IF;

IF p_item_type = 'ship' THEN
  -- Verificar si la nave tiene plano y si el usuario lo posee
  v_blueprint_id := NULL;
  v_owned_blueprints := 0;
  v_has_enough_blueprints := false;

  SELECT sb.id INTO v_blueprint_id
  FROM ship_blueprints sb
  WHERE sb.ship_type_id = p_type_id AND sb.is_active = true
  LIMIT 1;

  IF v_blueprint_id IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_owned_blueprints
    FROM user_ship_blueprints usb
    WHERE usb.user_id = auth.uid()
      AND usb.blueprint_id = v_blueprint_id;

    -- Desbloqueo PERMANENTE: con >= 1 plano basta (no se consume)
    v_has_enough_blueprints := v_owned_blueprints >= 1;
  END IF;

  -- Si no hay plano o no lo posee -> validar requisitos completos
  IF NOT v_has_enough_blueprints THEN
    v_validation := validate_ship_requirements(p_planet_id, p_type_id);
    IF NOT (v_validation->>'valid')::boolean THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
    END IF;
  ELSE
    -- Con el plano desbloqueado solo se exige Hangar >= 1
    SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = p_planet_id AND bt.code = 'shipyard';

    IF COALESCE(v_shipyard_level, 0) < 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Necesitas Hangar nivel 1 para construir esta nave');
    END IF;
  END IF;

  SELECT * INTO v_ship_type FROM ship_types WHERE id = p_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
  END IF;

  v_metal_cost := v_ship_type.metal_cost * p_quantity;
  v_crystal_cost := v_ship_type.crystal_cost * p_quantity;
  v_deuterium_cost := v_ship_type.deuterium_cost * p_quantity;

ELSIF p_item_type = 'defense' THEN
v_validation := validate_defense_requirements(p_planet_id, p_type_id);
IF NOT (v_validation->>'valid')::boolean THEN
RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
END IF;

SELECT * INTO v_defense_type FROM defense_types WHERE id = p_type_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Defense type not found');
END IF;

IF v_defense_type.max_per_planet IS NOT NULL THEN
SELECT COALESCE(pd.quantity, 0) INTO v_existing_count
FROM planet_defenses pd
WHERE pd.planet_id = p_planet_id AND pd.defense_type_id = p_type_id;

SELECT COALESCE(SUM(sq.quantity - sq.quantity_completed), 0) INTO v_queued_count
FROM shipyard_queue sq
WHERE sq.planet_id = p_planet_id AND sq.defense_type_id = p_type_id;

IF (COALESCE(v_existing_count, 0) + COALESCE(v_queued_count, 0) + p_quantity) > v_defense_type.max_per_planet THEN
RETURN jsonb_build_object('success', false, 'error', 'Maximum limit reached for this defense type');
END IF;
END IF;

IF v_defense_type.code IN ('anti_ballistic_missile', 'interplanetary_missile') THEN
SELECT COALESCE(pb.level, 0) INTO v_silo_level
FROM planet_buildings pb
JOIN building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_planet_id AND bt.code = 'missile_silo';

v_silo_level := COALESCE(v_silo_level, 0);
v_silo_max := v_silo_level * 10;

SELECT id INTO v_ipm_type_id FROM defense_types WHERE code = 'interplanetary_missile';
SELECT id INTO v_abm_type_id FROM defense_types WHERE code = 'anti_ballistic_missile';

SELECT COALESCE(pd.quantity, 0) INTO v_current_ipm
FROM planet_defenses pd
WHERE pd.planet_id = p_planet_id AND pd.defense_type_id = v_ipm_type_id;

SELECT COALESCE(pd.quantity, 0) INTO v_current_abm
FROM planet_defenses pd
WHERE pd.planet_id = p_planet_id AND pd.defense_type_id = v_abm_type_id;

SELECT COALESCE(SUM(sq.quantity - sq.quantity_completed), 0) INTO v_queued_ipm
FROM shipyard_queue sq
WHERE sq.planet_id = p_planet_id AND sq.defense_type_id = v_ipm_type_id;

SELECT COALESCE(SUM(sq.quantity - sq.quantity_completed), 0) INTO v_queued_abm
FROM shipyard_queue sq
WHERE sq.planet_id = p_planet_id AND sq.defense_type_id = v_abm_type_id;

v_total_missiles := COALESCE(v_current_ipm, 0) + COALESCE(v_current_abm, 0) + COALESCE(v_queued_ipm, 0) + COALESCE(v_queued_abm, 0);
v_available_slots := GREATEST(0, v_silo_max - v_total_missiles);

IF p_quantity > v_available_slots THEN
RETURN jsonb_build_object(
'success', false,
'error', format('Silo capacity exceeded. Level %s silo holds %s missiles. Available slots: %s', v_silo_level, v_silo_max, v_available_slots)
);
END IF;
END IF;

v_metal_cost := v_defense_type.metal_cost * p_quantity;
v_crystal_cost := v_defense_type.crystal_cost * p_quantity;
v_deuterium_cost := v_defense_type.deuterium_cost * p_quantity;
ELSE
RETURN jsonb_build_object('success', false, 'error', 'Invalid item type');
END IF;

SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
IF v_resources.metal < v_metal_cost OR v_resources.crystal < v_crystal_cost OR v_resources.deuterium < v_deuterium_cost THEN
RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
END IF;

SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
FROM planet_buildings pb
JOIN building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_planet_id AND bt.code = 'shipyard';

SELECT COALESCE(pb.level, 0) INTO v_nanite_level
FROM planet_buildings pb
JOIN building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';

v_game_speed := get_game_speed();

IF p_item_type = 'ship' THEN
v_build_time_per_unit := GREATEST(1, FLOOR(
(v_ship_type.metal_cost + v_ship_type.crystal_cost)
/ (2500.0 * (1 + COALESCE(v_shipyard_level, 0)))
* 3600
/ POWER(2, COALESCE(v_nanite_level, 0))
/ v_game_speed
));
ELSE
v_build_time_per_unit := GREATEST(1, FLOOR(
(v_defense_type.metal_cost + v_defense_type.crystal_cost)
/ (2500.0 * (1 + COALESCE(v_shipyard_level, 0)))
* 3600
/ POWER(2, COALESCE(v_nanite_level, 0))
/ v_game_speed
));
END IF;

-- VIP Plus: -10% shipyard construction time
IF is_user_plus(auth.uid()) THEN
  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * 0.90));
END IF;

UPDATE planet_resources
SET metal = metal - v_metal_cost,
crystal = crystal - v_crystal_cost,
deuterium = deuterium - v_deuterium_cost,
last_update = now()
WHERE planet_id = p_planet_id;

PERFORM auto_cancel_insufficient_listings(p_planet_id);

SELECT COALESCE(MAX(queue_position), 0) INTO v_queue_position
FROM shipyard_queue WHERE planet_id = p_planet_id;

INSERT INTO shipyard_queue (
planet_id, item_type, ship_type_id, defense_type_id,
quantity, quantity_completed,
metal_cost, crystal_cost, deuterium_cost,
build_time_per_unit, queue_position,
start_time, current_unit_end_time, status
) VALUES (
p_planet_id, p_item_type,
CASE WHEN p_item_type = 'ship' THEN p_type_id ELSE NULL END,
CASE WHEN p_item_type = 'defense' THEN p_type_id ELSE NULL END,
p_quantity, 0,
v_metal_cost, v_crystal_cost, v_deuterium_cost,
v_build_time_per_unit, v_queue_position + 1,
CASE WHEN v_queue_position = 0 THEN now() ELSE NULL END,
CASE WHEN v_queue_position = 0 THEN now() + (v_build_time_per_unit || ' seconds')::interval ELSE NULL END, 'building'
);

RETURN jsonb_build_object(
  'success', true,
  'metal_cost', v_metal_cost,
  'crystal_cost', v_crystal_cost,
  'deuterium_cost', v_deuterium_cost,
  'build_time_per_unit', v_build_time_per_unit,
  'used_blueprint', COALESCE(v_has_enough_blueprints, false)
);
END;
$function$;

-- ---------------------------------------------------------------------
-- 6. Admin: editar plano con precio en USD
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_ship_blueprint(text, text, text, text, numeric, boolean);

CREATE OR REPLACE FUNCTION public.admin_update_ship_blueprint(
  p_blueprint_code text,
  p_name text,
  p_description text,
  p_image_url text,
  p_price_usd numeric,
  p_is_active boolean,
  p_is_droppable boolean,
  p_expedition_drop_chance numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF COALESCE(p_price_usd, 0) < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El precio USD no puede ser negativo');
  END IF;

  SELECT EXISTS (SELECT 1 FROM ship_blueprints WHERE code = p_blueprint_code) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no encontrado');
  END IF;

  UPDATE ship_blueprints
  SET name                   = COALESCE(NULLIF(p_name, ''), name),
      description             = COALESCE(p_description, description),
      image_url              = NULLIF(p_image_url, ''),
      price_usd              = COALESCE(p_price_usd, price_usd),
      is_active              = COALESCE(p_is_active, is_active),
      is_droppable           = COALESCE(p_is_droppable, is_droppable),
      expedition_drop_chance = COALESCE(p_expedition_drop_chance, expedition_drop_chance)
  WHERE code = p_blueprint_code;

  RETURN jsonb_build_object('success', true, 'message', 'Plano actualizado');
END;
$function$;

COMMIT;
