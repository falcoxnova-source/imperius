/*
  # Fix Fleet Acceleration Cost Calculation

  ## Problem
  The calculate_fxu_cost_fleet function ignores the admin-configured ratio
  (fxu_cost_ratio_fleet) and simply returns minutes as FXU cost.

  ## Solution
  Update the function to use the configured ratio where:
  - ratio = minutes per 1 FXU
  - Example: ratio 100 means 100 minutes = 1 FXU
  - If 200 minutes remain and ratio is 100, cost = 200/100 = 2 FXU

  ## Changes
  - Read fxu_cost_ratio_fleet from game_settings
  - Calculate cost as: minutes_remaining / ratio (rounded up)
  - Minimum cost is always 1 FXU
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
  v_minutes_remaining numeric;
  v_target_time timestamptz;
  v_ratio numeric;
  v_cost numeric;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;

  IF v_fleet IS NULL OR v_fleet.is_completed THEN
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
    RETURN 0;
  END IF;

  v_minutes_remaining := v_seconds_remaining / 60.0;

  SELECT COALESCE(value::numeric, 100) INTO v_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';

  IF v_ratio <= 0 THEN
    v_ratio := 100;
  END IF;

  v_cost := v_minutes_remaining / v_ratio;

  RETURN GREATEST(1, CEIL(v_cost))::integer;
END;
$$;
