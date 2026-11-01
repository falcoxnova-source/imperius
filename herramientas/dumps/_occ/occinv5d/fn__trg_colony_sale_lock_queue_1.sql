CREATE OR REPLACE FUNCTION public._trg_colony_sale_lock_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- [COLMKT5] colas de edificios / hangar / investigacion
  IF NEW.planet_id IS NOT NULL AND public._colony_listed_since(NEW.planet_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.';
  END IF;
  RETURN NEW;
END
$function$

