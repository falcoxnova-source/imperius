CREATE OR REPLACE FUNCTION public.check_building_queue_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
current_queue_count INTEGER;
max_slots INTEGER;
has_commander BOOLEAN;
BEGIN
SELECT COUNT(*) INTO current_queue_count
FROM public.building_queue
WHERE planet_id = NEW.planet_id;

SELECT EXISTS(
SELECT 1 FROM public.user_officers uo
JOIN public.officer_types ot ON uo.officer_type_id = ot.id
WHERE uo.user_id = (SELECT user_id FROM public.planets WHERE id = NEW.planet_id)
AND ot.code = 'commander'
AND uo.expires_at > NOW()
) INTO has_commander;

IF has_commander THEN
max_slots := 5;
ELSE
max_slots := 3;
END IF;

IF current_queue_count >= max_slots THEN
RAISE EXCEPTION 'Building queue is full (max % slots)', max_slots;
END IF;

RETURN NEW;
END;
$function$

