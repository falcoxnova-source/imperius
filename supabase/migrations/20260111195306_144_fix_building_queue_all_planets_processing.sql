/*
  # Fix Building Queue Processing for All Planets
  
  ## Problem
  When user switches planets, building queues on other planets may not process correctly
  because process_completed_building_queue verifies auth.uid() which can fail in nested
  SECURITY DEFINER function calls.
  
  ## Solution
  1. Create internal version of process_completed_building_queue that skips auth check
  2. Update process_all_user_building_queues to use internal version after auth verification
  3. Add function to ensure first queue items always have start_time and end_time set
  
  ## Changes
  - New function: process_building_queue_internal (no auth check, for internal use only)
  - Updated: process_all_user_building_queues to use internal function
  - New function: ensure_building_queue_timers to fix any missing timers
*/

-- Internal function to process building queue without auth check
-- This is called by process_all_user_building_queues after it verifies ownership
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
  v_result jsonb;
  v_legacy_completed integer := 0;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
BEGIN
  -- Verify planet belongs to specified user (not auth.uid() which may fail in nested calls)
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- First, ensure the first item in queue has start_time and end_time set
  UPDATE building_queue
  SET 
    start_time = COALESCE(start_time, NOW()),
    end_time = COALESCE(end_time, NOW() + (build_time || ' seconds')::interval)
  WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND (start_time IS NULL OR end_time IS NULL);

  -- Process completed queue items (with 2 second tolerance)
  FOR v_queue_item IN 
    SELECT * FROM building_queue 
    WHERE planet_id = p_planet_id 
      AND end_time IS NOT NULL 
      AND end_time <= (NOW() + INTERVAL '2 seconds')
    ORDER BY queue_position
  LOOP
    -- Complete this queue item directly
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

  -- Reorder remaining queue and set timers for new first item
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

-- Update process_all_user_building_queues to use internal function
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Process ALL planets belonging to the user
  FOR v_planet IN 
    SELECT id FROM planets WHERE user_id = v_user_id
  LOOP
    -- Use internal function that accepts user_id instead of relying on auth.uid()
    v_result := process_building_queue_internal(v_planet.id, v_user_id);

    IF (v_result->>'success')::boolean THEN
      v_planet_completed := COALESCE((v_result->>'completed_count')::integer, 0);
      v_total_completed := v_total_completed + v_planet_completed;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_count', v_total_completed);
END;
$$;

-- Function to ensure all first-position queue items have timers set
CREATE OR REPLACE FUNCTION ensure_all_queue_timers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fixed_count integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Fix building queue timers for all user's planets
  WITH updated AS (
    UPDATE building_queue bq
    SET 
      start_time = COALESCE(bq.start_time, NOW()),
      end_time = COALESCE(bq.end_time, NOW() + (bq.build_time || ' seconds')::interval)
    FROM planets p
    WHERE bq.planet_id = p.id
      AND p.user_id = v_user_id
      AND bq.queue_position = 1
      AND (bq.start_time IS NULL OR bq.end_time IS NULL)
    RETURNING bq.id
  )
  SELECT COUNT(*) INTO v_fixed_count FROM updated;

  -- Fix shipyard queue timers for all user's planets
  WITH updated AS (
    UPDATE shipyard_queue sq
    SET 
      start_time = COALESCE(sq.start_time, NOW()),
      current_unit_end_time = COALESCE(sq.current_unit_end_time, NOW() + (sq.build_time_per_unit || ' seconds')::interval)
    FROM planets p
    WHERE sq.planet_id = p.id
      AND p.user_id = v_user_id
      AND sq.queue_position = 1
      AND (sq.start_time IS NULL OR sq.current_unit_end_time IS NULL)
    RETURNING sq.id
  )
  SELECT v_fixed_count + COUNT(*) INTO v_fixed_count FROM updated;

  RETURN jsonb_build_object('success', true, 'fixed_count', v_fixed_count);
END;
$$;

-- Also fix shipyard queue processing for all planets
CREATE OR REPLACE FUNCTION process_shipyard_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item shipyard_queue%ROWTYPE;
  v_units_completed integer := 0;
  v_units_to_complete integer;
  v_elapsed_seconds numeric;
  v_time_per_unit numeric;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  -- Ensure first item has timers set
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
  FOR UPDATE;

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

-- Update process_all_user_shipyard_queues to use internal function
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
    SELECT id FROM planets WHERE user_id = v_user_id
  LOOP
    v_result := process_shipyard_queue_internal(v_planet.id, v_user_id);
    IF (v_result->>'success')::boolean THEN
      v_total_units := v_total_units + COALESCE((v_result->>'completed_units')::integer, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_units', v_total_units);
END;
$$;
