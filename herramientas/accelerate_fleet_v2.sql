CREATE OR REPLACE FUNCTION public.accelerate_fleet_v2(p_fid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN accelerate_fleet(p_fid);
END;
$function$

