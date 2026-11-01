-- [COLMKT6] Niveles de edificios de una colonia publicada en el mercado (solo lectura).
-- Solo expone datos si el listado es de tipo colonia y esta activo. Requiere sesion.
CREATE OR REPLACE FUNCTION public.get_colony_listing_buildings(p_listing_id uuid)
RETURNS TABLE(code text, name text, category text, level integer, image_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT ml.planet_id INTO v_planet_id
  FROM market_listings ml
  WHERE ml.id = p_listing_id
    AND ml.listing_type = 'colony'
    AND ml.status = 'active'
    AND ml.planet_id IS NOT NULL;

  IF v_planet_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT bt.code, bt.name, bt.category, pb.level, bt.image_url
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = v_planet_id
    AND pb.level > 0
  ORDER BY bt.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_colony_listing_buildings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_colony_listing_buildings(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_colony_listing_buildings(uuid) TO authenticated;
