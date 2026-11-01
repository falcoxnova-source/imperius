/*
  # Temporary Attack Cooldown - 16 Hours

  ## Purpose
  Temporarily disable all offensive actions (fleet attacks and missile launches)
  for 16 hours from migration application time. After the deadline, attacks
  automatically re-enable without any further changes needed.

  ## Changes
  1. Stores cooldown deadline in `game_settings` table
  2. Creates helper functions: `get_attack_cooldown_end()`, `is_attack_cooldown_active()`
  3. Adds cooldown check to `secure_send_fleet` for 'attack' mission type
  4. Adds cooldown check to `launch_missiles`

  ## Impact
  - Only blocks NEW offensive fleet missions (attack) and missile launches
  - Transport, deploy, colonize, espionage, recycle, expedition missions are NOT affected
  - Existing fleets in flight are NOT affected
  - After 16 hours, everything resumes automatically
*/

-- 1. Store the cooldown deadline
INSERT INTO game_settings (key, value)
VALUES ('attack_cooldown_end', (now() + interval '16 hours')::text)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Helper: get the deadline timestamp (callable from frontend via RPC)
CREATE OR REPLACE FUNCTION get_attack_cooldown_end()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value::timestamptz FROM game_settings WHERE key = 'attack_cooldown_end'),
    '2000-01-01T00:00:00Z'::timestamptz
  );
$$;

GRANT EXECUTE ON FUNCTION get_attack_cooldown_end() TO authenticated;

-- 3. Helper: check if cooldown is active
CREATE OR REPLACE FUNCTION is_attack_cooldown_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT now() < get_attack_cooldown_end();
$$;

-- 4. Update secure_send_fleet with cooldown check
CREATE OR REPLACE FUNCTION secure_send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text,
  p_fleet_ships jsonb,
  p_speed_percent integer DEFAULT 100,
  p_cargo_metal bigint DEFAULT 0,
  p_cargo_crystal bigint DEFAULT 0,
  p_cargo_deuterium bigint DEFAULT 0
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
  v_expedition_fee bigint := 0;
  v_active_expeditions int;
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

  IF p_mission_type = 'expedition' THEN
    SELECT COUNT(*) INTO v_active_expeditions
    FROM fleets
    WHERE user_id = v_user_id 
      AND mission_type = 'expedition' 
      AND is_completed = false;

    IF v_active_expeditions > 0 THEN
      SELECT COALESCE(value::bigint, 0) INTO v_expedition_fee
      FROM game_settings WHERE key = 'expedition_extra_fee';

      v_expedition_fee := v_expedition_fee * v_active_expeditions;

      IF v_profile.fxu_balance < v_expedition_fee THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU for expedition fee: ' || v_expedition_fee);
      END IF;

      UPDATE profiles 
      SET fxu_balance = fxu_balance - v_expedition_fee 
      WHERE id = v_user_id;
    END IF;
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

  RETURN jsonb_build_object(
    'success', true,
    'fleet_id', v_fleet_id,
    'arrival_time', v_arrival_time,
    'return_time', v_return_time,
    'flight_time', v_flight_time,
    'fuel_consumption', v_fuel_consumption,
    'expedition_fee', v_expedition_fee
  );
END;
$$;

GRANT EXECUTE ON FUNCTION secure_send_fleet(uuid, integer, integer, integer, text, jsonb, integer, bigint, bigint, bigint) TO authenticated;

