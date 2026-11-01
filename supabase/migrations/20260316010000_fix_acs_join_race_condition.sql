-- Fix race conditions in join_acs_with_fleet and send_fleet functions
-- Similar to the fix applied for calculate_and_sync_resources
-- Problem: planet_ships, planet_resources, and acs_fleets are read without FOR UPDATE locks
-- This allows concurrent transactions to pass validation checks and then subtract ships/resources,
-- potentially resulting in negative quantities (ships disappearing)

-- 1. First, add CHECK constraints to prevent negative quantities
ALTER TABLE planet_ships DROP CONSTRAINT IF EXISTS planet_ships_quantity_non_negative;
ALTER TABLE planet_ships ADD CONSTRAINT planet_ships_quantity_non_negative CHECK (quantity >= 0);

ALTER TABLE planet_resources DROP CONSTRAINT IF EXISTS planet_resources_metal_non_negative;
ALTER TABLE planet_resources ADD CONSTRAINT planet_resources_metal_non_negative CHECK (metal >= 0);
ALTER TABLE planet_resources DROP CONSTRAINT IF EXISTS planet_resources_crystal_non_negative;
ALTER TABLE planet_resources ADD CONSTRAINT planet_resources_crystal_non_negative CHECK (crystal >= 0);
ALTER TABLE planet_resources DROP CONSTRAINT IF EXISTS planet_resources_deuterium_non_negative;
ALTER TABLE planet_resources ADD CONSTRAINT planet_resources_deuterium_non_negative CHECK (deuterium >= 0);

