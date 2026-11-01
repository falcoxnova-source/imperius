CREATE OR REPLACE FUNCTION public.check_pending_acs_attacks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acs RECORD;
BEGIN
  FOR v_acs IN
    SELECT id FROM acs_fleets 
    WHERE status = 'waiting' AND is_active = true AND arrival_time <= NOW()
  LOOP
    PERFORM process_acs_fleet_arrival(v_acs.id);
  END LOOP;
END;
$function$

