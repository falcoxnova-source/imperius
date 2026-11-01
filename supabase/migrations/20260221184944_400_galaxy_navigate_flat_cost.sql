/*
  # Galaxy Navigation - Flat Cost Per Navigation

  Reverts the distance-based galaxy navigation cost back to a flat fee.
  
  1. Modified Function
    - `galaxy_navigate` now charges a flat 10 deuterium (configurable via 
      `galaxy_navigation_cost` setting) for ANY navigation, regardless of 
      how many systems or galaxies the player jumps.
    - Navigating to the player's own system remains free.
    - Example: Jumping from G1:S1 to G3:S400 costs 10 deuterium (same as G1:S1 to G1:S2).

  2. Important Notes
    - The `galaxy_navigation_cost` setting is the cost per navigation action
    - Distance no longer affects cost
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
  v_cost numeric;
  v_cost_setting text;
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
  v_cost := COALESCE(v_cost_setting::numeric, 10);

  IF v_cost <= 0 THEN
    RETURN jsonb_build_object('success', true, 'cost', 0, 'free', true);
  END IF;

  PERFORM calculate_and_sync_resources(p_planet_id);

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF v_resources IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resources not found');
  END IF;

  IF v_resources.deuterium < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient deuterium',
      'required', v_cost,
      'available', v_resources.deuterium
    );
  END IF;

  UPDATE planet_resources
  SET deuterium = deuterium - v_cost,
      last_update = now()
  WHERE planet_id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'cost', v_cost,
    'remaining_deuterium', v_resources.deuterium - v_cost
  );
END;
$$;
