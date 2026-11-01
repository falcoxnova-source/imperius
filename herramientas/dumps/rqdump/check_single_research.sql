CREATE OR REPLACE FUNCTION public.check_single_research()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
IF NEW.is_researching = true AND (OLD.is_researching IS NULL OR OLD.is_researching = false) THEN
IF EXISTS (
SELECT 1 FROM public.user_technologies
WHERE user_id = NEW.user_id
AND is_researching = true
AND id != NEW.id
) THEN
RAISE EXCEPTION 'User already has a research in progress';
END IF;
END IF;
RETURN NEW;
END;
$function$

