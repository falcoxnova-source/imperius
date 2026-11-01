/*
  # Simplify Fleet Acceleration Cost

  ## Problem
  The previous formula was too complex and returning 0 in many cases.
  
  ## New Simple Formula
  - FXU Cost = (remaining_hours * fxu_per_hour_setting) + minimum_base_cost
  - Example: 5 hours remaining with setting at 100 = 500 FXU minimum
  - Always returns at least 1 FXU for valid fleets
  
  ## Settings Used
  - fxu_cost_ratio_fleet: Now means "FXU cost per hour of remaining travel time"
  - fleet_acceleration_min_cost: Minimum base cost (new setting, defaults to 10)
  
  ## Changes
  - Rewrote calculate_fxu_cost_fleet with simpler time-based formula
  - Added minimum base cost setting
*/

INSERT INTO game_settings (key, value, description) VALUES
  ('fleet_acceleration_min_cost', '10', 'Minimum base FXU cost for fleet acceleration')
ON CONFLICT (key) DO NOTHING;

UPDATE game_settings 
SET description = 'FXU cost per hour of remaining travel time for fleet acceleration'
WHERE key = 'fxu_cost_ratio_fleet';

CREATE OR REPLACE FUNCTION calculate_fxu_cost_fleet(p_fleet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet fleets%ROWTYPE;
  v_seconds_remaining numeric;
  v_hours_remaining numeric;
  v_target_time timestamptz;
  v_fxu_per_hour numeric;
  v_min_cost numeric;
  v_fxu_cost numeric;
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
  ELSE
    v_target_time := v_fleet.arrival_time;
  END IF;
  
  IF v_target_time IS NULL THEN
    RETURN 1;
  END IF;
  
  v_seconds_remaining := EXTRACT(EPOCH FROM (v_target_time - now()));
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 1;
  END IF;
  
  v_hours_remaining := v_seconds_remaining / 3600.0;
  
  SELECT COALESCE(value::numeric, 100) INTO v_fxu_per_hour
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';
  
  SELECT COALESCE(value::numeric, 10) INTO v_min_cost
  FROM game_settings WHERE key = 'fleet_acceleration_min_cost';
  
  IF v_fxu_per_hour IS NULL OR v_fxu_per_hour <= 0 THEN
    v_fxu_per_hour := 100;
  END IF;
  
  IF v_min_cost IS NULL OR v_min_cost < 1 THEN
    v_min_cost := 10;
  END IF;
  
  v_fxu_cost := (v_hours_remaining * v_fxu_per_hour) + v_min_cost;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;
