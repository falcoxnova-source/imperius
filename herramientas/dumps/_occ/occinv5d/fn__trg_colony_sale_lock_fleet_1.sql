CREATE OR REPLACE FUNCTION public._trg_colony_sale_lock_fleet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- [COLMKT5] flotas que salen de la colonia o flotas propias hacia ella.
  -- Los regresos (is_returning) siempre se permiten.
  IF COALESCE(NEW.is_returning, false) THEN
    RETURN NEW;
  END IF;
  IF public._colony_listed_since(NEW.origin_planet_id) IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.planets c
       JOIN public.market_listings ml
         ON ml.planet_id = c.id AND ml.listing_type = 'colony' AND ml.status = 'active'
       WHERE c.user_id = NEW.user_id
         AND c.galaxy = NEW.target_galaxy
         AND c.solar_system = NEW.target_system
         AND c.position = NEW.target_position)
  THEN
    RAISE EXCEPTION 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.';
  END IF;
  RETURN NEW;
END
$function$

