/*
  # Fix Offline Shipyard Queue Cascade Processing

  ## Problem
  Same as buildings - when shipyard item completes offline, next item gets
  start_time = NOW() instead of inheriting from previous item's completion.

  ## Solution
  Update process_shipyard_queue_internal with cascade logic:
  1. Process all completed units based on elapsed time since start
  2. When an item fully completes, set next item's start_time to calculated completion time
  3. Loop until no more items are fully completed
*/

CREATE OR REPLACE FUNCTION process_shipyard_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet_exists boolean;
  v_queue_item shipyard_queue%ROWTYPE;
  v_total_units_completed integer := 0;
  v_units_to_complete integer;
  v_elapsed_seconds numeric;
  v_time_per_unit numeric;
  v_item_completion_time timestamptz;
  v_max_iterations integer := 50;
  v_iteration integer := 0;
BEGIN
  SELECT EXISTS(SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = p_user_id) INTO v_planet_exists;
  IF NOT v_planet_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  LOOP
    v_iteration := v_iteration + 1;
    IF v_iteration > v_max_iterations THEN
      EXIT;
    END IF;

    SELECT * INTO v_queue_item
    FROM shipyard_queue
    WHERE planet_id = p_planet_id
    ORDER BY queue_position
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      EXIT;
    END IF;

    IF v_queue_item.start_time IS NULL THEN
      v_queue_item.start_time := NOW();
      UPDATE shipyard_queue 
      SET start_time = v_queue_item.start_time,
          current_unit_end_time = v_queue_item.start_time + (build_time_per_unit || ' seconds')::interval
      WHERE id = v_queue_item.id;
    END IF;

    v_time_per_unit := v_queue_item.build_time_per_unit;
    IF v_time_per_unit <= 0 THEN v_time_per_unit := 1; END IF;

    v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_queue_item.start_time));
    
    v_units_to_complete := LEAST(
      FLOOR(v_elapsed_seconds / v_time_per_unit)::integer - v_queue_item.quantity_completed,
      v_queue_item.quantity - v_queue_item.quantity_completed
    );

    IF v_units_to_complete <= 0 THEN
      EXIT;
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

    v_total_units_completed := v_total_units_completed + v_units_to_complete;

    IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
      v_item_completion_time := v_queue_item.start_time + 
        ((v_queue_item.quantity - v_queue_item.quantity_completed) * v_time_per_unit || ' seconds')::interval;

      DELETE FROM shipyard_queue WHERE id = v_queue_item.id;

      UPDATE shipyard_queue
      SET queue_position = queue_position - 1
      WHERE planet_id = p_planet_id
      AND queue_position > 1;

      UPDATE shipyard_queue
      SET start_time = v_item_completion_time,
          current_unit_end_time = v_item_completion_time + (build_time_per_unit || ' seconds')::interval
      WHERE planet_id = p_planet_id
      AND queue_position = 1
      AND start_time IS NULL;

    ELSE
      UPDATE shipyard_queue
      SET quantity_completed = quantity_completed + v_units_to_complete
      WHERE id = v_queue_item.id;
      EXIT;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_units', v_total_units_completed);
END;
$$;
