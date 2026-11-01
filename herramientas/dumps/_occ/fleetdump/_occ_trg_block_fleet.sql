CREATE OR REPLACE FUNCTION public._occ_trg_block_fleet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT COALESCE(NEW.is_returning, false) AND NEW.origin_planet_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.occupations o
                 WHERE o.planet_id = NEW.origin_planet_id AND o.status = 'active' AND o.occupier_id <> NEW.user_id) THEN
    RAISE EXCEPTION 'Este planeta está ocupado por otro jugador. Recupéralo atacando a la guarnición enemiga.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$function$

