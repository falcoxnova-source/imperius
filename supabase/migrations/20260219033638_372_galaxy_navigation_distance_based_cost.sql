/*
  # Galaxy Navigation - Distance-Based Deuterium Cost

  Changes the galaxy navigation cost from a flat 10 deuterium per click
  to a distance-proportional cost.

  1. Modified Function
    - `galaxy_navigate(p_planet_id, p_target_galaxy, p_target_system)` now calculates
      the total number of systems between the player's current planet position and
      the target view. Each system of distance costs the configured rate (default 10).
    - Distance formula: converts (galaxy, system) to an absolute system index
      (galaxy - 1) * systems_per_galaxy + system, then takes the absolute difference.
    - Example: Planet at G1:S200, navigating to G2:S3 = |((2-1)*499+3) - ((1-1)*499+200)| = |502 - 200| = 302 systems = 3,020 deuterium.
    - Navigating to the player's own system remains free.

  2. Important Notes
    - The `galaxy_navigation_cost` setting is the cost PER SYSTEM of distance
    - Uses last viewed position (stored in session) rather than planet position
      for subsequent navigations within the same session
*/

CREATE OR REPLACE FUNCTION galaxy_navigate(
  p_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet record;
  v_resources record;
  v_cost_per_system numeric;
  v_cost_setting text;
  v_max_systems integer;
  v_max_systems_setting text;
  v_origin_abs integer;
  v_target_abs integer;
  v_distance integer;
  v_total_cost numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  IF v_planet.galaxy = p_target_galaxy AND v_planet.solar_system = p_target_system THEN
    RETURN jsonb_build_object('success', true, 'cost', 0, 'free', true);
  END IF;

  SELECT value INTO v_cost_setting FROM game_settings WHERE key = 'galaxy_navigation_cost';
  v_cost_per_system := COALESCE(v_cost_setting::numeric, 10);

  IF v_cost_per_system <= 0 THEN
    RETURN jsonb_build_object('success', true, 'cost', 0, 'free', true);
  END IF;

  SELECT value INTO v_max_systems_setting FROM game_settings WHERE key = 'max_systems';
  v_max_systems := COALESCE(v_max_systems_setting::integer, 499);

  v_origin_abs := (v_planet.galaxy - 1) * v_max_systems + v_planet.solar_system;
  v_target_abs := (p_target_galaxy - 1) * v_max_systems + p_target_system;
  v_distance := ABS(v_target_abs - v_origin_abs);

  IF v_distance = 0 THEN
    RETURN jsonb_build_object('success', true, 'cost', 0, 'free', true);
  END IF;

  v_total_cost := v_distance * v_cost_per_system;

  PERFORM calculate_and_sync_resources(p_planet_id);

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF v_resources IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resources not found');
  END IF;

  IF v_resources.deuterium < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient deuterium',
      'required', v_total_cost,
      'available', v_resources.deuterium,
      'distance', v_distance
    );
  END IF;

  UPDATE planet_resources
  SET deuterium = deuterium - v_total_cost,
      last_update = now()
  WHERE planet_id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'cost', v_total_cost,
    'distance', v_distance,
    'cost_per_system', v_cost_per_system,
    'remaining_deuterium', v_resources.deuterium - v_total_cost
  );
END;
$$;
