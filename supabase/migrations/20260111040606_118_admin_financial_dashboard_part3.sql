/*
  # Admin Financial Dashboard - Part 3
  
  Actualiza funciones de construccion instantanea para registrar ingresos
*/

CREATE OR REPLACE FUNCTION instant_complete_building(p_planet_id uuid, p_building_type_id integer)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_queue_item record;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_remaining_seconds numeric;
BEGIN
  SELECT user_id INTO v_user_id FROM planets WHERE id = p_planet_id;
  
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado');
  END IF;
  
  SELECT * INTO v_queue_item FROM building_queue
  WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id AND status = 'in_progress'
  ORDER BY queue_position LIMIT 1;
  
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay construccion en progreso');
  END IF;
  
  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now())));
  
  IF v_remaining_seconds <= 600 THEN v_fxu_cost := GREATEST(1, CEIL(v_remaining_seconds / 60));
  ELSIF v_remaining_seconds <= 3600 THEN v_fxu_cost := 10 + CEIL((v_remaining_seconds - 600) / 120);
  ELSIF v_remaining_seconds <= 86400 THEN v_fxu_cost := 35 + CEIL((v_remaining_seconds - 3600) / 300);
  ELSE v_fxu_cost := 100 + CEIL((v_remaining_seconds - 86400) / 600);
  END IF;
  
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_fxu_cost);
  END IF;
  
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  PERFORM record_admin_revenue('instant_build', v_fxu_cost,
    'Construccion: ' || (SELECT name FROM building_types WHERE id = p_building_type_id), v_user_id, v_queue_item.id);
  
  UPDATE planet_buildings SET level = v_queue_item.target_level
  WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;
  
  DELETE FROM building_queue WHERE id = v_queue_item.id;
  
  UPDATE building_queue SET start_time = now(), end_time = now() + (end_time - start_time)
  WHERE planet_id = p_planet_id AND status = 'pending'
    AND queue_position = (SELECT MIN(queue_position) FROM building_queue WHERE planet_id = p_planet_id AND status = 'pending');
  
  UPDATE building_queue SET status = 'in_progress'
  WHERE planet_id = p_planet_id AND status = 'pending'
    AND queue_position = (SELECT MIN(queue_position) FROM building_queue WHERE planet_id = p_planet_id AND status = 'pending');
  
  PERFORM update_user_points(v_user_id);
  
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_queue_item.target_level);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION instant_complete_research(p_technology_type_id integer)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_queue_item record;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_remaining_seconds numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  
  SELECT * INTO v_queue_item FROM research_queue
  WHERE user_id = v_user_id AND technology_type_id = p_technology_type_id AND status = 'in_progress' LIMIT 1;
  
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay investigacion en progreso');
  END IF;
  
  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now())));
  
  IF v_remaining_seconds <= 600 THEN v_fxu_cost := GREATEST(1, CEIL(v_remaining_seconds / 60));
  ELSIF v_remaining_seconds <= 3600 THEN v_fxu_cost := 10 + CEIL((v_remaining_seconds - 600) / 120);
  ELSIF v_remaining_seconds <= 86400 THEN v_fxu_cost := 35 + CEIL((v_remaining_seconds - 3600) / 300);
  ELSE v_fxu_cost := 100 + CEIL((v_remaining_seconds - 86400) / 600);
  END IF;
  
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_fxu_cost);
  END IF;
  
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  PERFORM record_admin_revenue('instant_research', v_fxu_cost,
    'Investigacion: ' || (SELECT name FROM technology_types WHERE id = p_technology_type_id), v_user_id, v_queue_item.id);
  
  INSERT INTO user_technologies (user_id, technology_type_id, level)
  VALUES (v_user_id, p_technology_type_id, v_queue_item.target_level)
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET level = v_queue_item.target_level;
  
  DELETE FROM research_queue WHERE id = v_queue_item.id;
  
  UPDATE research_queue SET status = 'in_progress', start_time = now(), end_time = now() + (end_time - start_time)
  WHERE user_id = v_user_id AND status = 'pending'
    AND queue_position = (SELECT MIN(queue_position) FROM research_queue WHERE user_id = v_user_id AND status = 'pending');
  
  PERFORM update_user_points(v_user_id);
  
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_queue_item.target_level);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION instant_complete_shipyard(p_planet_id uuid, p_queue_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_queue_item record;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_remaining_seconds numeric;
  v_item_name text;
BEGIN
  SELECT user_id INTO v_user_id FROM planets WHERE id = p_planet_id;
  
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado');
  END IF;
  
  SELECT * INTO v_queue_item FROM shipyard_queue WHERE id = p_queue_id AND planet_id = p_planet_id;
  
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item no encontrado');
  END IF;
  
  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now())));
  
  IF v_remaining_seconds <= 600 THEN v_fxu_cost := GREATEST(1, CEIL(v_remaining_seconds / 60));
  ELSIF v_remaining_seconds <= 3600 THEN v_fxu_cost := 10 + CEIL((v_remaining_seconds - 600) / 120);
  ELSIF v_remaining_seconds <= 86400 THEN v_fxu_cost := 35 + CEIL((v_remaining_seconds - 3600) / 300);
  ELSE v_fxu_cost := 100 + CEIL((v_remaining_seconds - 86400) / 600);
  END IF;
  
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_fxu_cost);
  END IF;
  
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  IF v_queue_item.item_type = 'ship' THEN
    SELECT name INTO v_item_name FROM ship_types WHERE id = v_queue_item.item_id;
  ELSE
    SELECT name INTO v_item_name FROM defense_types WHERE id = v_queue_item.item_id;
  END IF;
  
  PERFORM record_admin_revenue('instant_ship', v_fxu_cost,
    v_queue_item.quantity || 'x ' || COALESCE(v_item_name, 'Item'), v_user_id, v_queue_item.id);
  
  IF v_queue_item.item_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (p_planet_id, v_queue_item.item_id, v_queue_item.quantity)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_queue_item.quantity;
  ELSE
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    VALUES (p_planet_id, v_queue_item.item_id, v_queue_item.quantity)
    ON CONFLICT (planet_id, defense_type_id) DO UPDATE SET quantity = planet_defenses.quantity + v_queue_item.quantity;
  END IF;
  
  DELETE FROM shipyard_queue WHERE id = p_queue_id;
  PERFORM update_user_points(v_user_id);
  
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'quantity', v_queue_item.quantity);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
