/*
  # Fix Revenue Tracking - Actualiza funciones existentes
  
  Agrega registro de ingresos en admin_revenue para todas
  las funciones de completado instantaneo.
*/

-- Actualizar instant_complete_building(uuid)
CREATE OR REPLACE FUNCTION instant_complete_building(p_queue_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT bq.id, bq.planet_id, bq.building_type_id, bq.target_level, bq.build_time,
         bq.queue_position, bq.start_time, bq.end_time, bt.name as building_name, p.user_id as planet_owner
  INTO v_queue_item
  FROM building_queue bq
  JOIN building_types bt ON bq.building_type_id = bt.id
  JOIN planets p ON bq.planet_id = p.id
  WHERE bq.id = p_queue_id AND bq.queue_position = 1 AND bq.end_time IS NOT NULL;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_fxu_cost := calculate_fxu_cost_building(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building already complete');
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

  -- Registrar ingreso
  PERFORM record_admin_revenue('instant_build', v_fxu_cost,
    'Construccion: ' || v_queue_item.building_name || ' Lv' || v_queue_item.target_level, v_user_id, p_queue_id);

  SELECT * INTO v_existing_building FROM planet_buildings 
  WHERE planet_id = v_queue_item.planet_id AND building_type_id = v_queue_item.building_type_id;

  IF FOUND THEN
    v_levels_added := v_queue_item.target_level - v_existing_building.level;
    UPDATE planet_buildings SET level = v_queue_item.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    v_levels_added := v_queue_item.target_level;
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false);
  END IF;

  IF v_levels_added > 0 THEN
    UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue_item.planet_id;
  END IF;

  DELETE FROM building_queue WHERE id = p_queue_id;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos FROM building_queue WHERE planet_id = v_queue_item.planet_id
  )
  UPDATE building_queue bq SET queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND bq.start_time IS NULL THEN NOW() ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND bq.end_time IS NULL THEN NOW() + (bq.build_time || ' seconds')::interval ELSE bq.end_time END
  FROM reordered r WHERE bq.id = r.id;

  PERFORM update_user_points(v_user_id);
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_queue_item.target_level);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Actualizar instant_complete_research(uuid) - usando p_technology_id
CREATE OR REPLACE FUNCTION instant_complete_research(p_technology_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT rq.id, rq.technology_type_id, rq.target_level, rq.research_time, rq.queue_position,
         rq.start_time, rq.end_time, tt.name as tech_name, rq.user_id as queue_owner
  INTO v_queue_item
  FROM research_queue rq
  JOIN technology_types tt ON rq.technology_type_id = tt.id
  WHERE rq.id = p_technology_id AND rq.queue_position = 1 AND rq.end_time IS NOT NULL;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  IF v_queue_item.queue_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your research');
  END IF;

  v_fxu_cost := calculate_fxu_cost_research(p_technology_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already complete');
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

  -- Registrar ingreso
  PERFORM record_admin_revenue('instant_research', v_fxu_cost,
    'Investigacion: ' || v_queue_item.tech_name || ' Lv' || v_queue_item.target_level, v_user_id, p_technology_id);

  INSERT INTO user_technologies (user_id, technology_type_id, level)
  VALUES (v_user_id, v_queue_item.technology_type_id, v_queue_item.target_level)
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET level = v_queue_item.target_level;

  DELETE FROM research_queue WHERE id = p_technology_id;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos FROM research_queue WHERE user_id = v_user_id
  )
  UPDATE research_queue rq SET queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND rq.start_time IS NULL THEN NOW() ELSE rq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND rq.end_time IS NULL THEN NOW() + (rq.research_time || ' seconds')::interval ELSE rq.end_time END
  FROM reordered r WHERE rq.id = r.id;

  PERFORM update_user_points(v_user_id);
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_queue_item.target_level);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Actualizar instant_complete_shipyard_item(uuid)
CREATE OR REPLACE FUNCTION instant_complete_shipyard_item(p_queue_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
  v_item_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT sq.id, sq.planet_id, sq.item_type, sq.item_id, sq.quantity, sq.build_time,
         sq.queue_position, sq.start_time, sq.end_time, p.user_id as planet_owner
  INTO v_queue_item
  FROM shipyard_queue sq
  JOIN planets p ON sq.planet_id = p.id
  WHERE sq.id = p_queue_id AND sq.queue_position = 1 AND sq.end_time IS NOT NULL;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
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

  IF v_queue_item.item_type = 'ship' THEN
    SELECT name INTO v_item_name FROM ship_types WHERE id = v_queue_item.item_id;
  ELSE
    SELECT name INTO v_item_name FROM defense_types WHERE id = v_queue_item.item_id;
  END IF;

  -- Registrar ingreso
  PERFORM record_admin_revenue('instant_ship', v_fxu_cost,
    v_queue_item.quantity || 'x ' || COALESCE(v_item_name, v_queue_item.item_type), v_user_id, p_queue_id);

  IF v_queue_item.item_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_queue_item.planet_id, v_queue_item.item_id, v_queue_item.quantity)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_queue_item.quantity;
  ELSE
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    VALUES (v_queue_item.planet_id, v_queue_item.item_id, v_queue_item.quantity)
    ON CONFLICT (planet_id, defense_type_id) DO UPDATE SET quantity = planet_defenses.quantity + v_queue_item.quantity;
  END IF;

  DELETE FROM shipyard_queue WHERE id = p_queue_id;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos FROM shipyard_queue WHERE planet_id = v_queue_item.planet_id
  )
  UPDATE shipyard_queue sq SET queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND sq.start_time IS NULL THEN NOW() ELSE sq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND sq.end_time IS NULL THEN NOW() + (sq.build_time || ' seconds')::interval ELSE sq.end_time END
  FROM reordered r WHERE sq.id = r.id;

  PERFORM update_user_points(v_user_id);
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'quantity', v_queue_item.quantity);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Actualizar instant_complete_shipyard(uuid, uuid) 
CREATE OR REPLACE FUNCTION instant_complete_shipyard(p_planet_id uuid, p_queue_id uuid)
RETURNS jsonb AS $$
BEGIN
  RETURN instant_complete_shipyard_item(p_queue_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
