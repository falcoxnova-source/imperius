/*
  # Full Reconnect Sync - Process ALL Planets

  ## Problem
  When user returns from background/offline, only the current planet's queues are processed.
  Buildings, ships, and defenses on other planets remain unprocessed until the user visits them.

  ## Solution
  1. Update `full_reconnect_sync` to process ALL user planets, not just the current one
  2. Use internal queue processing functions that don't rely on auth.uid() in nested calls
  3. Calculate resources for ALL planets

  ## Changes
  - `full_reconnect_sync_all_planets(p_user_id)` - New function to process all planets
  - Updated `full_reconnect_sync(p_planet_id)` - Now calls all-planets processing first

  ## Security
  - Verifies user ownership before processing
  - Uses SECURITY DEFINER with proper search_path
*/

-- Create internal function to calculate and sync resources for a planet (no auth check)
CREATE OR REPLACE FUNCTION calculate_and_sync_resources_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_calculated jsonb;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Planet not found or not owned');
  END IF;

  v_calculated := calculate_planet_resources(p_planet_id);

  IF v_calculated ? 'error' THEN
    RETURN v_calculated;
  END IF;

  UPDATE planet_resources
  SET 
    metal = (v_calculated->>'metal')::numeric,
    crystal = (v_calculated->>'crystal')::numeric,
    deuterium = (v_calculated->>'deuterium')::numeric,
    metal_per_hour = (v_calculated->>'metal_per_hour')::numeric,
    crystal_per_hour = (v_calculated->>'crystal_per_hour')::numeric,
    deuterium_per_hour = (v_calculated->>'deuterium_per_hour')::numeric,
    metal_storage = (v_calculated->>'metal_storage')::numeric,
    crystal_storage = (v_calculated->>'crystal_storage')::numeric,
    deuterium_storage = (v_calculated->>'deuterium_storage')::numeric,
    energy_used = (v_calculated->>'energy_used')::numeric,
    energy_max = (v_calculated->>'energy_max')::numeric,
    last_update = now()
  WHERE planet_id = p_planet_id;

  RETURN v_calculated;
END;
$$;

-- Main function to process ALL planets when user reconnects
CREATE OR REPLACE FUNCTION full_reconnect_sync_all_planets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_result jsonb;
  v_total_buildings_completed int := 0;
  v_total_ships_completed int := 0;
  v_planets_synced int := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Step 1: Process research completion (user-level, only one at a time)
  BEGIN
    UPDATE user_technologies
    SET 
      level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL,
      updated_at = now()
    WHERE user_id = v_user_id
      AND is_researching = true
      AND research_end_time IS NOT NULL
      AND research_end_time <= now() + interval '2 seconds';

    IF FOUND THEN
      PERFORM update_user_points(v_user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Step 2: Process ALL planets
  FOR v_planet IN 
    SELECT id FROM planets WHERE user_id = v_user_id
  LOOP
    -- Process building queue
    BEGIN
      v_result := process_building_queue_internal(v_planet.id, v_user_id);
      IF v_result IS NOT NULL AND (v_result->>'success')::boolean THEN
        v_total_buildings_completed := v_total_buildings_completed + COALESCE((v_result->>'completed_count')::int, 0);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Process shipyard queue
    BEGIN
      v_result := process_shipyard_queue_internal(v_planet.id, v_user_id);
      IF v_result IS NOT NULL AND (v_result->>'success')::boolean THEN
        v_total_ships_completed := v_total_ships_completed + COALESCE((v_result->>'completed_units')::int, 0);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Calculate and sync resources for this planet
    BEGIN
      PERFORM calculate_and_sync_resources_internal(v_planet.id, v_user_id);
      v_planets_synced := v_planets_synced + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- Update user points if anything completed
  IF v_total_buildings_completed > 0 OR v_total_ships_completed > 0 THEN
    PERFORM update_user_points(v_user_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'buildings_completed', v_total_buildings_completed,
    'ships_completed', v_total_ships_completed,
    'planets_synced', v_planets_synced,
    'synced_at', now()
  );
END;
$$;

-- Update full_reconnect_sync to also process all planets first
CREATE OR REPLACE FUNCTION full_reconnect_sync(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_resources jsonb;
  v_all_result jsonb;
  v_buildings_completed int := 0;
  v_ships_completed int := 0;
BEGIN
  -- Get planet and verify ownership
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Planet not found');
  END IF;

  IF v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_user_id := v_planet.user_id;

  -- Step 1: Process ALL planets (buildings, ships, research)
  v_all_result := full_reconnect_sync_all_planets();
  IF v_all_result IS NOT NULL AND (v_all_result->>'success')::boolean THEN
    v_buildings_completed := COALESCE((v_all_result->>'buildings_completed')::int, 0);
    v_ships_completed := COALESCE((v_all_result->>'ships_completed')::int, 0);
  END IF;

  -- Step 2: Get fresh resources for the CURRENT planet to return to frontend
  v_resources := calculate_planet_resources(p_planet_id);

  IF NOT (v_resources ? 'error') THEN
    UPDATE planet_resources
    SET 
      metal = (v_resources->>'metal')::numeric,
      crystal = (v_resources->>'crystal')::numeric,
      deuterium = (v_resources->>'deuterium')::numeric,
      metal_per_hour = (v_resources->>'metal_per_hour')::numeric,
      crystal_per_hour = (v_resources->>'crystal_per_hour')::numeric,
      deuterium_per_hour = (v_resources->>'deuterium_per_hour')::numeric,
      metal_storage = (v_resources->>'metal_storage')::numeric,
      crystal_storage = (v_resources->>'crystal_storage')::numeric,
      deuterium_storage = (v_resources->>'deuterium_storage')::numeric,
      energy_used = (v_resources->>'energy_used')::numeric,
      energy_max = (v_resources->>'energy_max')::numeric,
      last_update = now()
    WHERE planet_id = p_planet_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'buildings_completed', v_buildings_completed,
    'ships_completed', v_ships_completed,
    'resources', v_resources,
    'synced_at', now()
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_and_sync_resources_internal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION full_reconnect_sync_all_planets() TO authenticated;
