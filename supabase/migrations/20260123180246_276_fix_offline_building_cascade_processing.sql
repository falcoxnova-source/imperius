/*
  # Fix Offline Building Queue Cascade Processing

  ## Problem
  When a building completes while user is offline, the next item in queue
  gets start_time = NOW() instead of the previous item's end_time.
  This breaks cascade processing of multiple queued items.

  ## Solution
  Update process_building_queue_internal to:
  1. When completing an item, set the next item's start_time to the completed item's end_time
  2. If that calculated end_time is also in the past, process it too
  3. Continue until no more items are completed
  
  ## Changes
  - Rewrite process_building_queue_internal with proper cascade logic
*/

CREATE OR REPLACE FUNCTION process_building_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet_exists boolean;
  v_completed_count integer := 0;
  v_queue_item RECORD;
  v_prev_end_time timestamptz;
  v_calculated_end_time timestamptz;
  v_max_iterations integer := 50;
  v_iteration integer := 0;
BEGIN
  SELECT EXISTS(SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = p_user_id) INTO v_planet_exists;
  IF NOT v_planet_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  LOOP
    v_iteration := v_iteration + 1;
    IF v_iteration > v_max_iterations THEN
      EXIT;
    END IF;

    SELECT * INTO v_queue_item 
    FROM building_queue 
    WHERE planet_id = p_planet_id 
    ORDER BY queue_position 
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      EXIT;
    END IF;

    IF v_queue_item.start_time IS NULL THEN
      v_queue_item.start_time := NOW();
    END IF;
    
    IF v_queue_item.end_time IS NULL THEN
      v_queue_item.end_time := v_queue_item.start_time + (v_queue_item.build_time || ' seconds')::interval;
    END IF;

    IF v_queue_item.end_time > NOW() + interval '2 seconds' THEN
      UPDATE building_queue
      SET start_time = v_queue_item.start_time,
          end_time = v_queue_item.end_time
      WHERE id = v_queue_item.id;
      EXIT;
    END IF;

    v_prev_end_time := v_queue_item.end_time;

    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
    VALUES (p_planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false, NULL)
    ON CONFLICT (planet_id, building_type_id)
    DO UPDATE SET 
      level = EXCLUDED.level,
      is_upgrading = false,
      upgrade_end_time = NULL;

    DELETE FROM building_queue WHERE id = v_queue_item.id;
    
    v_completed_count := v_completed_count + 1;

    UPDATE planets 
    SET fields_used = fields_used + 1 
    WHERE id = p_planet_id;

    UPDATE building_queue
    SET queue_position = queue_position - 1
    WHERE planet_id = p_planet_id
    AND queue_position > 1;

    UPDATE building_queue
    SET start_time = v_prev_end_time,
        end_time = v_prev_end_time + (build_time || ' seconds')::interval
    WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND start_time IS NULL;

  END LOOP;

  WITH legacy_update AS (
    UPDATE planet_buildings
    SET level = level + 1, is_upgrading = false, upgrade_end_time = NULL
    WHERE planet_id = p_planet_id
    AND is_upgrading = true
    AND upgrade_end_time IS NOT NULL
    AND upgrade_end_time <= (NOW() + INTERVAL '2 seconds')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_iteration FROM legacy_update;

  IF v_iteration > 0 THEN
    UPDATE planets 
    SET fields_used = fields_used + v_iteration 
    WHERE id = p_planet_id;
    v_completed_count := v_completed_count + v_iteration;
  END IF;

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count);
END;
$$;
