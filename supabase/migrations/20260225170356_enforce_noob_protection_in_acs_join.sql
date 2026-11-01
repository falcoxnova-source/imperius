/*
  # Enforce newbie protection when joining ACS attacks

  1. Problem
    - The 3 ACS join functions (join_acs_with_fleet, join_acs_attack x2) did NOT check
      newbie protection for the joining player vs the defender.
    - This allowed a high-point player to bypass newbie protection by joining an ACS
      created by an ally who IS within the valid attack range.

  2. Fix
    - All 3 functions now call check_noob_protection(joining_user, defender)
      before allowing the player to join the ACS.
    - If the joining player cannot attack the defender individually, they cannot
      join the ACS either.

  3. Functions modified
    - join_acs_with_fleet(uuid, uuid, jsonb, integer)
    - join_acs_attack(uuid, text) - invite code version
    - join_acs_attack(uuid, uuid) - fleet id version
*/

-- 1) Fix join_acs_with_fleet: add noob protection check
DROP FUNCTION IF EXISTS join_acs_with_fleet(uuid, uuid, jsonb, integer);

CREATE OR REPLACE FUNCTION join_acs_with_fleet(
  p_acs_id uuid,
  p_origin_planet_id uuid,
  p_fleet_ships jsonb,
  p_speed_percent integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
  v_target_planet record;
  v_protection_check jsonb;
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

-- 2) Fix join_acs_attack(uuid, text) - invite code version: add noob protection check
CREATE OR REPLACE FUNCTION join_acs_attack(
  p_fleet_id uuid,
  p_invite_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet RECORD;
  v_acs RECORD;
  v_user_alliance_id uuid;
  v_target_planet record;
  v_protection_check jsonb;
BEGIN
  SELECT f.*,
    p.galaxy as origin_galaxy,
    p.solar_system as origin_system,
    p.position as origin_position
  INTO v_fleet
  FROM fleets f
  JOIN planets p ON f.origin_planet_id = p.id
  WHERE f.id = p_fleet_id
    AND f.user_id = auth.uid()
    AND f.is_completed = false
    AND f.is_returning = false
    AND f.mission_type = 'attack';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada o no es un ataque valido');
  END IF;

  IF v_fleet.acs_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta flota ya es parte de un ACS');
  END IF;

  SELECT * INTO v_acs
  FROM acs_fleets
  WHERE invite_code = p_invite_code
    AND is_active = true
    AND status = 'waiting';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Codigo de invitacion invalido o ACS no disponible');
  END IF;

  SELECT am.alliance_id INTO v_user_alliance_id
  FROM alliance_members am
  WHERE am.user_id = auth.uid();

  IF v_user_alliance_id IS NULL OR v_user_alliance_id != v_acs.alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes pertenecer a la misma alianza para unirte al ACS');
  END IF;

  SELECT * INTO v_target_planet
  FROM planets
  WHERE galaxy = v_acs.target_galaxy
    AND solar_system = v_acs.target_system
    AND position = v_acs.target_position
    AND NOT is_destroyed
  LIMIT 1;

  IF v_target_planet IS NOT NULL AND v_target_planet.user_id IS NOT NULL THEN
    IF v_target_planet.user_id = auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar tu propio planeta');
    END IF;

    v_protection_check := check_noob_protection(auth.uid(), v_target_planet.user_id);
    IF NOT COALESCE((v_protection_check->>'can_attack')::boolean, false) THEN
      RETURN jsonb_build_object('success', false, 'error', v_protection_check->>'reason');
    END IF;
  END IF;

  IF v_acs.current_participants >= v_acs.max_fleets THEN
    RETURN jsonb_build_object('success', false, 'error', 'El ACS ya tiene el maximo de participantes');
  END IF;

  IF v_fleet.target_galaxy != v_acs.target_galaxy OR
     v_fleet.target_system != v_acs.target_system OR
     v_fleet.target_position != v_acs.target_position THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota debe ir al mismo destino que el ACS');
  END IF;

  IF v_fleet.arrival_time > v_acs.arrival_time THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu flota no puede llegar a tiempo para el ACS. Necesitas naves mas rapidas.');
  END IF;

  UPDATE fleets
  SET
    acs_id = v_acs.id,
    is_acs = true,
    arrival_time = v_acs.arrival_time,
    return_time = v_acs.arrival_time + (v_acs.arrival_time - departure_time)
  WHERE id = p_fleet_id;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (v_acs.id, p_fleet_id, auth.uid());

  UPDATE acs_fleets
  SET current_participants = current_participants + 1
  WHERE id = v_acs.id;

  RETURN jsonb_build_object(
    'success', true,
    'acs_id', v_acs.id,
    'message', format('Te has unido al ACS "%s". Tu flota llegara sincronizada con el grupo.', v_acs.name)
  );
END;
$$;

-- 3) Fix join_acs_attack(uuid, uuid) - fleet id version: add noob protection check
CREATE OR REPLACE FUNCTION join_acs_attack(
  p_acs_id uuid,
  p_fleet uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acs_record RECORD;
  v_fleet_record RECORD;
  v_user_id uuid;
  v_user_alliance uuid;
  v_new_arrival timestamptz;
  v_participant_count int;
  v_target_planet record;
  v_protection_check jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no autenticado');
  END IF;

  SELECT af.*, af.alliance_id as acs_alliance_id
  INTO v_acs_record
  FROM acs_fleets af
  WHERE af.id = p_acs_id
    AND af.is_active = true
    AND af.status = 'waiting'
    AND af.arrival_time > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ataque ACS no encontrado o ya no esta disponible');
  END IF;

  SELECT am.alliance_id INTO v_user_alliance
  FROM alliance_members am
  WHERE am.user_id = v_user_id;

  IF v_user_alliance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes pertenecer a una alianza');
  END IF;

  IF v_user_alliance != v_acs_record.acs_alliance_id THEN
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

  SELECT f.* INTO v_fleet_record
  FROM fleets f
  WHERE f.id = p_fleet
    AND f.user_id = v_user_id
    AND f.is_completed = false
    AND f.is_returning = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada o no te pertenece');
  END IF;

  IF v_fleet_record.target_galaxy != v_acs_record.target_galaxy OR
     v_fleet_record.target_system != v_acs_record.target_system OR
     v_fleet_record.target_position != v_acs_record.target_position THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota debe tener el mismo destino que el ataque ACS');
  END IF;

  IF v_fleet_record.mission_type != 'attack' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo flotas de ataque pueden unirse a ataques ACS');
  END IF;

  IF v_fleet_record.acs_id IS NOT NULL OR v_fleet_record.is_acs = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta flota ya pertenece a un ataque ACS');
  END IF;

  SELECT COUNT(*) INTO v_participant_count FROM acs_participants WHERE acs_id = p_acs_id;
  IF v_participant_count >= v_acs_record.max_fleets THEN
    RETURN jsonb_build_object('success', false, 'error', 'El ataque ACS ya tiene el maximo de participantes');
  END IF;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (p_acs_id, p_fleet, v_user_id);

  UPDATE fleets
  SET acs_id = p_acs_id, is_acs = true
  WHERE id = p_fleet;

  UPDATE acs_fleets
  SET current_participants = current_participants + 1
  WHERE id = p_acs_id;

  IF v_fleet_record.arrival_time > v_acs_record.arrival_time THEN
    v_new_arrival := v_fleet_record.arrival_time;
    UPDATE acs_fleets SET arrival_time = v_new_arrival WHERE id = p_acs_id;
    UPDATE fleets f
    SET arrival_time = v_new_arrival
    FROM acs_participants ap
    WHERE ap.acs_id = p_acs_id AND ap.fleet_id = f.id;
  ELSE
    UPDATE fleets SET arrival_time = v_acs_record.arrival_time WHERE id = p_fleet;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Te has unido al ataque ACS exitosamente'
  );
END;
$$;
