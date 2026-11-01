CREATE OR REPLACE FUNCTION public.fleet_calc_flight_time(p_distance integer, p_slowest_speed integer, p_speed_percent integer, p_admiral_bonus numeric DEFAULT 0)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- e.g. p_admiral_bonus = 0.2 means 20% faster ??? divide by 1.2
  IF p_admiral_bonus > 0 THEN
    v_flight_time := GREATEST(10, ROUND(v_flight_time::numeric / (1 + p_admiral_bonus)));
  END IF;
  
  RETURN v_flight_time;
END;
$function$

