CREATE OR REPLACE FUNCTION public._colony_listed_since(p_planet_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- [COLMKT5]
  SELECT min(ml.created_at)
  FROM public.market_listings ml
  WHERE ml.listing_type = 'colony'
    AND ml.status = 'active'
    AND ml.planet_id IN (
      SELECT p_planet_id
      UNION ALL
      SELECT c.id
      FROM public.planets t
      JOIN public.planets c
        ON c.user_id = t.user_id
       AND c.galaxy = t.galaxy
       AND c.solar_system = t.solar_system
       AND c.position = t.position
       AND c.planet_type = 'planet'
      WHERE t.id = p_planet_id
        AND t.planet_type = 'moon'
    );
$function$

