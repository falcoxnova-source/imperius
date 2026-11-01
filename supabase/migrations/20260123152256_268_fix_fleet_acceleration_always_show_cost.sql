/*
  # Fix Fleet Acceleration Cost Calculation

  ## Problem
  The calculate_fxu_cost_fleet function was returning 0 when the remaining time
  was less than 1 second due to integer casting, causing the UI to show
  "La flota esta a punto de llegar" instead of showing the actual cost.

  ## Solution
  - Use numeric comparison instead of integer for seconds remaining
  - Always return at least 1 FXU if the fleet is valid and not completed
  - Only return 0 if the fleet has actually arrived (is_completed = true)
  - Remove the early return for 0 seconds and let the minimum cost apply

  ## Changes
  - Modified calculate_fxu_cost_fleet to always return at least 1 FXU for valid fleets
*/

CREATE OR REPLACE FUNCTION calculate_fxu_cost_fleet(p_fleet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet fleets%ROWTYPE;
  v_seconds_remaining numeric;
  v_total_flight_time numeric;
  v_time_ratio numeric;
  v_base_fuel_cost bigint;
  v_total_ship_value bigint := 0;
  v_fleet_ship RECORD;
  v_ship_type ship_types%ROWTYPE;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
  v_target_time timestamptz;
  v_start_time timestamptz;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
  
  IF v_fleet IS NULL THEN
    RETURN 0;
  END IF;
  
  IF v_fleet.is_completed THEN
    RETURN 0;
  END IF;
  
  IF v_fleet.is_returning THEN
    v_target_time := v_fleet.return_time;
    v_start_time := v_fleet.arrival_time;
  ELSE
    v_target_time := v_fleet.arrival_time;
    v_start_time := v_fleet.departure_time;
  END IF;
  
  v_seconds_remaining := EXTRACT(EPOCH FROM (v_target_time - now()));
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 1;
  END IF;
  
  v_total_flight_time := GREATEST(1, EXTRACT(EPOCH FROM (v_target_time - v_start_time)));
  v_time_ratio := GREATEST(0.01, v_seconds_remaining / v_total_flight_time);
  
  FOR v_fleet_ship IN 
    SELECT fs.ship_type_id, fs.quantity
    FROM fleet_ships fs
    WHERE fs.fleet_id = p_fleet_id
  LOOP
    SELECT * INTO v_ship_type FROM ship_types WHERE id = v_fleet_ship.ship_type_id;
    IF v_ship_type IS NOT NULL THEN
      v_total_ship_value := v_total_ship_value + (
        (COALESCE(v_ship_type.metal_cost, 0) + 
         COALESCE(v_ship_type.crystal_cost, 0) + 
         COALESCE(v_ship_type.deuterium_cost, 0)) * v_fleet_ship.quantity
      );
    END IF;
  END LOOP;
  
  v_total_ship_value := v_total_ship_value + 
    COALESCE(v_fleet.cargo_metal, 0) + 
    COALESCE(v_fleet.cargo_crystal, 0) + 
    COALESCE(v_fleet.cargo_deuterium, 0);
  
  v_total_ship_value := v_total_ship_value + COALESCE(v_fleet.fuel_consumption, 0);
  
  IF v_total_ship_value <= 0 THEN
    v_total_ship_value := 1000;
  END IF;
  
  v_resource_value := v_total_ship_value::numeric * (1 + (v_total_flight_time / 3600));
  
  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 5000;
  END IF;
  
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  v_fxu_cost := v_fxu_cost * v_time_ratio;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;
