CREATE OR REPLACE FUNCTION public.fleet_calc_flight_time(p_distance integer, p_slowest_speed integer, p_speed_percent integer)
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
  
  RETURN v_flight_time;
END;
$function$

