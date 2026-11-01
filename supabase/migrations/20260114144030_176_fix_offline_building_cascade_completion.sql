/*
  # Fix Offline Building Queue Cascade Completion
  
  ## Problem
  When user is offline for extended time and has multiple buildings queued:
  - Only item at position 1 has end_time set
  - Items at position 2, 3, etc have end_time = NULL
  - When user returns, only first item completes
  - Subsequent items get new timers from NOW() instead of cascading from previous completion
  
  ## Solution
  Update process_building_queue_internal to:
  1. Process completed items in a LOOP
  2. After each completion, calculate when next item SHOULD have started
  3. Set next item's end_time based on previous item's completion time
  4. Continue until no more items should be completed
  
  ## Changes
  - Updated process_building_queue_internal with cascade logic
  - Buildings now properly complete even if user was offline for days
*/

CREATE OR REPLACE FUNCTION process_building_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item RECORD;
  v_completed_count integer := 0;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
  v_last_end_time timestamptz;
  v_next_item RECORD;
  v_continue_processing boolean := true;
  v_now timestamptz := NOW();
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  UPDATE building_queue
  SET 
    start_time = COALESCE(start_time, v_now),
    end_time = COALESCE(end_time, v_now + (build_time || ' seconds')::interval)
  WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND (start_time IS NULL OR end_time IS NULL);

  WHILE v_continue_processing LOOP
    v_continue_processing := false;
    
    FOR v_queue_item IN 
      SELECT * FROM building_queue 
      WHERE planet_id = p_planet_id 
        AND end_time IS NOT NULL 
        AND end_time <= (v_now + INTERVAL '2 seconds')
      ORDER BY queue_position
      LIMIT 1
    LOOP
      v_last_end_time := v_queue_item.end_time;
      
      SELECT * INTO v_existing_building 
      FROM planet_buildings 
      WHERE planet_id = v_queue_item.planet_id AND building_type_id = v_queue_item.building_type_id;

      IF FOUND THEN
        v_levels_added := v_queue_item.target_level - v_existing_building.level;
        UPDATE planet_buildings 
        SET level = v_queue_item.target_level, is_upgrading = false, upgrade_end_time = NULL
        WHERE id = v_existing_building.id;
      ELSE
        v_levels_added := v_queue_item.target_level;
        INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
        VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false);
      END IF;

      IF v_levels_added > 0 THEN
        UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue_item.planet_id;
      END IF;

      DELETE FROM building_queue WHERE id = v_queue_item.id;
      v_completed_count := v_completed_count + 1;

      WITH reordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
        FROM building_queue
        WHERE planet_id = p_planet_id
      )
      UPDATE building_queue bq
      SET queue_position = r.new_pos
      FROM reordered r
      WHERE bq.id = r.id;

      SELECT * INTO v_next_item 
      FROM building_queue 
      WHERE planet_id = p_planet_id AND queue_position = 1;
      
      IF FOUND THEN
        UPDATE building_queue
        SET 
          start_time = COALESCE(start_time, v_last_end_time),
          end_time = COALESCE(v_last_end_time, v_now) + (build_time || ' seconds')::interval
        WHERE id = v_next_item.id
          AND (end_time IS NULL OR start_time IS NULL);
        
        SELECT * INTO v_next_item 
        FROM building_queue 
        WHERE planet_id = p_planet_id AND queue_position = 1;
        
        IF v_next_item.end_time IS NOT NULL AND v_next_item.end_time <= (v_now + INTERVAL '2 seconds') THEN
          v_continue_processing := true;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  DECLARE
    v_legacy_completed integer := 0;
  BEGIN
    SELECT COUNT(*) INTO v_legacy_completed
    FROM planet_buildings
    WHERE planet_id = p_planet_id
      AND is_upgrading = true
      AND upgrade_end_time IS NOT NULL
      AND upgrade_end_time <= (v_now + INTERVAL '2 seconds');

    IF v_legacy_completed > 0 THEN
      UPDATE planets 
      SET fields_used = fields_used + v_legacy_completed 
      WHERE id = p_planet_id;
      
      UPDATE planet_buildings
      SET level = level + 1, is_upgrading = false, upgrade_end_time = NULL
      WHERE planet_id = p_planet_id
        AND is_upgrading = true
        AND upgrade_end_time IS NOT NULL
        AND upgrade_end_time <= (v_now + INTERVAL '2 seconds');
      
      v_completed_count := v_completed_count + v_legacy_completed;
    END IF;
  END;

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count);
END;
$$;
