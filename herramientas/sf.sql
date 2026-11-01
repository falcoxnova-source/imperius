CREATE OR REPLACE FUNCTION public.send_fleet(p_origin_planet_id uuid, p_target_galaxy integer, p_target_system integer, p_target_position integer, p_mission_type text, p_ships jsonb, p_cargo_metal numeric DEFAULT 0, p_cargo_crystal numeric DEFAULT 0, p_cargo_deuterium numeric DEFAULT 0, p_speed_percent integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$

