/*
  # Admiral Fleet Speed Bonus: +20% faster fleets

  Adds a 20% fleet speed bonus to the Admiral officer.
  Previously the Admiral only gave +2 fleet slots.
  Now it also reduces flight time by 20% (divides time by 1.2).

  ## Changes:
  1. Update `fleet_calc_flight_time` to accept optional admiral bonus parameter
  2. Update `secure_send_fleet` to pass admiral bonus to flight time calculation
  3. Update `join_acs_with_fleet` to pass admiral bonus to flight time calculation
  4. Update `get_user_officer_bonuses` to return 0.2 for admiral fleetSpeed
  5. Update admiral description and secondary bonus in officer_types

  ## Safety:
  - The 4th parameter has DEFAULT 0, so all existing callers still work
  - No table/column renames
  - No breaking changes
*/

-- ==========================================================================
-- 1. Update fleet_calc_flight_time with optional admiral speed bonus
-- ==========================================================================
CREATE OR REPLACE FUNCTION fleet_calc_flight_time(
  p_distance int,
  p_slowest_speed int,
  p_speed_percent int,
  p_admiral_bonus numeric DEFAULT 0
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet_speed numeric;
  v_effective_speed numeric;
  v_flight_time int;
BEGIN
  IF p_slowest_speed <= 0 THEN
    RETURN 0;
  END IF;
  
  v_fleet_speed := get_fleet_speed();
  v_effective_speed := p_slowest_speed * (p_speed_percent::numeric / 100);
  
  v_flight_time := GREATEST(
    10,
    ROUND(
      (35000::numeric / (p_speed_percent::numeric / 100) * 
       SQRT(p_distance::numeric * 10 / v_effective_speed) + 10) / v_fleet_speed
    )
  );
  
  -- Apply admiral bonus: reduce flight time by the bonus percentage
  -- e.g. p_admiral_bonus = 0.2 means 20% faster → divide by 1.2
  IF p_admiral_bonus > 0 THEN
    v_flight_time := GREATEST(10, ROUND(v_flight_time::numeric / (1 + p_admiral_bonus)));
  END IF;
  
  RETURN v_flight_time;
END;
$$;

-- ==========================================================================
-- 2. Update secure_send_fleet to pass admiral bonus
-- ==========================================================================
CREATE OR REPLACE FUNCTION secure_send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy int,
  p_target_system int,
  p_target_position int,
  p_mission_type text,
  p_fleet_ships jsonb,
  p_cargo_metal bigint DEFAULT 0,
  p_cargo_crystal bigint DEFAULT 0,
  p_cargo_deuterium bigint DEFAULT 0,
  p_speed_percent int DEFAULT 100,
  p_target_type text DEFAULT 'planet'
) RETURNS jsonb
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
  v_admiral_speed_bonus numeric := 0;
  v_max_fleet_slots int;
  v_active_fleet_count int;
  v_profile record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
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

  IF p_target_type NOT IN ('planet', 'moon') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid target type');
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
  
  -- Admiral speed bonus: 20% faster fleets
  IF v_has_admiral THEN
    v_admiral_speed_bonus := 0.2;
  END IF;
  
  SELECT COUNT(*) INTO v_active_fleet_count 
  FROM fleets 
  WHERE user_id = v_user_id AND is_completed = false;
  
  IF v_active_fleet_count >= v_max_fleet_slots THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available fleet slots');
  END IF;
  
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
  
  SELECT id INTO v_colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
  SELECT id INTO v_recycler_type_id FROM ship_types WHERE code = 'recycler';
  SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';
  
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
  
  -- Pass admiral speed bonus to flight time calculation
  v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent, v_admiral_speed_bonus);
  
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
    p_mission_type,
    p_target_type
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
    target_type,
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
    p_target_type,
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
    'fuel_consumption', v_fuel_consumption
  );
END;
$$;

-- ==========================================================================
-- 3. Update join_acs_with_fleet to pass admiral bonus
--    Read latest version and add admiral speed bonus
-- ==========================================================================
-- We only update the flight time calculation part.
-- Since join_acs_with_fleet already checks v_has_admiral, we just need to
-- add the speed bonus pass-through. We do this by creating a wrapper approach:
-- The function already has v_has_admiral, so we add the bonus variable and pass it.

-- First, let's add admiral bonus to the existing join_acs_with_fleet
DO $$
DECLARE
  v_func_body text;
BEGIN
  -- Get the current function body
  SELECT prosrc INTO v_func_body
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'join_acs_with_fleet'
    AND n.nspname = 'public';
  
  IF v_func_body IS NOT NULL THEN
    -- Replace the fleet_calc_flight_time call to include admiral bonus
    -- The pattern is: fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent)
    -- We want:        fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent, CASE WHEN v_has_admiral THEN 0.2 ELSE 0 END)
    v_func_body := replace(
      v_func_body,
      'fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent)',
      'fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent, CASE WHEN v_has_admiral THEN 0.2 ELSE 0 END)'
    );
    
    -- Recreate the function with the updated body
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION join_acs_with_fleet(
        p_acs_id uuid,
        p_origin_planet_id uuid,
        p_fleet_ships jsonb,
        p_speed_percent int DEFAULT 100
      ) RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $func$ %s $func$',
      v_func_body
    );
  END IF;
END $$;

-- ==========================================================================
-- 4. Update get_user_officer_bonuses to return 0.2 for admiral
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_user_officer_bonuses(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonuses jsonb := '{"mineProduction": 0, "energyProduction": 0, "fleetSpeed": 0, "researchSpeed": 0, "buildingQueueSlots": 0}'::jsonb;
  v_officer RECORD;
BEGIN
  FOR v_officer IN
    SELECT ot.code, uo.expires_at
    FROM user_officers uo
    JOIN officer_types ot ON ot.id = uo.officer_type_id
    WHERE uo.user_id = p_user_id
      AND (uo.expires_at IS NULL OR uo.expires_at > now())
  LOOP
    CASE v_officer.code
      WHEN 'geologist' THEN
        v_bonuses := jsonb_set(v_bonuses, '{mineProduction}', '0.1'::jsonb);
      WHEN 'engineer' THEN
        v_bonuses := jsonb_set(v_bonuses, '{energyProduction}', '0.1'::jsonb);
      WHEN 'admiral' THEN
        v_bonuses := jsonb_set(v_bonuses, '{fleetSpeed}', '0.2'::jsonb);
      WHEN 'technocrat' THEN
        v_bonuses := jsonb_set(v_bonuses, '{researchSpeed}', '0.25'::jsonb);
      WHEN 'commander' THEN
        v_bonuses := jsonb_set(v_bonuses, '{buildingQueueSlots}', '2'::jsonb);
      ELSE NULL;
    END CASE;
  END LOOP;
  
  RETURN v_bonuses;
END;
$$;

-- ==========================================================================
-- 5. Update admiral description and add secondary bonus in officer_types
-- ==========================================================================
UPDATE officer_types
SET 
  description = 'Aumenta los slots de flota disponibles en 2. Aumenta la velocidad de las flotas en un 20%.',
  bonus_secondary_type = 'fleet_speed_bonus',
  bonus_secondary_value = 20
WHERE code = 'admiral';
