/*
  # Secure Server-Side Fleet Dispatch
  
  1. Purpose
    - Move ALL timestamp calculations to the server
    - Prevent client-side time manipulation
    - Calculate flight time, arrival time, and return time using server's now()
  
  2. New Functions
    - `fleet_calc_distance` - Calculates distance between coordinates
    - `fleet_calc_slowest_speed` - Gets slowest ship speed in fleet
    - `fleet_calc_flight_time` - Calculates flight time in seconds
    - `fleet_calc_fuel` - Calculates total fuel needed
    - `secure_send_fleet` - Main function that validates and creates fleet with server timestamps
  
  3. Security
    - All timestamps calculated on server with now()
    - Client only sends: origin, target, ships, mission, cargo, speed_percent
    - Server validates everything before accepting
  
  4. Important Notes
    - Does NOT modify existing data or functions
    - Does NOT break existing fleet processing
    - Frontend will use new RPC instead of direct INSERT
*/

-- Function to calculate distance between coordinates (matches formulas.ts exactly)
CREATE OR REPLACE FUNCTION fleet_calc_distance(
  p_origin_galaxy int,
  p_origin_system int,
  p_origin_position int,
  p_target_galaxy int,
  p_target_system int,
  p_target_position int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_origin_galaxy != p_target_galaxy THEN
    RETURN ABS(p_origin_galaxy - p_target_galaxy) * 20000;
  END IF;
  
  IF p_origin_system != p_target_system THEN
    RETURN ABS(p_origin_system - p_target_system) * 95 + 2700;
  END IF;
  
  IF p_origin_position != p_target_position THEN
    RETURN ABS(p_origin_position - p_target_position) * 5 + 1000;
  END IF;
  
  RETURN 5;
END;
$$;

-- Function to get ship speed with technology bonuses
CREATE OR REPLACE FUNCTION fleet_calc_ship_speed(
  p_ship_code text,
  p_base_speed int,
  p_combustion_level int,
  p_impulse_level int,
  p_hyperspace_level int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus numeric := 0;
BEGIN
  IF p_base_speed = 0 OR p_base_speed IS NULL THEN
    RETURN 0;
  END IF;
  
  IF p_ship_code IN ('small_cargo', 'large_cargo', 'light_fighter', 'espionage_probe', 'recycler') THEN
    v_bonus := p_combustion_level * 0.10;
  ELSIF p_ship_code IN ('heavy_fighter', 'cruiser', 'battleship', 'battlecruiser', 'bomber', 'colony_ship') THEN
    v_bonus := p_impulse_level * 0.20;
  ELSIF p_ship_code IN ('destroyer', 'deathstar', 'pathfinder', 'star_destroyer', 'black_moon') THEN
    v_bonus := p_hyperspace_level * 0.30;
  END IF;
  
  RETURN FLOOR(p_base_speed * (1 + v_bonus));
END;
$$;

-- Function to calculate slowest ship speed in a fleet
CREATE OR REPLACE FUNCTION fleet_calc_slowest_speed(
  p_fleet_ships jsonb,
  p_user_id uuid
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_ship_type record;
  v_tech_combustion int := 0;
  v_tech_impulse int := 0;
  v_tech_hyperspace int := 0;
  v_speed int;
  v_slowest int := 999999999;
BEGIN
  SELECT COALESCE(
    (SELECT level FROM user_technologies ut 
     JOIN technology_types tt ON ut.technology_type_id = tt.id 
     WHERE ut.user_id = p_user_id AND tt.code = 'combustion_drive'), 0
  ) INTO v_tech_combustion;
  
  SELECT COALESCE(
    (SELECT level FROM user_technologies ut 
     JOIN technology_types tt ON ut.technology_type_id = tt.id 
     WHERE ut.user_id = p_user_id AND tt.code = 'impulse_drive'), 0
  ) INTO v_tech_impulse;
  
  SELECT COALESCE(
    (SELECT level FROM user_technologies ut 
     JOIN technology_types tt ON ut.technology_type_id = tt.id 
     WHERE ut.user_id = p_user_id AND tt.code = 'hyperspace_drive'), 0
  ) INTO v_tech_hyperspace;

  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
  LOOP
    IF v_ship.quantity > 0 THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_ship.ship_type_id;
      
      IF v_ship_type.base_speed > 0 THEN
        v_speed := fleet_calc_ship_speed(
          v_ship_type.code,
          v_ship_type.base_speed,
          v_tech_combustion,
          v_tech_impulse,
          v_tech_hyperspace
        );
        
        IF v_speed < v_slowest THEN
          v_slowest := v_speed;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  IF v_slowest = 999999999 THEN
    RETURN 0;
  END IF;
  
  RETURN v_slowest;
END;
$$;

-- Function to calculate flight time (matches formulas.ts exactly)
CREATE OR REPLACE FUNCTION fleet_calc_flight_time(
  p_distance int,
  p_slowest_speed int,
  p_speed_percent int
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
  
  v_fleet_speed := get_game_speed();
  v_effective_speed := p_slowest_speed * (p_speed_percent::numeric / 100);
  
  v_flight_time := GREATEST(
    10,
    ROUND(
      (35000::numeric / (p_speed_percent::numeric / 100) * 
       SQRT(p_distance::numeric * 10 / v_effective_speed) + 10) / v_fleet_speed
    )
  );
  
  RETURN v_flight_time;
END;
$$;

-- Function to calculate fuel consumption
CREATE OR REPLACE FUNCTION fleet_calc_fuel(
  p_fleet_ships jsonb,
  p_distance int,
  p_speed_percent int
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_ship_type record;
  v_total_fuel bigint := 0;
  v_ship_fuel numeric;
  v_distance_factor numeric;
  v_speed_factor numeric;
BEGIN
  v_distance_factor := p_distance::numeric / 35000;
  v_speed_factor := (p_speed_percent::numeric / 100) + 1;
  
  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
  LOOP
    IF v_ship.quantity > 0 THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_ship.ship_type_id;
      
      IF v_ship_type IS NOT NULL THEN
        v_ship_fuel := v_ship_type.fuel_consumption * v_ship.quantity * v_distance_factor * v_speed_factor;
        v_total_fuel := v_total_fuel + CEIL(v_ship_fuel);
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_total_fuel;
END;
$$;

-- Main secure fleet dispatch function
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
  p_speed_percent int DEFAULT 100
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
  
  SELECT * INTO v_planet FROM planets WHERE id = p_origin_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned by user');
  END IF;
  
  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  
  IF v_profile.is_vacation_mode THEN
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

GRANT EXECUTE ON FUNCTION fleet_calc_distance TO authenticated;
GRANT EXECUTE ON FUNCTION fleet_calc_ship_speed TO authenticated;
GRANT EXECUTE ON FUNCTION fleet_calc_slowest_speed TO authenticated;
GRANT EXECUTE ON FUNCTION fleet_calc_flight_time TO authenticated;
GRANT EXECUTE ON FUNCTION fleet_calc_fuel TO authenticated;
GRANT EXECUTE ON FUNCTION secure_send_fleet TO authenticated;
