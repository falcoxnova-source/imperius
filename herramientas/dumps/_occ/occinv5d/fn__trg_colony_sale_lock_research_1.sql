CREATE OR REPLACE FUNCTION public._trg_colony_sale_lock_research()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_starts boolean := false;
BEGIN
  -- [COLMKT5] investigacion activa con laboratorio en una colonia en venta
  IF COALESCE(NEW.is_researching, false) AND NEW.research_planet_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      v_starts := true;
    ELSE
      v_starts := NOT COALESCE(OLD.is_researching, false)
                  OR OLD.research_planet_id IS DISTINCT FROM NEW.research_planet_id;
    END IF;
    IF v_starts AND public._colony_listed_since(NEW.research_planet_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.';
    END IF;
  END IF;
  RETURN NEW;
END
$function$

