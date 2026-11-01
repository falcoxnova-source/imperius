-- OCUPA3: vista de solo lectura del planeta ocupado (para el ocupante)
-- Devuelve edificios (niveles), defensas actuales, almacenes/energia y datos fisicos.
-- No modifica nada. Solo el ocupante de una ocupacion activa puede leerla.

CREATE OR REPLACE FUNCTION public.get_occupation_planet_view(p_occupation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_occ occupations%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_res planet_resources%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_occ FROM occupations WHERE id = p_occupation_id;
  IF NOT FOUND OR v_occ.occupier_id <> v_uid OR v_occ.status <> 'active' THEN
    RAISE EXCEPTION 'Ocupacion no encontrada';
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = v_occ.planet_id;
  SELECT * INTO v_res FROM planet_resources WHERE planet_id = v_occ.planet_id;

  RETURN jsonb_build_object(
    'planet', jsonb_build_object(
      'diameter', v_planet.diameter,
      'fields_used', v_planet.fields_used,
      'fields_max', v_planet.fields_max,
      'temp_min', v_planet.temp_min,
      'temp_max', v_planet.temp_max,
      'planet_type', v_planet.planet_type
    ),
    'storage', jsonb_build_object(
      'metal_storage', COALESCE(v_res.metal_storage, 0),
      'crystal_storage', COALESCE(v_res.crystal_storage, 0),
      'deuterium_storage', COALESCE(v_res.deuterium_storage, 0),
      'energy_max', COALESCE(v_res.energy_max, 0),
      'energy_used', COALESCE(v_res.energy_used, 0)
    ),
    'buildings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bt.id, 'code', bt.code, 'name', bt.name, 'image_url', bt.image_url,
        'max_level', bt.max_level, 'level', COALESCE(pb.level, 0)
      ) ORDER BY bt.id)
      FROM building_types bt
      LEFT JOIN planet_buildings pb ON pb.building_type_id = bt.id AND pb.planet_id = v_occ.planet_id
    ), '[]'::jsonb),
    'defenses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'defense_type_id', pd.defense_type_id, 'quantity', pd.quantity
      ))
      FROM planet_defenses pd
      WHERE pd.planet_id = v_occ.planet_id AND pd.quantity > 0
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_occupation_planet_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_occupation_planet_view(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_occupation_planet_view(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
