/*
  # Fix Offline Shipyard Queue Cascade Completion
  
  ## Problem
  Similar to building queue - when user is offline for extended time:
  - Only item at position 1 has timers set
  - Subsequent items don't complete even if enough time passed
  
  ## Solution
  Update process_shipyard_queue_internal to cascade completions properly
  
  ## Changes
  - Updated process_shipyard_queue_internal with cascade logic
  - Ships/defenses now properly complete even if user was offline for days
*/

CREATE OR REPLACE FUNCTION process_shipyard_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item shipyard_queue%ROWTYPE;
  v_total_units_completed integer := 0;
  v_units_to_complete integer;
  v_elapsed_seconds numeric;
  v_time_per_unit numeric;
  v_item_id integer;
  v_continue_processing boolean := true;
  v_now timestamptz := NOW();
  v_last_completion_time timestamptz;
  v_next_item shipyard_queue%ROWTYPE;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  UPDATE shipyard_queue
  SET 
    start_time = COALESCE(start_time, v_now),
    current_unit_end_time = COALESCE(current_unit_end_time, v_now + (build_time_per_unit || ' seconds')::interval)
  WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND (start_time IS NULL OR current_unit_end_time IS NULL);

  WHILE v_continue_processing LOOP
    v_continue_processing := false;
    
    SELECT * INTO v_queue_item
    FROM shipyard_queue
    WHERE planet_id = p_planet_id AND queue_position = 1
    FOR UPDATE;

    IF NOT FOUND OR v_queue_item.start_time IS NULL THEN
      EXIT;
    END IF;

    v_time_per_unit := GREATEST(1, v_queue_item.build_time_per_unit);
    v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_queue_item.start_time));
    
    v_units_to_complete := LEAST(
      FLOOR(v_elapsed_seconds / v_time_per_unit)::integer - v_queue_item.quantity_completed,
      v_queue_item.quantity - v_queue_item.quantity_completed
    );

    IF v_units_to_complete <= 0 THEN
      EXIT;
    END IF;

    IF v_queue_item.item_type = 'ship' THEN
      v_item_id := v_queue_item.ship_type_id;
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (p_planet_id, v_item_id, v_units_to_complete)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + v_units_to_complete;
    ELSE
      v_item_id := v_queue_item.defense_type_id;
      INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
      VALUES (p_planet_id, v_item_id, v_units_to_complete)
      ON CONFLICT (planet_id, defense_type_id)
      DO UPDATE SET quantity = planet_defenses.quantity + v_units_to_complete;
    END IF;

    v_total_units_completed := v_total_units_completed + v_units_to_complete;

    IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
      v_last_completion_time := v_queue_item.start_time + 
        ((v_queue_item.quantity - v_queue_item.quantity_completed) * v_time_per_unit || ' seconds')::interval;
      
      DELETE FROM shipyard_queue WHERE id = v_queue_item.id;

      WITH reordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
        FROM shipyard_queue WHERE planet_id = p_planet_id
      )
      UPDATE shipyard_queue sq
      SET queue_position = r.new_pos
      FROM reordered r WHERE sq.id = r.id;

      SELECT * INTO v_next_item 
      FROM shipyard_queue 
      WHERE planet_id = p_planet_id AND queue_position = 1;
      
      IF FOUND THEN
        UPDATE shipyard_queue
        SET 
          start_time = COALESCE(start_time, v_last_completion_time),
          current_unit_end_time = COALESCE(v_last_completion_time, v_now) + (build_time_per_unit || ' seconds')::interval
        WHERE id = v_next_item.id
          AND (start_time IS NULL OR current_unit_end_time IS NULL);
        
        v_continue_processing := true;
      END IF;
    ELSE
      UPDATE shipyard_queue
      SET quantity_completed = quantity_completed + v_units_to_complete
      WHERE id = v_queue_item.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_units', v_total_units_completed);
END;
$$;
