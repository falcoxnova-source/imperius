/*
  # Fix Fleet Acceleration - FXU per Minute

  ## Correct Logic
  The ratio represents FXU cost PER MINUTE of travel time:
  - ratio 1 = 1 FXU per minute (180 min = 180 FXU)
  - ratio 2 = 2 FXU per minute (180 min = 360 FXU)
  
  Formula: cost = minutes * ratio

  ## Changes
  - Update calculate_fxu_cost_fleet to multiply minutes by ratio
  - Update setting description
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

  SELECT COALESCE(value::numeric, 1) INTO v_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';

  IF v_ratio <= 0 THEN
    v_ratio := 1;
  END IF;

  v_cost := v_minutes_remaining * v_ratio;

  RETURN GREATEST(1, CEIL(v_cost))::integer;
END;
$$;

UPDATE game_settings 
SET description = 'FXU por cada minuto de viaje (ej: 1 = 1 FXU/min, 2 = 2 FXU/min)',
    value = '1'
WHERE key = 'fxu_cost_ratio_fleet';