-- 5. Update launch_missiles with cooldown check
CREATE OR REPLACE FUNCTION launch_missiles(
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_missile_count integer,
  p_primary_target text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin_planet record;
  v_target_planet record;
  v_target_owner record;
  v_attacker_id uuid;
  v_attacker_profile record;
  v_available_missiles integer;
  v_abm_count integer;
  v_effective_missiles integer;
  v_silo_level integer;
  v_impulse_level integer;
  v_max_range integer;
  v_actual_distance integer;
  v_destroyed_defenses jsonb := '[]'::jsonb;
  v_defense_record record;
  v_remaining_damage integer;
  v_defense_destroyed integer;
  v_ipm_damage_per_missile CONSTANT integer := 12000;
  v_protection_check jsonb;
  v_bashing_check jsonb;
BEGIN
  IF is_attack_cooldown_active() THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Misiles temporalmente deshabilitados hasta ' ||
      to_char(get_attack_cooldown_end() AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC');
  END IF;

  SELECT p.*, p.user_id as owner_id
  INTO v_origin_planet
  FROM planets p
  WHERE p.id = p_origin_planet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta de origen no encontrado');
  END IF;

  v_attacker_id := v_origin_planet.owner_id;

  SELECT * INTO v_attacker_profile FROM profiles WHERE id = v_attacker_id;

  IF COALESCE(v_attacker_profile.vacation_mode, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes lanzar misiles en modo vacaciones');
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_silo_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_origin_planet_id AND bt.code = 'missile_silo';

  v_silo_level := COALESCE(v_silo_level, 0);

  IF v_silo_level < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas Silo de Misiles nivel 4 para lanzar misiles interplanetarios');
  END IF;

  SELECT COALESCE(ut.level, 0) INTO v_impulse_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = v_attacker_id AND tt.code = 'impulse_drive';

  v_impulse_level := COALESCE(v_impulse_level, 0);

  IF v_impulse_level < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas Motor de Impulso nivel 1 para lanzar misiles');
  END IF;

  v_max_range := (v_impulse_level * 5) - 1;

  SELECT COALESCE(pd.quantity, 0) INTO v_available_missiles
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = p_origin_planet_id AND dt.code = 'interplanetary_missile';

  v_available_missiles := COALESCE(v_available_missiles, 0);

  IF v_available_missiles < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes misiles interplanetarios');
  END IF;

  IF v_available_missiles < p_missile_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Solo tienes %s misiles interplanetarios disponibles', v_available_missiles)
    );
  END IF;

  IF v_origin_planet.galaxy != p_target_galaxy THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los misiles solo pueden alcanzar objetivos en la misma galaxia');
  END IF;

  v_actual_distance := ABS(v_origin_planet.solar_system - p_target_system);

  IF v_actual_distance > v_max_range THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Objetivo fuera de alcance. Motor de Impulso nivel %s permite %s sistemas. Distancia: %s sistemas.', 
        v_impulse_level, v_max_range, v_actual_distance)
    );
  END IF;

  SELECT p.* INTO v_target_planet
  FROM planets p
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay planeta en esas coordenadas');
  END IF;

  IF v_target_planet.user_id = v_attacker_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar tus propios planetas');
  END IF;

  IF v_target_planet.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El planeta objetivo no esta colonizado');
  END IF;

  SELECT * INTO v_target_owner FROM profiles WHERE id = v_target_planet.user_id;
  IF v_target_owner.vacation_mode = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'El jugador objetivo esta en modo vacaciones');
  END IF;

  v_protection_check := check_noob_protection(v_attacker_id, v_target_planet.user_id);
  IF NOT (v_protection_check->>'can_attack')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_protection_check->>'reason');
  END IF;

  v_bashing_check := check_bashing_limit(v_attacker_id, v_target_planet.user_id);
  IF NOT (v_bashing_check->>'allowed')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_bashing_check->>'reason');
  END IF;

  SELECT COALESCE(pd.quantity, 0) INTO v_abm_count
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = v_target_planet.id AND dt.code = 'anti_ballistic_missile';

  v_abm_count := COALESCE(v_abm_count, 0);

  v_effective_missiles := GREATEST(0, p_missile_count - v_abm_count);

  UPDATE planet_defenses pd
  SET quantity = quantity - p_missile_count
  FROM defense_types dt
  WHERE pd.defense_type_id = dt.id 
    AND pd.planet_id = p_origin_planet_id 
    AND dt.code = 'interplanetary_missile';

  IF v_abm_count > 0 THEN
    UPDATE planet_defenses pd
    SET quantity = GREATEST(0, quantity - LEAST(p_missile_count, v_abm_count))
    FROM defense_types dt
    WHERE pd.defense_type_id = dt.id 
      AND pd.planet_id = v_target_planet.id 
      AND dt.code = 'anti_ballistic_missile';
  END IF;

  INSERT INTO attack_log (attacker_id, defender_id, target_planet_id)
  VALUES (v_attacker_id, v_target_planet.user_id, v_target_planet.id);

  IF v_effective_missiles > 0 THEN
    v_remaining_damage := v_effective_missiles * v_ipm_damage_per_missile;

    FOR v_defense_record IN 
      SELECT pd.id, pd.quantity, dt.structural_integrity, dt.name, dt.code
      FROM planet_defenses pd
      JOIN defense_types dt ON pd.defense_type_id = dt.id
      WHERE pd.planet_id = v_target_planet.id 
        AND pd.quantity > 0
        AND dt.code NOT IN ('anti_ballistic_missile', 'interplanetary_missile')
      ORDER BY 
        CASE WHEN dt.code = p_primary_target THEN 0 ELSE 1 END,
        dt.structural_integrity ASC
    LOOP
      IF v_remaining_damage <= 0 THEN 
        EXIT; 
      END IF;

      v_defense_destroyed := LEAST(
        v_defense_record.quantity,
        FLOOR(v_remaining_damage::numeric / GREATEST(1, v_defense_record.structural_integrity))::integer
      );

      IF v_defense_destroyed > 0 THEN
        v_remaining_damage := v_remaining_damage - (v_defense_destroyed * v_defense_record.structural_integrity);

        UPDATE planet_defenses 
        SET quantity = quantity - v_defense_destroyed 
        WHERE id = v_defense_record.id;

        v_destroyed_defenses := v_destroyed_defenses || jsonb_build_object(
          'name', v_defense_record.name,
          'code', v_defense_record.code,
          'quantity', v_defense_destroyed
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'missiles_launched', p_missile_count,
    'missiles_intercepted', LEAST(v_abm_count, p_missile_count),
    'missiles_effective', v_effective_missiles,
    'total_damage', v_effective_missiles * v_ipm_damage_per_missile,
    'destroyed_defenses', v_destroyed_defenses,
    'impulse_level', v_impulse_level,
    'max_range', v_max_range
  );
END;
$$;
