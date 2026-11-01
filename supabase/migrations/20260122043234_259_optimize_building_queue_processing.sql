/*
  # Optimize Building Queue Processing to Prevent Timeouts
  
  ## Problem
  The process_all_user_building_queues function was timing out because:
  1. It uses row-by-row FOR loops which are slow
  2. It processes all pending items without limit
  3. No SKIP LOCKED to avoid contention
  
  ## Solution
  1. Replace FOR loops with bulk SET operations
  2. Add LIMIT to process max 10 buildings per call
  3. Use SKIP LOCKED to avoid blocking on concurrent access
  4. Optimize the internal function for better performance
  
  ## Changes
  - Optimized process_building_queue_internal to use bulk operations
  - Added LIMIT and SKIP LOCKED for safer concurrent access
  - Maintains exact same business logic for building completion
*/

-- Optimized internal function using bulk operations
CREATE OR REPLACE FUNCTION process_building_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet_exists boolean;
  v_completed_count integer := 0;
  v_legacy_completed integer := 0;
BEGIN
  SELECT EXISTS(SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = p_user_id) INTO v_planet_exists;
  IF NOT v_planet_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  UPDATE building_queue
  SET 
    start_time = COALESCE(start_time, NOW()),
    end_time = COALESCE(end_time, NOW() + (build_time || ' seconds')::interval)
  WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND (start_time IS NULL OR end_time IS NULL);

  WITH completed_items AS (
    SELECT id, planet_id, building_type_id, target_level
    FROM building_queue 
    WHERE planet_id = p_planet_id 
      AND end_time IS NOT NULL 
      AND end_time <= (NOW() + INTERVAL '2 seconds')
    ORDER BY queue_position
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ),
  updated_buildings AS (
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
    SELECT ci.planet_id, ci.building_type_id, ci.target_level, false, NULL
    FROM completed_items ci
    ON CONFLICT (planet_id, building_type_id)
    DO UPDATE SET 
      level = EXCLUDED.level,
      is_upgrading = false,
      upgrade_end_time = NULL
    RETURNING building_type_id
  ),
  deleted_queue AS (
    DELETE FROM building_queue
    WHERE id IN (SELECT id FROM completed_items)
    RETURNING id, target_level, building_type_id, planet_id
  ),
  fields_update AS (
    UPDATE planets p
    SET fields_used = fields_used + (
      SELECT COALESCE(SUM(
        dq.target_level - COALESCE(
          (SELECT pb.level FROM planet_buildings pb 
           WHERE pb.planet_id = dq.planet_id AND pb.building_type_id = dq.building_type_id
           AND pb.level < dq.target_level),
          0
        )
      ), 0)
      FROM deleted_queue dq WHERE dq.planet_id = p.id
    )
    WHERE p.id = p_planet_id
      AND EXISTS (SELECT 1 FROM deleted_queue)
  )
  SELECT COUNT(*) INTO v_completed_count FROM deleted_queue;

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

  WITH legacy_update AS (
    UPDATE planet_buildings
    SET level = level + 1, is_upgrading = false, upgrade_end_time = NULL
    WHERE planet_id = p_planet_id
      AND is_upgrading = true
      AND upgrade_end_time IS NOT NULL
      AND upgrade_end_time <= (NOW() + INTERVAL '2 seconds')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_legacy_completed FROM legacy_update;

  IF v_legacy_completed > 0 THEN
    UPDATE planets 
    SET fields_used = fields_used + v_legacy_completed 
    WHERE id = p_planet_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count + v_legacy_completed);
END;
$$;

CREATE OR REPLACE FUNCTION process_all_user_building_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_result jsonb;
  v_total_completed integer := 0;
  v_planet_completed integer;
  v_planets_processed integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  FOR v_planet IN 
    SELECT id FROM planets 
    WHERE user_id = v_user_id
    LIMIT 15
  LOOP
    v_result := process_building_queue_internal(v_planet.id, v_user_id);
    v_planets_processed := v_planets_processed + 1;

    IF (v_result->>'success')::boolean THEN
      v_planet_completed := COALESCE((v_result->>'completed_count')::integer, 0);
      v_total_completed := v_total_completed + v_planet_completed;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_count', v_total_completed, 'planets_processed', v_planets_processed);
END;
$$;

CREATE OR REPLACE FUNCTION process_shipyard_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet_exists boolean;
  v_queue_item shipyard_queue%ROWTYPE;
  v_units_completed integer := 0;
  v_units_to_complete integer;
  v_elapsed_seconds numeric;
  v_time_per_unit numeric;
BEGIN
  SELECT EXISTS(SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = p_user_id) INTO v_planet_exists;
  IF NOT v_planet_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  UPDATE shipyard_queue
  SET 
    start_time = COALESCE(start_time, NOW()),
    current_unit_end_time = COALESCE(current_unit_end_time, NOW() + (build_time_per_unit || ' seconds')::interval)
  WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND (start_time IS NULL OR current_unit_end_time IS NULL);

  SELECT * INTO v_queue_item
  FROM shipyard_queue
  WHERE planet_id = p_planet_id AND queue_position = 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND OR v_queue_item.start_time IS NULL THEN
    RETURN jsonb_build_object('success', true, 'completed_units', 0);
  END IF;

  v_time_per_unit := v_queue_item.build_time_per_unit;
  IF v_time_per_unit <= 0 THEN v_time_per_unit := 1; END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_queue_item.start_time));
  v_units_to_complete := LEAST(
    FLOOR(v_elapsed_seconds / v_time_per_unit)::integer - v_queue_item.quantity_completed,
    v_queue_item.quantity - v_queue_item.quantity_completed
  );

  IF v_units_to_complete <= 0 THEN
    RETURN jsonb_build_object('success', true, 'completed_units', 0);
  END IF;

  IF v_queue_item.item_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (p_planet_id, v_queue_item.type_id, v_units_to_complete)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + v_units_to_complete;
  ELSE
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    VALUES (p_planet_id, v_queue_item.type_id, v_units_to_complete)
    ON CONFLICT (planet_id, defense_type_id)
    DO UPDATE SET quantity = planet_defenses.quantity + v_units_to_complete;
  END IF;

  v_units_completed := v_units_to_complete;

  IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
    DELETE FROM shipyard_queue WHERE id = v_queue_item.id;

    WITH reordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
      FROM shipyard_queue WHERE planet_id = p_planet_id
    )
    UPDATE shipyard_queue sq
    SET 
      queue_position = r.new_pos,
      start_time = CASE WHEN r.new_pos = 1 THEN COALESCE(sq.start_time, NOW()) ELSE sq.start_time END,
      current_unit_end_time = CASE WHEN r.new_pos = 1 THEN COALESCE(sq.current_unit_end_time, NOW() + (sq.build_time_per_unit || ' seconds')::interval) ELSE sq.current_unit_end_time END
    FROM reordered r WHERE sq.id = r.id;
  ELSE
    UPDATE shipyard_queue
    SET quantity_completed = quantity_completed + v_units_to_complete
    WHERE id = v_queue_item.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'completed_units', v_units_completed);
END;
$$;

CREATE OR REPLACE FUNCTION process_all_user_shipyard_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_result jsonb;
  v_total_units integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  FOR v_planet IN 
    SELECT id FROM planets 
    WHERE user_id = v_user_id
    LIMIT 15
  LOOP
    v_result := process_shipyard_queue_internal(v_planet.id, v_user_id);
    IF (v_result->>'success')::boolean THEN
      v_total_units := v_total_units + COALESCE((v_result->>'completed_units')::integer, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_units', v_total_units);
END;
$$;
