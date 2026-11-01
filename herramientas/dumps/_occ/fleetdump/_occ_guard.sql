CREATE OR REPLACE FUNCTION public._occ_guard(p_planet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_planet_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.occupations o WHERE o.planet_id = p_planet_id AND o.status = 'active') THEN
    RAISE EXCEPTION 'Este planeta está ocupado por otro jugador. Recupéralo atacando a la guarnición enemiga.' USING ERRCODE = 'P0001';
  END IF;
END
$function$

