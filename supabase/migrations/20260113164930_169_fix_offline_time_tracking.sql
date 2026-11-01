/*
  # Fix Offline Time Tracking System

  ## Problem
  When users close the browser or put the app in background:
  1. Building/shipyard timers appear frozen (client-side JS timers stop)
  2. Resources don't accumulate (last_update not being properly synced)
  3. Queue completions not being processed when user returns

  ## Solution
  1. Create a comprehensive "catch-up" function that processes ALL pending items
  2. Update calculate_planet_resources to optionally save to database
  3. Add a master sync function for reconnection scenarios

  ## New Functions
  1. `process_all_user_queues(user_id)` - Processes building, shipyard, and research queues for ALL planets
  2. `full_reconnect_sync(planet_id)` - Complete sync when user reconnects

  ## Security
  - All functions verify ownership before processing
  - Uses SECURITY DEFINER with proper search_path
*/

-- Master function to process ALL queues for a user (called on reconnect)
CREATE OR REPLACE FUNCTION process_all_user_queues_on_reconnect(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet RECORD;
  v_buildings_completed int := 0;
  v_ships_completed int := 0;
  v_research_completed boolean := false;
  v_result jsonb;
BEGIN
  -- Verify this is the authenticated user
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Process research first (user-level)
  BEGIN
    UPDATE user_technologies
    SET 
      level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL,
      updated_at = now()
    WHERE user_id = p_user_id
      AND is_researching = true
      AND research_end_time IS NOT NULL
      AND research_end_time <= now() + interval '2 seconds';
    
    IF FOUND THEN
      v_research_completed := true;
      PERFORM update_user_points(p_user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Continue even if research fails
    NULL;
  END;

  -- Process ALL planets' queues
  FOR v_planet IN 
    SELECT id FROM planets WHERE user_id = p_user_id
  LOOP
    -- Process building queue
    BEGIN
      SELECT * INTO v_result FROM process_completed_building_queue(v_planet.id);
      IF v_result IS NOT NULL AND (v_result->>'buildings_completed')::int > 0 THEN
        v_buildings_completed := v_buildings_completed + (v_result->>'buildings_completed')::int;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Process shipyard queue
    BEGIN
      SELECT * INTO v_result FROM process_completed_shipyard_queue(v_planet.id);
      IF v_result IS NOT NULL AND (v_result->>'units_completed')::int > 0 THEN
        v_ships_completed := v_ships_completed + (v_result->>'units_completed')::int;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'buildings_completed', v_buildings_completed,
    'ships_completed', v_ships_completed,
    'research_completed', v_research_completed,
    'processed_at', now()
  );
END;
$$;

-- Comprehensive reconnect sync for a specific planet
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
  v_queue_result jsonb;
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

  -- Step 1: Process completed building queue items
  BEGIN
    SELECT * INTO v_queue_result FROM process_completed_building_queue(p_planet_id);
    IF v_queue_result IS NOT NULL THEN
      v_buildings_completed := COALESCE((v_queue_result->>'buildings_completed')::int, 0);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Step 2: Process completed shipyard queue items  
  BEGIN
    SELECT * INTO v_queue_result FROM process_completed_shipyard_queue(p_planet_id);
    IF v_queue_result IS NOT NULL THEN
      v_ships_completed := COALESCE((v_queue_result->>'units_completed')::int, 0);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Step 3: Process research completion
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

  -- Step 4: Calculate and SAVE resources (using sync_planet_resources logic)
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

-- Update calculate_planet_resources to also update last_update when called
-- This ensures resources are properly tracked even with passive reads
CREATE OR REPLACE FUNCTION calculate_and_sync_resources(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calculated jsonb;
  v_user_id uuid;
BEGIN
  -- Verify ownership
  SELECT user_id INTO v_user_id FROM planets WHERE id = p_planet_id;
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  
  -- Calculate current resources
  v_calculated := calculate_planet_resources(p_planet_id);
  
  IF v_calculated ? 'error' THEN
    RETURN v_calculated;
  END IF;
  
  -- Update the database with calculated values AND new last_update
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
  
  -- Return with current timestamp
  RETURN jsonb_build_object(
    'metal', (v_calculated->>'metal')::numeric,
    'crystal', (v_calculated->>'crystal')::numeric,
    'deuterium', (v_calculated->>'deuterium')::numeric,
    'metal_per_hour', (v_calculated->>'metal_per_hour')::numeric,
    'crystal_per_hour', (v_calculated->>'crystal_per_hour')::numeric,
    'deuterium_per_hour', (v_calculated->>'deuterium_per_hour')::numeric,
    'metal_storage', (v_calculated->>'metal_storage')::numeric,
    'crystal_storage', (v_calculated->>'crystal_storage')::numeric,
    'deuterium_storage', (v_calculated->>'deuterium_storage')::numeric,
    'energy_used', (v_calculated->>'energy_used')::numeric,
    'energy_max', (v_calculated->>'energy_max')::numeric,
    'last_update', now()
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION process_all_user_queues_on_reconnect(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION full_reconnect_sync(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_and_sync_resources(uuid) TO authenticated;