-- 2. Fix join_acs_with_fleet with proper locking
CREATE OR REPLACE FUNCTION join_acs_with_fleet(
  p_acs_id uuid,
  p_origin_planet_id uuid,
  p_fleet_ships jsonb,
  p_speed_percent integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_planet record;
  v_resources record;
  v_profile record;
  v_acs_record record;
  v_user_alliance uuid;
  v_distance int;
  v_slowest_speed int;
  v_flight_time int;
  v_fuel_consumption bigint;
  v_ship record;
  v_ship_type record;
  v_planet_ship record;
  v_total_cargo_capacity bigint := 0;
  v_fleet_id uuid;
  v_arrival_time timestamptz;
  v_return_time timestamptz;
  v_participant_count int;
  v_new_arrival timestamptz;
  v_computer_tech_level int := 0;
  v_has_admiral boolean;
  v_max_fleet_slots int;
  v_active_fleet_count int;
  v_target_planet record;
  v_protection_check jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Lock the ACS record to prevent concurrent joins exceeding max_fleets
  SELECT * INTO v_acs_record
  FROM acs_fleets
  WHERE id = p_acs_id
    AND is_active = true
    AND status = 'waiting'
    AND arrival_time > NOW()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ataque ACS no encontrado o ya no esta disponible');
  END IF;

  SELECT am.alliance_id INTO v_user_alliance
  FROM alliance_members am
  WHERE am.user_id = v_user_id;

  IF v_user_alliance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes pertenecer a una alianza');
  END IF;

  IF v_user_alliance != v_acs_record.alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo miembros de la misma alianza pueden unirse');
  END IF;

  SELECT * INTO v_target_planet
  FROM planets
  WHERE galaxy = v_acs_record.target_galaxy
    AND solar_system = v_acs_record.target_system
    AND position = v_acs_record.target_position
    AND NOT is_destroyed
  LIMIT 1;

  IF v_target_planet IS NOT NULL AND v_target_planet.user_id IS NOT NULL THEN
    IF v_target_planet.user_id = v_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar tu propio planeta');
    END IF;

    v_protection_check := check_noob_protection(v_user_id, v_target_planet.user_id);
    IF NOT COALESCE((v_protection_check->>'can_attack')::boolean, false) THEN
      RETURN jsonb_build_object('success', false, 'error', v_protection_check->>'reason');
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_participant_count FROM acs_participants WHERE acs_id = p_acs_id;
  IF v_participant_count >= v_acs_record.max_fleets THEN
    RETURN jsonb_build_object('success', false, 'error', 'El ataque ACS ya tiene el maximo de participantes');
  END IF;

  IF EXISTS (SELECT 1 FROM acs_participants WHERE acs_id = p_acs_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una flota en este ataque ACS');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_origin_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id;
  IF v_profile.vacation_mode THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes enviar flotas en modo vacaciones');
  END IF;

  IF p_speed_percent < 10 OR p_speed_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La velocidad debe ser entre 10 y 100');
  END IF;

  -- Lock planet_resources to prevent concurrent fuel depletion
  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_origin_planet_id FOR UPDATE;
  IF v_resources IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos del planeta no encontrados');
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
    RETURN jsonb_build_object('success', false, 'error', 'No tienes slots de flota disponibles');
  END IF;

  -- Validate and lock planet_ships FOR UPDATE to prevent concurrent ship subtraction
  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
  LOOP
    IF v_ship.quantity > 0 THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_ship.ship_type_id;
      IF v_ship_type IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave invalido: ' || v_ship.ship_type_id);
      END IF;

      -- FOR UPDATE lock to prevent race condition with concurrent fleet sends
      SELECT * INTO v_planet_ship
      FROM planet_ships
      WHERE planet_id = p_origin_planet_id AND ship_type_id = v_ship.ship_type_id
      FOR UPDATE;

      IF v_planet_ship IS NULL OR v_planet_ship.quantity < v_ship.quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Naves insuficientes: ' || v_ship_type.name);
      END IF;

      v_total_cargo_capacity := v_total_cargo_capacity + (v_ship_type.cargo_capacity * v_ship.quantity);
    END IF;
  END LOOP;

  v_distance := fleet_calc_distance(
    v_planet.galaxy, v_planet.solar_system, v_planet.position,
    v_acs_record.target_galaxy, v_acs_record.target_system, v_acs_record.target_position
  );

  v_slowest_speed := fleet_calc_slowest_speed(p_fleet_ships, v_user_id);
  IF v_slowest_speed <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se seleccionaron naves validas con velocidad');
  END IF;

  v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent);
  v_fuel_consumption := fleet_calc_fuel(p_fleet_ships, v_distance, p_speed_percent);

  IF v_resources.deuterium < v_fuel_consumption THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente para combustible');
  END IF;

  v_arrival_time := now() + (v_flight_time || ' seconds')::interval;
  v_return_time := now() + (v_flight_time * 2 || ' seconds')::interval;

  INSERT INTO fleets (
    user_id, origin_planet_id,
    target_galaxy, target_system, target_position,
    mission_type,
    cargo_metal, cargo_crystal, cargo_deuterium,
    departure_time, arrival_time, return_time,
    is_acs, acs_id
  ) VALUES (
    v_user_id, p_origin_planet_id,
    v_acs_record.target_galaxy, v_acs_record.target_system, v_acs_record.target_position,
    'attack',
    0, 0, 0,
    now(), v_arrival_time, v_return_time,
    true, p_acs_id
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
  SET deuterium = deuterium - v_fuel_consumption
  WHERE planet_id = p_origin_planet_id;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (p_acs_id, v_fleet_id, v_user_id);

  UPDATE acs_fleets
  SET current_participants = current_participants + 1
  WHERE id = p_acs_id;

  IF v_arrival_time > v_acs_record.arrival_time THEN
    v_new_arrival := v_arrival_time;
    UPDATE acs_fleets SET arrival_time = v_new_arrival WHERE id = p_acs_id;
    UPDATE fleets f
    SET arrival_time = v_new_arrival
    FROM acs_participants ap
    WHERE ap.acs_id = p_acs_id AND ap.fleet_id = f.id;
  ELSE
    v_new_arrival := v_acs_record.arrival_time;
    UPDATE fleets SET arrival_time = v_new_arrival WHERE id = v_fleet_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'fleet_id', v_fleet_id,
    'arrival_time', v_new_arrival,
    'flight_time', v_flight_time,
    'fuel_consumption', v_fuel_consumption,
    'message', 'Te has unido al ataque ACS exitosamente'
  );
END;
$$;

-- 3. Now fix send_fleet with the same FOR UPDATE locks on planet_ships and planet_resources
CREATE OR REPLACE FUNCTION send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text,
  p_ships jsonb,
  p_cargo_metal numeric DEFAULT 0,
  p_cargo_crystal numeric DEFAULT 0,
  p_cargo_deuterium numeric DEFAULT 0,
  p_speed_percent integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_origin_planet RECORD;
  v_distance numeric;
  v_slowest_speed integer;
  v_flight_time interval;
  v_fuel_consumption numeric;
  v_ship RECORD;
  v_ship_type RECORD;
  v_available_quantity integer;
  v_total_cargo_capacity numeric := 0;
  v_total_cargo numeric;
  v_fleet_id uuid;
  v_arrival_time timestamptz;
  v_return_time timestamptz;
  v_mission_validation jsonb;
  v_target_type text := 'planet';
  v_game_speed numeric;
  v_has_combat_ships boolean := false;
  v_only_probes boolean := true;
  v_probe_type_id integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_origin_planet FROM planets WHERE id = p_origin_planet_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado o no te pertenece');
  END IF;

  IF p_ships IS NULL OR jsonb_array_length(p_ships) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes seleccionar al menos una nave');
  END IF;

  -- Get espionage probe type id
  SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';

  v_slowest_speed := 999999999;
  FOR v_ship IN SELECT * FROM jsonb_array_elements(p_ships)
  LOOP
    SELECT * INTO v_ship_type FROM ship_types WHERE id = (v_ship->>'ship_type_id')::integer;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave no valido');
    END IF;

    -- FOR UPDATE lock to prevent race condition with concurrent fleet sends
    SELECT COALESCE(ps.quantity, 0) INTO v_available_quantity
    FROM planet_ships ps WHERE ps.planet_id = p_origin_planet_id AND ps.ship_type_id = v_ship_type.id
    FOR UPDATE;

    IF v_available_quantity < (v_ship->>'quantity')::integer THEN
      RETURN jsonb_build_object('success', false, 'error', format('No tienes suficientes %s', v_ship_type.name));
    END IF;

    v_total_cargo_capacity := v_total_cargo_capacity + (v_ship_type.cargo_capacity * (v_ship->>'quantity')::integer);
    IF v_ship_type.speed < v_slowest_speed THEN
      v_slowest_speed := v_ship_type.speed;
    END IF;

    IF v_ship_type.weapon > 0 THEN
      v_has_combat_ships := true;
    END IF;

    -- Check if this is NOT a probe
    IF v_ship_type.id != v_probe_type_id THEN
      v_only_probes := false;
    END IF;
  END LOOP;

  -- Block probe-only expeditions
  IF p_mission_type = 'expedition' AND v_only_probes THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes enviar expediciones solo con Sondas de Espionaje. Necesitas naves con capacidad de carga.');
  END IF;

  v_total_cargo := p_cargo_metal + p_cargo_crystal + p_cargo_deuterium;
  IF v_total_cargo > v_total_cargo_capacity THEN
    RETURN jsonb_build_object('success', false, 'error', format('Capacidad de carga excedida. Maximo: %s', floor(v_total_cargo_capacity)));
  END IF;

  v_mission_validation := validate_fleet_mission(v_user_id, p_origin_planet_id, p_target_galaxy, p_target_system, p_target_position, p_mission_type);
  IF NOT (v_mission_validation->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_mission_validation->>'reason');
  END IF;

  IF p_mission_type = 'colonize' THEN
    DECLARE
      v_colony_ship_id integer;
      v_has_colony_ship boolean := false;
    BEGIN
      SELECT id INTO v_colony_ship_id FROM ship_types WHERE code = 'colony_ship';
      FOR v_ship IN SELECT * FROM jsonb_array_elements(p_ships)
      LOOP
        IF (v_ship->>'ship_type_id')::integer = v_colony_ship_id AND (v_ship->>'quantity')::integer > 0 THEN
          v_has_colony_ship := true;
          EXIT;
        END IF;
      END LOOP;
      IF NOT v_has_colony_ship THEN
        RETURN jsonb_build_object('success', false, 'error', 'Necesitas una Nave Colonizadora para colonizar');
      END IF;
    END;
  END IF;

  IF p_mission_type = 'recycle' THEN
    DECLARE
      v_recycler_id integer;
      v_has_recycler boolean := false;
    BEGIN
      SELECT id INTO v_recycler_id FROM ship_types WHERE code = 'recycler';
      FOR v_ship IN SELECT * FROM jsonb_array_elements(p_ships)
      LOOP
        IF (v_ship->>'ship_type_id')::integer = v_recycler_id AND (v_ship->>'quantity')::integer > 0 THEN
          v_has_recycler := true;
          EXIT;
        END IF;
      END LOOP;
      IF NOT v_has_recycler THEN
        RETURN jsonb_build_object('success', false, 'error', 'Necesitas Recicladores para recolectar escombros');
      END IF;
    END;
  END IF;

  v_distance := calculate_distance(
    v_origin_planet.galaxy, v_origin_planet.solar_system, v_origin_planet.position,
    p_target_galaxy, p_target_system, p_target_position
  );

  SELECT COALESCE(
    (SELECT (value#>>'{}')::numeric FROM game_config WHERE key = 'fleet_speed'),
    1
  ) INTO v_game_speed;

  v_flight_time := calculate_flight_time(v_distance, v_slowest_speed, p_speed_percent, v_game_speed);

  v_fuel_consumption := 0;
  FOR v_ship IN SELECT * FROM jsonb_array_elements(p_ships)
  LOOP
    SELECT * INTO v_ship_type FROM ship_types WHERE id = (v_ship->>'ship_type_id')::integer;
    v_fuel_consumption := v_fuel_consumption +
      (1 + FLOOR(((v_ship_type.fuel_consumption * (v_ship->>'quantity')::integer) * v_distance) / 35000 * POWER(p_speed_percent::numeric / 100 + 1, 2)));
  END LOOP;

  -- Lock planet_resources FOR UPDATE to prevent concurrent fuel depletion
  DECLARE
    v_current_deuterium numeric;
  BEGIN
    SELECT deuterium INTO v_current_deuterium FROM planet_resources WHERE planet_id = p_origin_planet_id FOR UPDATE;
    IF v_current_deuterium < (v_fuel_consumption + p_cargo_deuterium) THEN
      RETURN jsonb_build_object('success', false, 'error', format('No tienes suficiente deuterio. Necesitas: %s (combustible) + %s (carga)', floor(v_fuel_consumption), floor(p_cargo_deuterium)));
    END IF;
  END;

  UPDATE planet_resources
  SET metal = metal - p_cargo_metal,
      crystal = crystal - p_cargo_crystal,
      deuterium = deuterium - p_cargo_deuterium - v_fuel_consumption
  WHERE planet_id = p_origin_planet_id;

  FOR v_ship IN SELECT * FROM jsonb_array_elements(p_ships)
  LOOP
    UPDATE planet_ships
    SET quantity = quantity - (v_ship->>'quantity')::integer
    WHERE planet_id = p_origin_planet_id AND ship_type_id = (v_ship->>'ship_type_id')::integer;
  END LOOP;

  IF p_mission_type = 'expedition' THEN
    v_target_type := 'deep_space';
  END IF;

  v_arrival_time := NOW() + v_flight_time;
  v_return_time := NOW() + (v_flight_time * 2);

  IF p_mission_type = 'expedition' THEN
    v_return_time := v_arrival_time + v_flight_time + INTERVAL '1 hour';
  END IF;

  INSERT INTO fleets (
    user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type,
    mission_type, cargo_metal, cargo_crystal, cargo_deuterium,
    departure_time, arrival_time, return_time, is_returning, is_completed
  ) VALUES (
    v_user_id, p_origin_planet_id, p_target_galaxy, p_target_system, p_target_position, v_target_type,
    p_mission_type, p_cargo_metal, p_cargo_crystal, p_cargo_deuterium,
    NOW(), v_arrival_time, v_return_time, false, false
  ) RETURNING id INTO v_fleet_id;

  FOR v_ship IN SELECT * FROM jsonb_array_elements(p_ships)
  LOOP
    INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
    VALUES (v_fleet_id, (v_ship->>'ship_type_id')::integer, (v_ship->>'quantity')::integer);
  END LOOP;

  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'fleet_id', v_fleet_id,
    'arrival_time', v_arrival_time,
    'return_time', v_return_time,
    'fuel_consumption', floor(v_fuel_consumption),
    'expedition_charged', COALESCE((v_mission_validation->>'expedition_charged')::boolean, false),
    'expedition_fee', COALESCE((v_mission_validation->>'expedition_fee')::numeric, 0)
  );
END;
$$;
