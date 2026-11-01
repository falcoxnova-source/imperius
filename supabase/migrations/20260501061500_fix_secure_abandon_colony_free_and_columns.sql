/*
  # Fix secure_abandon_colony - free abandon + correct column names

  ## Problem
  La versión actual en la BD usa columnas inexistentes:
    - planets.owner_id (correcto: user_id)
    - planets.is_homeworld (correcto: is_main_planet)
    - profiles.homeworld_id (no existe)
    - planet_resources.metal/crystal/... directamente en planets
  Esto producía: column "owner_id" does not exist (42703) al abandonar colonia.

  Además, ahora el abandono debe ser GRATIS (sin coste FXU).

  ## Fix
  - Usa columnas correctas (user_id, is_main_planet).
  - Elimina cualquier cobro/transferencia FXU.
  - Mantiene todas las validaciones de seguridad (vacaciones, no homeworld,
    sin colas activas, sin flotas saliendo o entrando al planeta).
  - Borra dependencias y elimina el planeta limpiamente.
*/

CREATE OR REPLACE FUNCTION public.secure_abandon_colony(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_active_fleet_count integer;
  v_building_queue_count integer;
  v_shipyard_queue_count integer;
  v_research_on_planet boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_user_in_vacation_mode(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while in vacation mode');
  END IF;

  SELECT * INTO v_planet
  FROM planets
  WHERE id = p_planet_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  IF COALESCE(v_planet.is_main_planet, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon your homeworld');
  END IF;

  -- No allow abandoning a moon as a "colony" (lunas se gestionan aparte)
  IF v_planet.planet_type = 'moon' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon a moon');
  END IF;

  SELECT COUNT(*) INTO v_building_queue_count
  FROM building_queue
  WHERE planet_id = p_planet_id;

  IF v_building_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active building construction. Cancel it first.');
  END IF;

  SELECT COUNT(*) INTO v_shipyard_queue_count
  FROM shipyard_queue
  WHERE planet_id = p_planet_id;

  IF v_shipyard_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active shipyard production. Cancel it first.');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_technologies
    WHERE user_id = auth.uid()
      AND is_researching = true
      AND research_planet_id = p_planet_id
  ) INTO v_research_on_planet;

  IF v_research_on_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active research. Cancel research first.');
  END IF;

  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE origin_planet_id = p_planet_id
    AND COALESCE(is_completed, false) = false;

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active fleets. Recall all fleets first.');
  END IF;

  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE target_galaxy = v_planet.galaxy
    AND target_system = v_planet.solar_system
    AND target_position = v_planet.position
    AND COALESCE(is_completed, false) = false;

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while fleets are heading to it. Wait until they arrive.');
  END IF;

  -- Limpieza segura previa al borrado del planeta
  DELETE FROM research_queue WHERE planet_id = p_planet_id;
  DELETE FROM planet_buildings WHERE planet_id = p_planet_id;
  DELETE FROM planet_defenses WHERE planet_id = p_planet_id;
  DELETE FROM planet_ships WHERE planet_id = p_planet_id;
  DELETE FROM planet_resources WHERE planet_id = p_planet_id;

  DELETE FROM planets WHERE id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'planet_name', v_planet.name,
    'fxu_charged', 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.secure_abandon_colony(uuid) TO authenticated;
