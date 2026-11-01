/*
  # Free Expeditions with XNova-style Astrophysics Limit

  1. Changes
    - Removes FXU fee from expeditions entirely
    - Adds xnova-authentic expedition slot limit based on Astrophysics level
    - Max expeditions = floor(sqrt(astrophysics_level))
    - Minimum 1 expedition slot if astrophysics >= 1

  2. Modified Functions
    - `secure_send_fleet` - Removed FXU fee block for expeditions, added astrophysics limit check
    - `validate_fleet_mission` - Replaced charge_expedition_fee call with astrophysics-based limit
    - `charge_expedition_fee` - Now always returns success with fee 0 (kept for compatibility)
*/

CREATE OR REPLACE FUNCTION charge_expedition_fee(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', true,
    'charged', false,
    'fee', 0,
    'message', 'Expediciones gratuitas'
  );
END;
$$;

CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_origin_planet_id uuid,
  p_target_galaxy int,
  p_target_system int,
  p_target_position int,
  p_mission_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
v_origin_planet RECORD;
v_target_planet RECORD;
v_target_user_id uuid;
v_bashing_check jsonb;
v_protection_check jsonb;
v_user_alliance_id uuid;
v_target_alliance_id uuid;
v_attacker_vacation boolean;
v_target_vacation boolean;
v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
v_max_colonies integer;
v_current_colonies integer;
v_astrophysics_level integer;
v_max_expeditions integer;
v_active_expeditions integer;
BEGIN

SELECT vacation_mode INTO v_attacker_vacation
FROM profiles WHERE id = p_user_id;

IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
RETURN jsonb_build_object(
'valid', false, 
'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
);
END IF;

SELECT * INTO v_origin_planet
FROM planets
WHERE id = p_origin_planet_id AND user_id = p_user_id;

IF NOT FOUND THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No tienes acceso a este planeta');
END IF;

SELECT alliance_id INTO v_user_alliance_id 
FROM alliance_members 
WHERE user_id = p_user_id;

IF p_mission_type = 'expedition' THEN
IF p_target_position != 16 THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
END IF;

SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
FROM user_technologies ut
JOIN technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

v_astrophysics_level := COALESCE(v_astrophysics_level, 0);
v_max_expeditions := FLOOR(SQRT(v_astrophysics_level::numeric));

IF v_max_expeditions < 1 AND v_astrophysics_level >= 1 THEN
  v_max_expeditions := 1;
END IF;

IF v_max_expeditions < 1 THEN
RETURN jsonb_build_object(
  'valid', false,
  'reason', 'Necesitas investigar Astrofisica para enviar expediciones'
);
END IF;

SELECT COUNT(*) INTO v_active_expeditions
FROM fleets
WHERE user_id = p_user_id
  AND mission_type = 'expedition'
  AND is_completed = false;

IF v_active_expeditions >= v_max_expeditions THEN
RETURN jsonb_build_object(
  'valid', false,
  'reason', format('Has alcanzado el maximo de expediciones simultaneas (%s). Investiga Astrofisica para desbloquear mas.', v_max_expeditions)
);
END IF;

RETURN jsonb_build_object('valid', true);
END IF;

IF p_mission_type = 'recycle' THEN
IF NOT EXISTS (
SELECT 1 FROM debris_fields
WHERE galaxy = p_target_galaxy
AND solar_system = p_target_system
AND position = p_target_position
AND (metal > 0 OR crystal > 0)
) THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No hay campo de escombros en esas coordenadas');
END IF;
RETURN jsonb_build_object('valid', true);
END IF;

SELECT * INTO v_target_planet
FROM planets
WHERE galaxy = p_target_galaxy
AND solar_system = p_target_system
AND position = p_target_position
AND NOT is_destroyed;

IF p_mission_type = 'colonize' THEN
IF v_target_planet IS NOT NULL THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Ya existe un planeta en esas coordenadas');
END IF;
IF p_target_position < 1 OR p_target_position > 15 THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Posicion invalida para colonizar');
END IF;

SELECT COUNT(*) INTO v_current_colonies
FROM planets WHERE user_id = p_user_id AND NOT is_destroyed;

SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
FROM user_technologies ut
JOIN technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

IF v_current_colonies >= v_max_colonies THEN
RETURN jsonb_build_object(
'valid', false, 
'reason', format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica.', v_max_colonies)
);
END IF;

RETURN jsonb_build_object('valid', true);
END IF;

IF v_target_planet IS NOT NULL AND p_mission_type = ANY(v_hostile_missions) THEN
SELECT vacation_mode INTO v_target_vacation
FROM profiles WHERE id = v_target_planet.user_id;

IF COALESCE(v_target_vacation, false) THEN
RETURN jsonb_build_object(
'valid', false, 
'reason', 'No puedes atacar a jugadores en modo vacaciones'
);
END IF;
END IF;

IF p_mission_type IN ('attack', 'espionage') THEN
IF v_target_planet IS NULL THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
END IF;

IF v_target_planet.user_id = p_user_id THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tu propio planeta');
END IF;

IF p_mission_type = 'attack' THEN
v_bashing_check := check_bashing_rule(p_user_id, v_target_planet.user_id);
IF NOT (v_bashing_check->>'allowed')::boolean THEN
RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
END IF;
END IF;

v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
IF NOT (v_protection_check->>'allowed')::boolean THEN
RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
END IF;

RETURN jsonb_build_object('valid', true);
END IF;

IF p_mission_type = 'deploy' THEN
IF v_target_planet IS NULL THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
END IF;

IF v_target_planet.user_id != p_user_id THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes desplegar en tus propios planetas');
END IF;

RETURN jsonb_build_object('valid', true);
END IF;

IF p_mission_type = 'transport' THEN
IF v_target_planet IS NULL THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
END IF;

v_target_user_id := v_target_planet.user_id;

IF v_target_user_id = p_user_id THEN
RETURN jsonb_build_object('valid', true);
END IF;

IF v_user_alliance_id IS NULL THEN
RETURN jsonb_build_object(
'valid', false, 
'reason', 'Debes estar en una alianza para enviar recursos a otros jugadores. Usa "Desplegar" para tus propios planetas.'
);
END IF;

SELECT alliance_id INTO v_target_alliance_id 
FROM alliance_members 
WHERE user_id = v_target_user_id;

IF v_target_alliance_id IS NULL THEN
RETURN jsonb_build_object(
'valid', false, 
'reason', 'El jugador destino no pertenece a ninguna alianza. Solo puedes transportar a miembros de tu alianza.'
);
END IF;

IF v_target_alliance_id != v_user_alliance_id THEN
RETURN jsonb_build_object(
'valid', false, 
'reason', 'Solo puedes transportar recursos a miembros de tu alianza. El jugador destino no esta en tu alianza.'
);
END IF;

RETURN jsonb_build_object('valid', true);
END IF;

RETURN jsonb_build_object('valid', true);
END;
$$;

CREATE OR REPLACE FUNCTION secure_send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy int,
  p_target_system int,
  p_target_position int,
  p_mission_type text,
  p_fleet_ships jsonb,
  p_speed_percent int DEFAULT 100,
  p_cargo_metal bigint DEFAULT 0,
  p_cargo_crystal bigint DEFAULT 0,
  p_cargo_deuterium bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
v_user_id uuid;
v_planet record;
v_resources record;
v_distance int;
v_slowest_speed int;
v_flight_time int;
v_fuel_consumption bigint;
v_total_deut_needed bigint;
v_ship record;
v_ship_type record;
v_planet_ship record;
v_total_cargo_capacity bigint := 0;
v_total_cargo_used bigint;
v_fleet_id uuid;
v_arrival_time timestamptz;
v_return_time timestamptz;
v_validation jsonb;
v_has_required_ship boolean := true;
v_colony_ship_type_id int;
v_recycler_type_id int;
v_probe_type_id int;
v_computer_tech_level int := 0;
v_has_admiral boolean;
v_max_fleet_slots int;
v_active_fleet_count int;
v_profile record;
BEGIN
v_user_id := auth.uid();

IF v_user_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
END IF;

