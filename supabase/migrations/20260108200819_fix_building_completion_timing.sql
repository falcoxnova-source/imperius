/*
  # Fix Building Completion Timing Issue
  
  ## Problem
  When frontend shows 00:00:00, server may still think there's 1-2 seconds left
  due to clock differences between client and server. This causes buildings to
  appear "stuck" at 00:00:00.
  
  ## Solution
  1. Add 2-second tolerance to completion checks
  2. Always refresh data after processing attempt
  3. Force completion of items that should be complete
  
  ## Changes
  - Updated process_completed_building_queue to use 2-second tolerance
  - Updated complete_building_queue_item to use 2-second tolerance
*/

-- Update complete_building_queue_item with time tolerance
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
  v_levels_added integer;
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = v_queue.planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Check if build time is complete (with 2 second tolerance for clock differences)
  IF v_queue.end_time IS NULL OR v_queue.end_time > (NOW() + INTERVAL '2 seconds') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Build not complete yet');
  END IF;

  SELECT * INTO v_existing_building 
  FROM planet_buildings 
  WHERE planet_id = v_queue.planet_id AND building_type_id = v_queue.building_type_id;

  IF FOUND THEN
    v_levels_added := v_queue.target_level - v_existing_building.level;
    UPDATE planet_buildings 
    SET level = v_queue.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    v_levels_added := v_queue.target_level;
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue.planet_id, v_queue.building_type_id, v_queue.target_level, false);
  END IF;

  IF v_levels_added > 0 THEN
    UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue.planet_id;
  END IF;

  DELETE FROM building_queue WHERE id = p_queue_id;

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

-- Update process_completed_building_queue with time tolerance  
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
  v_legacy_completed integer := 0;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Process completed queue items (with 2 second tolerance)
  FOR v_queue_item IN 
    SELECT * FROM building_queue 
    WHERE planet_id = p_planet_id 
      AND end_time IS NOT NULL 
      AND end_time <= (NOW() + INTERVAL '2 seconds')
    ORDER BY queue_position
  LOOP
    v_result := complete_building_queue_item(v_queue_item.id);
    IF (v_result->>'success')::boolean THEN
      v_completed_count := v_completed_count + 1;
    END IF;
  END LOOP;

  -- Handle legacy is_upgrading buildings (with 2 second tolerance)
  SELECT COUNT(*) INTO v_legacy_completed
  FROM planet_buildings
  WHERE planet_id = p_planet_id
    AND is_upgrading = true
    AND upgrade_end_time IS NOT NULL
    AND upgrade_end_time <= (NOW() + INTERVAL '2 seconds');

  IF v_legacy_completed > 0 THEN
    UPDATE planets 
    SET fields_used = fields_used + v_legacy_completed 
    WHERE id = p_planet_id;
    
    UPDATE planet_buildings
    SET level = level + 1, is_upgrading = false, upgrade_end_time = NULL
    WHERE planet_id = p_planet_id
      AND is_upgrading = true
      AND upgrade_end_time IS NOT NULL
      AND upgrade_end_time <= (NOW() + INTERVAL '2 seconds');
  END IF;

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count + v_legacy_completed);
END;
$$;
