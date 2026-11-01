CREATE OR REPLACE FUNCTION public.fleet_calc_distance(p_origin_galaxy integer, p_origin_system integer, p_origin_position integer, p_target_galaxy integer, p_target_system integer, p_target_position integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