IF p_mission_type = 'attack' AND is_attack_cooldown_active() THEN
RETURN jsonb_build_object('success', false, 'error',
'Ataques temporalmente deshabilitados hasta ' ||
to_char(get_attack_cooldown_end() AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC');
END IF;

SELECT * INTO v_planet FROM planets WHERE id = p_origin_planet_id AND user_id = v_user_id;
IF v_planet IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned by user');
END IF;

SELECT * INTO v_profile FROM profiles WHERE id = v_user_id;
IF v_profile IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
END IF;

IF v_profile.vacation_mode THEN
RETURN jsonb_build_object('success', false, 'error', 'Cannot send fleets in vacation mode');
END IF;

IF p_speed_percent < 10 OR p_speed_percent > 100 THEN
RETURN jsonb_build_object('success', false, 'error', 'Speed must be between 10 and 100');
END IF;

IF p_mission_type NOT IN ('attack', 'transport', 'deploy', 'colonize', 'espionage', 'recycle', 'expedition') THEN
RETURN jsonb_build_object('success', false, 'error', 'Invalid mission type');
END IF;

IF p_mission_type = 'expedition' AND p_target_position != 16 THEN
RETURN jsonb_build_object('success', false, 'error', 'Expeditions must target position 16');
END IF;

IF p_mission_type != 'expedition' AND p_target_position = 16 THEN
RETURN jsonb_build_object('success', false, 'error', 'Only expeditions can target position 16');
END IF;

SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_origin_planet_id;
IF v_resources IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Planet resources not found');
END IF;

SELECT COALESCE(
(SELECT level FROM user_technologies ut 
JOIN technology_types tt ON ut.technology_type_id = tt.id 
WHERE ut.user_id = v_user_id AND tt.code = 'computer_tech'), 0
) INTO v_computer_tech_level;

v_has_admiral := has_active_officer(v_user_id, 'admiral');
v_max_fleet_slots := 1 + v_computer_tech_level + (CASE WHEN v_has_admiral THEN 2 ELSE 0 END);

SELECT COUNT(*) INTO v_active_fleet_count 
FROM fleets 
WHERE user_id = v_user_id AND is_completed = false;

IF v_active_fleet_count >= v_max_fleet_slots THEN
RETURN jsonb_build_object('success', false, 'error', 'No available fleet slots');
END IF;

SELECT id INTO v_colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
SELECT id INTO v_recycler_type_id FROM ship_types WHERE code = 'recycler';
SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';

FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
LOOP
IF v_ship.quantity > 0 THEN
SELECT * INTO v_ship_type FROM ship_types WHERE id = v_ship.ship_type_id;
IF v_ship_type IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Invalid ship type: ' || v_ship.ship_type_id);
END IF;

SELECT * INTO v_planet_ship 
FROM planet_ships 
WHERE planet_id = p_origin_planet_id AND ship_type_id = v_ship.ship_type_id;

IF v_planet_ship IS NULL OR v_planet_ship.quantity < v_ship.quantity THEN
RETURN jsonb_build_object('success', false, 'error', 'Not enough ships: ' || v_ship_type.name);
END IF;

v_total_cargo_capacity := v_total_cargo_capacity + (v_ship_type.cargo_capacity * v_ship.quantity);
END IF;
END LOOP;

IF p_mission_type = 'colonize' THEN
SELECT true INTO v_has_required_ship 
FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
WHERE x.ship_type_id = v_colony_ship_type_id AND x.quantity >= 1;
IF NOT COALESCE(v_has_required_ship, false) THEN
RETURN jsonb_build_object('success', false, 'error', 'Colonization requires a Colony Ship');
END IF;
END IF;

IF p_mission_type = 'recycle' THEN
SELECT true INTO v_has_required_ship 
FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
WHERE x.ship_type_id = v_recycler_type_id AND x.quantity >= 1;
IF NOT COALESCE(v_has_required_ship, false) THEN
RETURN jsonb_build_object('success', false, 'error', 'Recycling requires a Recycler');
END IF;
END IF;

IF p_mission_type = 'espionage' THEN
SELECT true INTO v_has_required_ship 
FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
WHERE x.ship_type_id = v_probe_type_id AND x.quantity >= 1;
IF NOT COALESCE(v_has_required_ship, false) THEN
RETURN jsonb_build_object('success', false, 'error', 'Espionage requires an Espionage Probe');
END IF;
END IF;

v_total_cargo_used := COALESCE(p_cargo_metal, 0) + COALESCE(p_cargo_crystal, 0) + COALESCE(p_cargo_deuterium, 0);
IF v_total_cargo_used > v_total_cargo_capacity THEN
RETURN jsonb_build_object('success', false, 'error', 'Cargo exceeds fleet capacity');
END IF;

v_distance := fleet_calc_distance(
v_planet.galaxy, v_planet.solar_system, v_planet.position,
p_target_galaxy, p_target_system, p_target_position
);

v_slowest_speed := fleet_calc_slowest_speed(p_fleet_ships, v_user_id);
IF v_slowest_speed <= 0 THEN
RETURN jsonb_build_object('success', false, 'error', 'No valid ships with speed selected');
END IF;

v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent);
v_fuel_consumption := fleet_calc_fuel(p_fleet_ships, v_distance, p_speed_percent);
v_total_deut_needed := v_fuel_consumption + COALESCE(p_cargo_deuterium, 0);

IF v_resources.deuterium < v_total_deut_needed THEN
RETURN jsonb_build_object('success', false, 'error', 'Insufficient deuterium for fuel and cargo');
END IF;

IF v_resources.metal < COALESCE(p_cargo_metal, 0) THEN
RETURN jsonb_build_object('success', false, 'error', 'Insufficient metal for cargo');
END IF;

IF v_resources.crystal < COALESCE(p_cargo_crystal, 0) THEN
RETURN jsonb_build_object('success', false, 'error', 'Insufficient crystal for cargo');
END IF;

SELECT validate_fleet_mission INTO v_validation FROM validate_fleet_mission(
v_user_id,
p_origin_planet_id,
p_target_galaxy,
p_target_system,
p_target_position,
p_mission_type
);

IF v_validation IS NOT NULL AND NOT (v_validation->>'valid')::boolean THEN
RETURN jsonb_build_object('success', false, 'error', v_validation->>'reason');
END IF;

v_arrival_time := now() + (v_flight_time || ' seconds')::interval;
v_return_time := now() + (v_flight_time * 2 || ' seconds')::interval;

INSERT INTO fleets (
user_id,
origin_planet_id,
target_galaxy,
target_system,
target_position,
mission_type,
cargo_metal,
cargo_crystal,
cargo_deuterium,
departure_time,
arrival_time,
return_time
) VALUES (
v_user_id,
p_origin_planet_id,
p_target_galaxy,
p_target_system,
p_target_position,
p_mission_type,
COALESCE(p_cargo_metal, 0),
COALESCE(p_cargo_crystal, 0),
COALESCE(p_cargo_deuterium, 0),
now(),
v_arrival_time,
v_return_time
) RETURNING id INTO v_fleet_id;

FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
LOOP
IF v_ship.quantity > 0 THEN
INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
VALUES (v_fleet_id, v_ship.ship_type_id, v_ship.quantity);

UPDATE planet_ships
SET quantity = quantity - v_ship.quantity
WHERE planet_id = p_origin_planet_id AND ship_type_id = v_ship.ship_type_id;
END IF;
END LOOP;

UPDATE planet_resources
SET 
metal = metal - COALESCE(p_cargo_metal, 0),
crystal = crystal - COALESCE(p_cargo_crystal, 0),
deuterium = deuterium - v_total_deut_needed
WHERE planet_id = p_origin_planet_id;

IF p_mission_type = 'attack' THEN
BEGIN
PERFORM notify_alliance_attack_launched(
v_user_id,
p_target_galaxy,
p_target_system,
p_target_position,
v_arrival_time
);
EXCEPTION WHEN OTHERS THEN
RAISE NOTICE 'Alliance attack notification error: %', SQLERRM;
END;
END IF;

RETURN jsonb_build_object(
'success', true,
'fleet_id', v_fleet_id,
'arrival_time', v_arrival_time,
'return_time', v_return_time,
'flight_time', v_flight_time,
'fuel_consumption', v_fuel_consumption,
'expedition_fee', 0
);
END;
$$;
