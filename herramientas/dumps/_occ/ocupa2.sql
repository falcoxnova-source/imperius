-- =====================================================================
-- [OCUPA2] Visibilidad de ocupaciones: galaxia + selector de planetas
--  - get_occupation_overview: agrega temp_max / image_id (solo lectura)
--  - get_system_occupations: ocupaciones activas de un sistema (solo lectura)
--  - Texto del mensaje de ocupacion: ruta correcta del menu
-- =====================================================================
SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.get_occupation_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_occ jsonb;
  v_own jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'occupation_id', o.id,
    'planet_id', o.planet_id,
    'planet_name', p.name,
    'galaxy', p.galaxy, 'solar_system', p.solar_system, 'position', p.position,
    'image_id', p.image_id,
    'temp_max', p.temp_max,
    'owner_name', pr.username,
    'started_at', o.started_at,
    'garrison_ships', (SELECT COALESCE(SUM(fs.quantity), 0) FROM public.fleet_ships fs WHERE fs.fleet_id = o.garrison_fleet_id),
    'pending_builds', (SELECT count(*) FROM public.occupation_build_queue q WHERE q.occupation_id = o.id AND q.status = 'pending')
  ) ORDER BY o.started_at), '[]'::jsonb) INTO v_occ
  FROM public.occupations o
  JOIN public.planets p ON p.id = o.planet_id
  LEFT JOIN public.profiles pr ON pr.id = o.owner_id
  WHERE o.occupier_id = v_uid AND o.status = 'active';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'occupation_id', o.id,
    'planet_id', o.planet_id,
    'planet_name', p.name,
    'galaxy', p.galaxy, 'solar_system', p.solar_system, 'position', p.position,
    'image_id', p.image_id,
    'temp_max', p.temp_max,
    'occupier_name', pr.username,
    'started_at', o.started_at
  ) ORDER BY o.started_at), '[]'::jsonb) INTO v_own
  FROM public.occupations o
  JOIN public.planets p ON p.id = o.planet_id
  LEFT JOIN public.profiles pr ON pr.id = o.occupier_id
  WHERE o.owner_id = v_uid AND o.status = 'active';

  RETURN jsonb_build_object('success', true, 'as_occupier', v_occ, 'as_owner', v_own, 'max_active', 3);
END
$fn$;

-- Ocupaciones activas visibles en la vista de galaxia (dato publico: quien ocupa).
-- occupation_id solo se devuelve al propio ocupante.
CREATE OR REPLACE FUNCTION public.get_system_occupations(p_galaxy integer, p_system integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_list jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  IF p_galaxy IS NULL OR p_system IS NULL OR p_galaxy < 1 OR p_galaxy > 9 OR p_system < 1 OR p_system > 499 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coordenadas inválidas');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'planet_id', p.id,
    'position', p.position,
    'occupier_name', pr.username,
    'is_mine', o.occupier_id = v_uid,
    'is_my_planet', o.owner_id = v_uid,
    'occupation_id', CASE WHEN o.occupier_id = v_uid THEN o.id END,
    'started_at', o.started_at
  ) ORDER BY p.position), '[]'::jsonb) INTO v_list
  FROM public.occupations o
  JOIN public.planets p ON p.id = o.planet_id
  LEFT JOIN public.profiles pr ON pr.id = o.occupier_id
  WHERE o.status = 'active' AND p.galaxy = p_galaxy AND p.solar_system = p_system;

  RETURN jsonb_build_object('success', true, 'occupations', v_list);
END
$fn$;

REVOKE ALL ON FUNCTION public.get_system_occupations(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_occupations(integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_occupation_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_occupation_overview() TO authenticated;

-- Texto del mensaje al ocupar (solo cambia el texto mostrado)
DO $do$
DECLARE
  v_sig regprocedure;
  v_def text;
  v_old text := 'Gestiónalo desde Flota > Ocupaciones.';
  v_new text := 'Gestiónalo desde el menú Ocupaciones o desde tu selector de planetas.';
BEGIN
  SELECT p.oid::regprocedure INTO v_sig FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = '_occ_try_start';
  IF v_sig IS NULL THEN
    RAISE EXCEPTION '[OCUPA2] _occ_try_start no encontrada';
  END IF;
  v_def := pg_get_functiondef(v_sig);
  IF position(v_new IN v_def) > 0 THEN
    RAISE NOTICE '[OCUPA2] texto ya actualizado';
  ELSIF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) = 1 THEN
    EXECUTE replace(v_def, v_old, v_new);
    RAISE NOTICE '[OCUPA2] texto actualizado';
  ELSE
    RAISE EXCEPTION '[OCUPA2] texto original no encontrado exactamente una vez';
  END IF;
END
$do$;
