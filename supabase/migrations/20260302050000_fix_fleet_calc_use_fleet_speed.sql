/*
  # Fix fleet_calc_flight_time to use fleet_speed instead of game_speed

  1. Changes
    - Changes get_game_speed() to get_fleet_speed() in fleet_calc_flight_time
    - This aligns backend calculation with frontend (which already uses fleet_speed)

  2. Safety
    - CREATE OR REPLACE on existing function (same name, same parameters)
    - No tables, columns or names changed
    - get_fleet_speed() already exists (created in migration 078)
    - If game_speed == fleet_speed, behavior is identical
*/

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
  
  v_fleet_speed := get_fleet_speed();
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
