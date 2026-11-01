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
v_speed_bonus numeric;
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
  -- Verificar si la nave tiene plano y cuantos posee el usuario
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

    v_has_enough_blueprints := v_owned_blueprints >= p_quantity;
  END IF;

  -- Si no hay plano o no tiene suficientes -> validar requisitos completos
  IF NOT v_has_enough_blueprints THEN
    v_validation := validate_ship_requirements(p_planet_id, p_type_id);
    IF NOT (v_validation->>'valid')::boolean THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
    END IF;
  ELSE
    -- Con planos suficientes solo se exige Hangar >= 1
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

-- Daily missions speed bonus
v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());
IF v_speed_bonus > 0 THEN
  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * (1 - v_speed_bonus)));
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
start_time, current_unit_end_time
) VALUES (
p_planet_id, p_item_type,
CASE WHEN p_item_type = 'ship' THEN p_type_id ELSE NULL END,
CASE WHEN p_item_type = 'defense' THEN p_type_id ELSE NULL END,
p_quantity, 0,
v_metal_cost, v_crystal_cost, v_deuterium_cost,
v_build_time_per_unit, v_queue_position + 1,
CASE WHEN v_queue_position = 0 THEN now() ELSE NULL END,
CASE WHEN v_queue_position = 0 THEN now() + (v_build_time_per_unit || ' seconds')::interval ELSE NULL END
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
$function$
