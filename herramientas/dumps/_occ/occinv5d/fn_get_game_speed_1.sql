CREATE OR REPLACE FUNCTION public.get_game_speed()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_speed decimal;
BEGIN
  SELECT game_speed INTO v_speed 
  FROM admin_speed_settings 
  WHERE id = 1;

  RETURN COALESCE(v_speed::integer, 10);
END;
$function$

