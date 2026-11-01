/*
  # Increase timeout for process_completed_building_queue

  1. Changes
    - Add statement_timeout = '60s' to process_completed_building_queue function
    - Add statement_timeout = '60s' to process_building_queue_internal function
    - Prevents statement timeout (57014) errors when processing heavy building queues
    - Prevents cascading lock timeout (55P03) on dependent functions like secure_start_research
    - No logic changes, only timeout configuration

  2. Why
    - Users with many completed building items hit the default timeout
    - The lock held by this function blocks secure_start_research causing lock timeouts
    - 60s matches the timeout already set on full_reconnect_sync and secure_start_research
*/

CREATE OR REPLACE FUNCTION process_completed_building_queue(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
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

CREATE OR REPLACE FUNCTION process_building_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item RECORD;
  v_completed_count integer := 0;
  v_result jsonb;
  v_legacy_completed integer := 0;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  UPDATE building_queue
  SET 
    start_time = COALESCE(start_time, NOW()),
    end_time = COALESCE(end_time, NOW() + (build_time || ' seconds')::interval)
  WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND (start_time IS NULL OR end_time IS NULL);

  FOR v_queue_item IN 
    SELECT * FROM building_queue 
    WHERE planet_id = p_planet_id 
      AND end_time IS NOT NULL 
      AND end_time <= (NOW() + INTERVAL '2 seconds')
    ORDER BY queue_position
  LOOP
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
  END LOOP;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = p_planet_id
  )
  UPDATE building_queue bq
  SET 
    queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 THEN COALESCE(bq.start_time, NOW()) ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 THEN COALESCE(bq.end_time, NOW() + (bq.build_time || ' seconds')::interval) ELSE bq.end_time END
  FROM reordered r
  WHERE bq.id = r.id;

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