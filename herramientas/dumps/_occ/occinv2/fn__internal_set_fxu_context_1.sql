CREATE OR REPLACE FUNCTION public._internal_set_fxu_context()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.fxu_update_allowed', 'shipyard_instant_complete', true);
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
END;
$function$

