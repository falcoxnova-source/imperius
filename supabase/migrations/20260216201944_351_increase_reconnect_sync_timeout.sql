/*
  # Increase timeout for full_reconnect_sync

  1. Changes
    - Add statement_timeout = '60s' to full_reconnect_sync function
    - This prevents timeout errors when processing heavy building/shipyard queues
    - No logic changes, only timeout configuration

  2. Why
    - Users with many completed items can hit the default 2s timeout
    - 60s gives enough time for all queue processing without affecting other queries
*/

CREATE OR REPLACE FUNCTION full_reconnect_sync(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_resources jsonb;
  v_buildings_completed int := 0;
  v_ships_completed int := 0;
  v_build_result jsonb;
  v_ship_result jsonb;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Planet not found');
  END IF;

  IF v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_user_id := v_planet.user_id;

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

  BEGIN
    v_build_result := process_building_queue_internal(p_planet_id, v_user_id);
    IF v_build_result IS NOT NULL AND (v_build_result->>'success')::boolean THEN
      v_buildings_completed := COALESCE((v_build_result->>'completed_count')::int, 0);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    v_ship_result := process_shipyard_queue_internal(p_planet_id, v_user_id);
    IF v_ship_result IS NOT NULL AND (v_ship_result->>'success')::boolean THEN
      v_ships_completed := COALESCE((v_ship_result->>'completed_units')::int, 0);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

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

  IF v_buildings_completed > 0 OR v_ships_completed > 0 THEN
    PERFORM update_user_points(v_user_id);
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
