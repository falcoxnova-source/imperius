CREATE OR REPLACE FUNCTION public.process_user_fleets(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
fleet_record RECORD;
BEGIN
FOR fleet_record IN
SELECT id FROM public.fleets
WHERE user_id = p_user_id
AND is_completed = false
AND (
(is_returning = false AND arrival_time <= NOW())
OR (is_returning = true AND return_time <= NOW())
)
LOOP
PERFORM public.process_fleet_arrival(fleet_record.id);
END LOOP;
END;
$function$

