CREATE OR REPLACE FUNCTION public._trg_colony_sale_lock_autopilot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- [COLMKT5]
  IF public._colony_listed_since(NEW.id) IS NOT NULL THEN
    NEW.autopilot_enabled := false;
  END IF;
  RETURN NEW;
END
$function$

