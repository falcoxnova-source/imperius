/*
  # Improved Queue Processing System - Prevention of Stuck Items

  This migration improves the automatic processing system to prevent
  items from getting stuck in queues.

  ## Changes:
  1. Improve process_all_user_building_queues to be more resilient
  2. Improve process_all_user_shipyard_queues to be more resilient
  3. Add global maintenance function that doesn't require auth
  4. Add cron-compatible maintenance function

  ## Key Improvements:
  - Uses UPSERT for building completion to handle race conditions
  - Processes items even if slightly in the future (1 second tolerance)
  - Better error handling that doesn't stop the entire loop
  - Activates next queue items automatically
*/

-- Improved building queue processor with better error handling
CREATE OR REPLACE FUNCTION process_all_user_building_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_completed_count integer := 0;
  v_activated_count integer := 0;
  v_error_count integer := 0;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  FOR v_queue_item IN 
    SELECT bq.*, p.user_id
    FROM building_queue bq
    JOIN planets p ON bq.planet_id = p.id
    WHERE p.user_id = v_user_id
      AND bq.end_time IS NOT NULL 
      AND bq.end_time <= NOW() + INTERVAL '1 second'
    ORDER BY bq.end_time ASC
  LOOP
    BEGIN
      INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
      VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false, NULL)
      ON CONFLICT (planet_id, building_type_id)
      DO UPDATE SET 
        level = GREATEST(planet_buildings.level, v_queue_item.target_level),
        is_upgrading = false,
        upgrade_end_time = NULL;
      
      UPDATE planets
      SET fields_used = LEAST(fields_max, fields_used + 1)
      WHERE id = v_queue_item.planet_id;
      
      DELETE FROM building_queue WHERE id = v_queue_item.id;
      
      UPDATE building_queue
      SET queue_position = queue_position - 1
      WHERE planet_id = v_queue_item.planet_id
        AND queue_position > v_queue_item.queue_position;
      
      v_completed_count := v_completed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  FOR v_queue_item IN 
    SELECT bq.*, p.user_id
    FROM building_queue bq
    JOIN planets p ON bq.planet_id = p.id
    WHERE p.user_id = v_user_id
      AND bq.queue_position = 1 
      AND bq.end_time IS NULL
  LOOP
    BEGIN
      PERFORM secure_activate_building_queue(v_queue_item.planet_id);
      v_activated_count := v_activated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'completed_count', v_completed_count,
    'activated_count', v_activated_count,
    'error_count', v_error_count
  );
END;
$$;

-- Improved shipyard queue processor with better error handling
CREATE OR REPLACE FUNCTION process_all_user_shipyard_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_completed_units integer := 0;
  v_error_count integer := 0;
  v_units_to_complete integer;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  FOR v_queue_item IN 
    SELECT sq.*, p.user_id
    FROM shipyard_queue sq
    JOIN planets p ON sq.planet_id = p.id
    WHERE p.user_id = v_user_id
      AND sq.current_unit_end_time IS NOT NULL 
      AND sq.current_unit_end_time <= NOW() + INTERVAL '1 second'
    ORDER BY sq.current_unit_end_time ASC
  LOOP
    BEGIN
      v_units_to_complete := v_queue_item.quantity - v_queue_item.quantity_completed;
      
      IF v_queue_item.item_type = 'ship' AND v_queue_item.ship_type_id IS NOT NULL THEN
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (v_queue_item.planet_id, v_queue_item.ship_type_id, v_units_to_complete)
        ON CONFLICT (planet_id, ship_type_id)
        DO UPDATE SET quantity = planet_ships.quantity + v_units_to_complete;
      ELSIF v_queue_item.item_type = 'defense' AND v_queue_item.defense_type_id IS NOT NULL THEN
        INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
        VALUES (v_queue_item.planet_id, v_queue_item.defense_type_id, v_units_to_complete)
        ON CONFLICT (planet_id, defense_type_id)
        DO UPDATE SET quantity = planet_defenses.quantity + v_units_to_complete;
      END IF;
      
      DELETE FROM shipyard_queue WHERE id = v_queue_item.id;
      
      UPDATE shipyard_queue
      SET queue_position = queue_position - 1
      WHERE planet_id = v_queue_item.planet_id
        AND queue_position > v_queue_item.queue_position;
      
      v_completed_units := v_completed_units + v_units_to_complete;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  UPDATE shipyard_queue sq
  SET start_time = NOW(),
      current_unit_end_time = NOW() + (sq.build_time_per_unit * INTERVAL '1 second')
  FROM planets p
  WHERE sq.planet_id = p.id
    AND p.user_id = v_user_id
    AND sq.queue_position = 1
    AND sq.start_time IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'completed_units', v_completed_units,
    'error_count', v_error_count
  );
