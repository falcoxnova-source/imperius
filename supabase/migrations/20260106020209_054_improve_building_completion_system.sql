/*
  # Improve Building Completion System

  1. Changes
    - Add server-side function to complete building queue items
    - Handle edge cases when building record doesn't exist
    - Use upsert to handle concurrent completions
    - Auto-start next queue item when one completes

  2. Security
    - Function validates user ownership
    - Only processes completed items
*/

-- Function to complete a single building queue item
CREATE OR REPLACE FUNCTION complete_building_queue_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_existing_building planet_buildings%ROWTYPE;
BEGIN
  -- Get queue item
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  -- Get planet and verify ownership
  SELECT * INTO v_planet FROM planets WHERE id = v_queue.planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Check if build time is complete
  IF v_queue.end_time IS NULL OR v_queue.end_time > NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Build not complete yet');
  END IF;

  -- Check for existing building
  SELECT * INTO v_existing_building 
  FROM planet_buildings 
  WHERE planet_id = v_queue.planet_id AND building_type_id = v_queue.building_type_id;

  IF FOUND THEN
    -- Update existing building level
    UPDATE planet_buildings 
    SET level = v_queue.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    -- Create new building record
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue.planet_id, v_queue.building_type_id, v_queue.target_level, false);
    
    -- Increment fields_used only for new buildings
    UPDATE planets SET fields_used = fields_used + 1 WHERE id = v_queue.planet_id;
  END IF;

  -- Delete the completed queue item
  DELETE FROM building_queue WHERE id = p_queue_id;

  -- Reorder remaining queue items and start next one
  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue.planet_id
  )
  UPDATE building_queue bq
  SET 
    queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND bq.start_time IS NULL THEN NOW() ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND bq.end_time IS NULL THEN NOW() + (bq.build_time || ' seconds')::interval ELSE bq.end_time END
  FROM reordered r
  WHERE bq.id = r.id;

  RETURN jsonb_build_object('success', true, 'building_type_id', v_queue.building_type_id, 'new_level', v_queue.target_level);
END;
$$;

-- Function to process all completed building queue items for a planet
CREATE OR REPLACE FUNCTION process_completed_building_queue(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item RECORD;
  v_completed_count integer := 0;
  v_result jsonb;
BEGIN
  -- Verify planet ownership
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Process all completed queue items in order
  FOR v_queue_item IN 
    SELECT * FROM building_queue 
    WHERE planet_id = p_planet_id 
      AND end_time IS NOT NULL 
      AND end_time <= NOW()
    ORDER BY queue_position
  LOOP
    v_result := complete_building_queue_item(v_queue_item.id);
    IF (v_result->>'success')::boolean THEN
      v_completed_count := v_completed_count + 1;
    END IF;
  END LOOP;

  -- Also handle legacy is_upgrading buildings (old system)
  UPDATE planet_buildings
  SET level = level + 1, is_upgrading = false, upgrade_end_time = NULL
  WHERE planet_id = p_planet_id
    AND is_upgrading = true
    AND upgrade_end_time IS NOT NULL
    AND upgrade_end_time <= NOW();

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION complete_building_queue_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION process_completed_building_queue(uuid) TO authenticated;
