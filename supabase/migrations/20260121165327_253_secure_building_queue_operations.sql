/*
  # Secure Building Queue Operations
  
  1. Purpose
    - Move ALL timestamp calculations for building queue to the server
    - Prevent client-side time manipulation on cancel/activate operations
    - Use now() for all time calculations
  
  2. New Functions
    - `secure_cancel_building_queue_item` - Cancel item, return resources, activate next with server time
    - `secure_activate_building_queue_item` - Activate first item in queue if not yet started
  
  3. Security
    - All timestamps calculated on server with now()
    - Client cannot manipulate start_time or end_time
    - Resources returned atomically with queue deletion
  
  4. Important Notes
    - Does NOT modify existing data
    - Frontend will use new RPC instead of direct UPDATE
*/

-- Function to cancel a building queue item securely
CREATE OR REPLACE FUNCTION secure_cancel_building_queue_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_planet RECORD;
  v_is_first boolean;
  v_remaining RECORD;
  v_game_speed numeric;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get queue item
  SELECT * INTO v_queue_item FROM building_queue WHERE id = p_queue_id;
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  
  -- Verify ownership via planet
  SELECT * INTO v_planet FROM planets WHERE id = v_queue_item.planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;
  
  v_is_first := v_queue_item.queue_position = 1;
  
  -- Return resources to planet
  UPDATE planet_resources
  SET 
    metal = metal + v_queue_item.metal_cost,
    crystal = crystal + v_queue_item.crystal_cost,
    deuterium = deuterium + v_queue_item.deuterium_cost,
    last_update = now()
  WHERE planet_id = v_queue_item.planet_id;
  
  -- Delete the cancelled item
  DELETE FROM building_queue WHERE id = p_queue_id;
  
  -- Reorder remaining queue items
  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue_item.planet_id
  )
  UPDATE building_queue bq
  SET queue_position = r.new_pos
  FROM reordered r
  WHERE bq.id = r.id;
  
  -- If we cancelled the first item, activate the new first item with SERVER time
  IF v_is_first THEN
    v_game_speed := get_game_speed();
    
    UPDATE building_queue
    SET 
      start_time = now(),
      end_time = now() + (build_time || ' seconds')::interval
    WHERE planet_id = v_queue_item.planet_id
      AND queue_position = 1
      AND start_time IS NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'refunded_metal', v_queue_item.metal_cost,
    'refunded_crystal', v_queue_item.crystal_cost,
    'refunded_deuterium', v_queue_item.deuterium_cost
  );
END;
$$;

-- Function to activate the first queue item if not yet started (server time only)
CREATE OR REPLACE FUNCTION secure_activate_building_queue(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_first_item RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Verify ownership
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;
  
  -- Get first queue item
  SELECT * INTO v_first_item 
  FROM building_queue 
  WHERE planet_id = p_planet_id AND queue_position = 1;
  
  IF v_first_item IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'No items in queue');
  END IF;
  
  -- Only activate if not already started
  IF v_first_item.start_time IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already started');
  END IF;
  
  -- Activate with server time
  UPDATE building_queue
  SET 
    start_time = now(),
    end_time = now() + (build_time || ' seconds')::interval
  WHERE id = v_first_item.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'activated_id', v_first_item.id,
    'end_time', now() + (v_first_item.build_time || ' seconds')::interval
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION secure_cancel_building_queue_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION secure_activate_building_queue(uuid) TO authenticated;