END;
$$;

-- Global maintenance function that can be called by cron or service role
CREATE OR REPLACE FUNCTION global_process_all_expired_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_item RECORD;
  v_building_completed integer := 0;
  v_shipyard_completed integer := 0;
  v_fleet_processed integer := 0;
  v_research_completed integer := 0;
  v_errors integer := 0;
  v_units_to_complete integer;
BEGIN
  FOR v_queue_item IN 
    SELECT bq.*
    FROM building_queue bq
    WHERE bq.end_time IS NOT NULL 
      AND bq.end_time <= NOW()
    ORDER BY bq.end_time ASC
    LIMIT 100
  LOOP
    BEGIN
      INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
      VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false, NULL)
      ON CONFLICT (planet_id, building_type_id)
      DO UPDATE SET 
        level = GREATEST(planet_buildings.level, v_queue_item.target_level),
        is_upgrading = false,
        upgrade_end_time = NULL;
      
      UPDATE planets SET fields_used = LEAST(fields_max, fields_used + 1) WHERE id = v_queue_item.planet_id;
      DELETE FROM building_queue WHERE id = v_queue_item.id;
      UPDATE building_queue SET queue_position = queue_position - 1 
      WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;
      
      v_building_completed := v_building_completed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;
  
  FOR v_queue_item IN 
    SELECT sq.*
    FROM shipyard_queue sq
    WHERE sq.current_unit_end_time IS NOT NULL 
      AND sq.current_unit_end_time <= NOW()
    ORDER BY sq.current_unit_end_time ASC
    LIMIT 100
  LOOP
    BEGIN
      v_units_to_complete := v_queue_item.quantity - v_queue_item.quantity_completed;
      
      IF v_queue_item.item_type = 'ship' AND v_queue_item.ship_type_id IS NOT NULL THEN
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (v_queue_item.planet_id, v_queue_item.ship_type_id, v_units_to_complete)
        ON CONFLICT (planet_id, ship_type_id)
        DO UPDATE SET quantity = planet_ships.quantity + v_units_to_complete;
      ELSIF v_queue_item.item_type = 'defense' AND v_queue_item.defense_type_id IS NOT NULL THEN
        INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
        VALUES (v_queue_item.planet_id, v_queue_item.defense_type_id, v_units_to_complete)
        ON CONFLICT (planet_id, defense_type_id)
        DO UPDATE SET quantity = planet_defenses.quantity + v_units_to_complete;
      END IF;
      
      DELETE FROM shipyard_queue WHERE id = v_queue_item.id;
      UPDATE shipyard_queue SET queue_position = queue_position - 1 
      WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;
      
      v_shipyard_completed := v_shipyard_completed + v_units_to_complete;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;
  
  FOR v_queue_item IN 
    SELECT ut.*
    FROM user_technologies ut
    WHERE ut.is_researching = true
      AND ut.research_end_time IS NOT NULL
      AND ut.research_end_time <= NOW()
    ORDER BY ut.research_end_time ASC
    LIMIT 50
  LOOP
    BEGIN
      UPDATE user_technologies
      SET level = level + 1,
          is_researching = false,
          research_end_time = NULL,
          research_planet_id = NULL
      WHERE id = v_queue_item.id;
      
      v_research_completed := v_research_completed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'building_completed', v_building_completed,
    'shipyard_completed', v_shipyard_completed,
    'research_completed', v_research_completed,
    'errors', v_errors,
    'timestamp', NOW()
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION global_process_all_expired_queues() TO authenticated;
GRANT EXECUTE ON FUNCTION global_process_all_expired_queues() TO service_role;