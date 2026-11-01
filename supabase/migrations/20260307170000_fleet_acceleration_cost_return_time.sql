/*
  # Fleet acceleration cost based on return trip duration

  ## Problem
  When a fleet is going outbound, cost = minutes_remaining_to_arrive * ratio.
  Players wait until the last few minutes to accelerate, paying almost nothing
  (e.g. 2 FXU) while the fleet arrives instantly AND gets a full return trip.

  ## Fix
  For outbound fleets: cost = return_trip_duration * ratio (return_time - arrival_time).
  This is always the same no matter when the player accelerates.
  For returning fleets: no change (still = remaining_return_time * ratio).

  ## What it changes
  - calculate_fxu_cost_fleet: 1 line change in outbound branch
  - No table changes, no column changes, no other function changes
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
  v_ratio numeric;
  v_cost numeric;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;

  IF v_fleet IS NULL OR v_fleet.is_completed THEN
    RETURN 0;
  END IF;

  IF v_fleet.is_returning THEN
    -- Returning: cost = remaining time to get home (unchanged)
    v_seconds_remaining := EXTRACT(EPOCH FROM (v_fleet.return_time - now()));
  ELSE
    -- Outbound: cost = full return trip duration (fixed price)
    v_seconds_remaining := EXTRACT(EPOCH FROM (v_fleet.return_time - v_fleet.arrival_time));
  END IF;

  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;

  v_minutes_remaining := v_seconds_remaining / 60.0;

  SELECT COALESCE(value::numeric, 1) INTO v_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';

  IF v_ratio <= 0 THEN
    v_ratio := 1;
  END IF;

  v_cost := v_minutes_remaining * v_ratio;

  RETURN GREATEST(1, CEIL(v_cost))::integer;
END;
$$;
