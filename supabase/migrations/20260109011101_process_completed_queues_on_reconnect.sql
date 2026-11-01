/*
  # Process Completed Queues on Reconnect

  ## Problem
  When users go offline and reconnect later, their completed buildings, ships, and
  defenses are not automatically processed because the client-side timers were not running.

  ## Solution
  1. Create `process_completed_shipyard_queue` function to handle offline shipyard completions
  2. Ensure both building and shipyard processing happens server-side when data is fetched

  ## Changes
  - New function: `process_completed_shipyard_queue(p_planet_id uuid)`
    - Processes all completed units in the shipyard queue
    - Adds completed ships/defenses to planet inventory
    - Removes completed queue items and reorders remaining items
*/

CREATE OR REPLACE FUNCTION process_completed_shipyard_queue(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item RECORD;
  v_completed_units integer := 0;
  v_total_completed integer := 0;
  v_now timestamptz := NOW();
  v_build_time_ms bigint;
  v_elapsed_ms bigint;
  v_units_to_complete integer;
  v_remaining_units integer;
  v_existing_ship planet_ships%ROWTYPE;
  v_existing_defense planet_defenses%ROWTYPE;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  FOR v_queue_item IN 
    SELECT * FROM shipyard_queue 
    WHERE planet_id = p_planet_id 
      AND queue_position = 1
      AND current_unit_end_time IS NOT NULL
      AND current_unit_end_time <= v_now
    ORDER BY queue_position
  LOOP
    v_build_time_ms := GREATEST(1000, v_queue_item.build_time_per_unit * 1000);
    v_elapsed_ms := EXTRACT(EPOCH FROM (v_now - v_queue_item.current_unit_end_time)) * 1000;
    v_remaining_units := v_queue_item.quantity - v_queue_item.quantity_completed;
    
    v_units_to_complete := LEAST(
      1 + FLOOR(v_elapsed_ms / v_build_time_ms)::integer,
      v_remaining_units
    );

    IF v_units_to_complete > 0 THEN
      IF v_queue_item.item_type = 'ship' AND v_queue_item.ship_type_id IS NOT NULL THEN
        SELECT * INTO v_existing_ship 
        FROM planet_ships 
        WHERE planet_id = p_planet_id AND ship_type_id = v_queue_item.ship_type_id;

        IF FOUND THEN
          UPDATE planet_ships 
          SET quantity = quantity + v_units_to_complete 
          WHERE id = v_existing_ship.id;
        ELSE
          INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
          VALUES (p_planet_id, v_queue_item.ship_type_id, v_units_to_complete);
        END IF;
      ELSIF v_queue_item.item_type = 'defense' AND v_queue_item.defense_type_id IS NOT NULL THEN
        SELECT * INTO v_existing_defense 
        FROM planet_defenses 
        WHERE planet_id = p_planet_id AND defense_type_id = v_queue_item.defense_type_id;

        IF FOUND THEN
          UPDATE planet_defenses 
          SET quantity = quantity + v_units_to_complete 
          WHERE id = v_existing_defense.id;
        ELSE
          INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
          VALUES (p_planet_id, v_queue_item.defense_type_id, v_units_to_complete);
        END IF;
      END IF;

      v_total_completed := v_total_completed + v_units_to_complete;

      IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
        DELETE FROM shipyard_queue WHERE id = v_queue_item.id;
        
        UPDATE shipyard_queue
        SET 
          queue_position = queue_position - 1,
          start_time = CASE WHEN queue_position = 2 THEN v_now ELSE start_time END,
          current_unit_end_time = CASE 
            WHEN queue_position = 2 THEN v_now + (build_time_per_unit || ' seconds')::interval 
            ELSE current_unit_end_time 
          END
        WHERE planet_id = p_planet_id AND queue_position > 1;
      ELSE
        UPDATE shipyard_queue
        SET 
          quantity_completed = quantity_completed + v_units_to_complete,
          current_unit_end_time = v_now + (build_time_per_unit || ' seconds')::interval
        WHERE id = v_queue_item.id;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_units', v_total_completed);
END;
$$;
