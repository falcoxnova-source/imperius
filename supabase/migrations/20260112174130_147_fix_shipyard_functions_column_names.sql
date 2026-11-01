/*
  # Fix Shipyard Functions Column Names

  1. Bug Fixes
    - Fix `instant_complete_shipyard_item` using wrong column names:
      - `item_id` -> `ship_type_id`/`defense_type_id`
      - `build_time` -> `build_time_per_unit`
      - `end_time` -> `current_unit_end_time`
    - Fix `process_shipyard_queue_internal` using `type_id` instead of proper column names

  2. Notes
    - The shipyard_queue table uses `ship_type_id` and `defense_type_id` columns
    - Functions were referencing non-existent columns causing 400 errors
*/

CREATE OR REPLACE FUNCTION instant_complete_shipyard_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
  v_item_name text;
  v_item_id integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT sq.id, sq.planet_id, sq.item_type, sq.ship_type_id, sq.defense_type_id, 
         sq.quantity, sq.quantity_completed, sq.build_time_per_unit,
         sq.queue_position, sq.start_time, sq.current_unit_end_time, p.user_id as planet_owner
  INTO v_queue_item
  FROM shipyard_queue sq
  JOIN planets p ON sq.planet_id = p.id
  WHERE sq.id = p_queue_id AND sq.queue_position = 1 AND sq.current_unit_end_time IS NOT NULL;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found or not active');
  END IF;
  
  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_fxu_cost := calculate_fxu_cost_shipyard(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Construction already complete');
  END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost);
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  -- Determine the item_id and name based on type
  IF v_queue_item.item_type = 'ship' THEN
    v_item_id := v_queue_item.ship_type_id;
    SELECT name INTO v_item_name FROM ship_types WHERE id = v_item_id;
  ELSE
    v_item_id := v_queue_item.defense_type_id;
    SELECT name INTO v_item_name FROM defense_types WHERE id = v_item_id;
  END IF;

  -- Calculate remaining quantity
  DECLARE
    v_remaining_quantity integer;
  BEGIN
    v_remaining_quantity := v_queue_item.quantity - v_queue_item.quantity_completed;

    -- Record revenue
    PERFORM record_admin_revenue('instant_ship', v_fxu_cost,
      v_remaining_quantity || 'x ' || COALESCE(v_item_name, v_queue_item.item_type), v_user_id, p_queue_id);

    -- Add the items to the planet
    IF v_queue_item.item_type = 'ship' THEN
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (v_queue_item.planet_id, v_item_id, v_remaining_quantity)
      ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_remaining_quantity;
    ELSE
      INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
      VALUES (v_queue_item.planet_id, v_item_id, v_remaining_quantity)
      ON CONFLICT (planet_id, defense_type_id) DO UPDATE SET quantity = planet_defenses.quantity + v_remaining_quantity;
    END IF;

    -- Delete the queue item
    DELETE FROM shipyard_queue WHERE id = p_queue_id;

    -- Reorder remaining queue items and activate next item
    WITH reordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos 
      FROM shipyard_queue WHERE planet_id = v_queue_item.planet_id
    )
    UPDATE shipyard_queue sq SET 
      queue_position = r.new_pos,
      start_time = CASE WHEN r.new_pos = 1 AND sq.start_time IS NULL THEN NOW() ELSE sq.start_time END,
      current_unit_end_time = CASE WHEN r.new_pos = 1 AND sq.current_unit_end_time IS NULL THEN NOW() + (sq.build_time_per_unit || ' seconds')::interval ELSE sq.current_unit_end_time END
    FROM reordered r WHERE sq.id = r.id;

    PERFORM update_user_points(v_user_id);
    RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'quantity', v_remaining_quantity);
  END;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;


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
  v_item_id integer;
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

  -- Determine the correct item_id based on type
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
