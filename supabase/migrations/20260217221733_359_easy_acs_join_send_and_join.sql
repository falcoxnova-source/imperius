/*
  # Easy ACS Join - Send Fleet and Join ACS in One Step

  1. New Functions
    - `join_acs_with_fleet`: Sends a fleet to the ACS target and automatically joins the ACS
      in one atomic operation. This follows the original XNova/OGame flow where alliance members
      can select ships and join an ACS directly without having to first send a separate fleet.
    - Updated `get_available_acs_attacks`: Now also returns ACS attacks created by the user
      (marked as is_creator=true) so the creator can see participant count and status.

  2. How it works
    - Takes: origin planet, ship selection, speed percent, and the ACS ID to join
    - Server calculates distance, flight time, fuel, validates everything
    - Creates the fleet as attack mission targeting ACS coordinates
    - Joins the fleet to the ACS and syncs arrival times
    - All in one transaction - if anything fails, nothing happens

  3. Security
    - SECURITY DEFINER with search_path = public
    - Validates user owns the planet and ships
    - Validates user is in same alliance as ACS
    - Validates ACS is still active and accepting participants
    - All timestamps calculated server-side
*/

CREATE OR REPLACE FUNCTION join_acs_with_fleet(
  p_acs_id uuid,
  p_origin_planet_id uuid,
  p_fleet_ships jsonb,
  p_speed_percent int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_acs_record
  FROM acs_fleets
  WHERE id = p_acs_id
  AND is_active = true
  AND status = 'waiting'
  AND arrival_time > NOW();

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
  IF v_profile.is_vacation_mode THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes enviar flotas en modo vacaciones');
  END IF;

  IF p_speed_percent < 10 OR p_speed_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La velocidad debe ser entre 10 y 100');
  END IF;

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_origin_planet_id;
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

  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
  LOOP
    IF v_ship.quantity > 0 THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_ship.ship_type_id;
      IF v_ship_type IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave invalido: ' || v_ship.ship_type_id);
      END IF;

      SELECT * INTO v_planet_ship
      FROM planet_ships
      WHERE planet_id = p_origin_planet_id AND ship_type_id = v_ship.ship_type_id;

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

GRANT EXECUTE ON FUNCTION join_acs_with_fleet TO authenticated;

CREATE OR REPLACE FUNCTION get_available_acs_attacks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_alliance_id uuid;
  v_user_id uuid;
  v_acs_list jsonb;
BEGIN
  v_user_id := auth.uid();

  SELECT am.alliance_id INTO v_user_alliance_id
  FROM alliance_members am
  WHERE am.user_id = v_user_id;

  IF v_user_alliance_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'arrival_time')), '[]'::jsonb)
  INTO v_acs_list
  FROM (
    SELECT jsonb_build_object(
      'acs_id', af.id,
      'name', af.name,
      'creator_username', pr.username,
      'creator_id', af.creator_id,
      'target_coords', format('[%s:%s:%s]', af.target_galaxy, af.target_system, af.target_position),
      'target_galaxy', af.target_galaxy,
      'target_system', af.target_system,
      'target_position', af.target_position,
      'arrival_time', af.arrival_time,
      'current_participants', COALESCE(af.current_participants, 1),
      'max_participants', af.max_fleets,
      'is_creator', (af.creator_id = v_user_id),
      'already_joined', EXISTS(SELECT 1 FROM acs_participants ap2 WHERE ap2.acs_id = af.id AND ap2.user_id = v_user_id)
    ) AS row_data
    FROM acs_fleets af
    JOIN profiles pr ON af.creator_id = pr.id
    WHERE af.alliance_id = v_user_alliance_id
    AND af.is_active = true
    AND af.status = 'waiting'
    AND af.arrival_time > NOW()
  ) sub;

  RETURN v_acs_list;
END;
$$;
