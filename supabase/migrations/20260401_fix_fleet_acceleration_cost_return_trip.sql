/*
  # Fix fleet acceleration cost: outbound fleets must pay for full return trip

  ## Problem
  When accelerating an outbound fleet (going to attack), the cost was based on
  the REMAINING outbound time. For example, if only 1 minute left to arrive,
  the player paid ~50 FXU. But after arrival, the fleet attacks and then the
  return trip (which could be 60 minutes) was auto-completed for FREE within
  the same `accelerate_fleet()` call.

  Players exploited this by waiting until the last minute of outbound travel
  to accelerate, paying almost nothing but getting the full round trip
  (attack + instant return) done.

  ## Fix
  In `calculate_fxu_cost_fleet`:
  - **Outbound fleet**: Cost is based on the FULL one-way flight duration
    (= return trip time), regardless of how much outbound time remains.
    This is because accelerating an outbound fleet also auto-completes the return.
  - **Returning fleet**: Cost is based on the REMAINING return time (unchanged).
    This is fair because the player already paid for the outbound trip.

  ## Examples (with ratio = 50 FXU/min):
  - 60-min trip, 1 min left outbound: OLD = 50 FXU, NEW = 3,000 FXU
  - 60-min trip, 30 min left outbound: OLD = 1,500 FXU, NEW = 3,000 FXU
  - 60-min trip, 10 min left returning: Cost = 500 FXU (unchanged)
  - 60-min trip, 1 min left returning: Cost = 50 FXU (unchanged)
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
  v_user_id uuid;
  v_min_cost integer;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;

  IF v_fleet IS NULL OR v_fleet.is_completed THEN
    RETURN 0;
  END IF;

  IF v_fleet.is_returning THEN
    -- RETURNING: charge for remaining return time (normal behavior)
    v_seconds_remaining := EXTRACT(EPOCH FROM (v_fleet.return_time - now()));
  ELSE
    -- OUTBOUND: charge for FULL one-way flight duration (= return trip time)
    -- because accelerate_fleet() also auto-completes the return trip for free
    v_seconds_remaining := EXTRACT(EPOCH FROM (v_fleet.arrival_time - v_fleet.departure_time));
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

  -- VIP discount: 25% off fleet acceleration cost (NOT speed)
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL AND is_user_plus(v_user_id) THEN
    v_cost := v_cost * 0.75;
  END IF;

  -- Get minimum cost from settings
  SELECT COALESCE(value::integer, 10) INTO v_min_cost
  FROM game_settings WHERE key = 'fleet_acceleration_min_cost';

  RETURN GREATEST(COALESCE(v_min_cost, 10), CEIL(v_cost))::integer;
END;
$$;
