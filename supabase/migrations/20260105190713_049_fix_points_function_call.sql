/*
  # Fix Points Function Call in Instant Complete Functions
  
  The instant complete functions were calling `calculate_user_points` which doesn't exist.
  The correct function is `update_player_points`.
*/

-- Drop and recreate instant_complete_building with correct function call
DROP FUNCTION IF EXISTS instant_complete_building(uuid);

CREATE FUNCTION public.instant_complete_building(p_queue_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item building_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_queue_item FROM building_queue WHERE id = p_queue_id;
  IF v_queue_item IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  
  SELECT * INTO v_planet FROM planets WHERE id = v_queue_item.planet_id;
  IF v_planet.user_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not your planet');
  END IF;
  
  v_fxu_cost := calculate_fxu_cost_building(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Building already complete');
  END IF;
  
  SELECT fxu_balance::integer INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient FXU balance', 'required', v_fxu_cost, 'current', v_current_fxu);
  END IF;
  
  -- Deduct FXU
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  -- Complete the building
  INSERT INTO planet_buildings (planet_id, building_type_id, level)
  VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level)
  ON CONFLICT (planet_id, building_type_id)
  DO UPDATE SET level = EXCLUDED.level;
  
  -- Remove from queue
  DELETE FROM building_queue WHERE id = p_queue_id;
  
  -- Reorder remaining queue items
  UPDATE building_queue
  SET queue_position = queue_position - 1,
      start_time = CASE WHEN queue_position = 2 THEN now() ELSE start_time END,
      end_time = CASE WHEN queue_position = 2 THEN now() + (build_time || ' seconds')::interval ELSE end_time END
  WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;
  
  -- Update player points using correct function
  PERFORM update_player_points(v_user_id);
  
  RETURN json_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$$;

-- Drop and recreate instant_complete_research with correct function call
DROP FUNCTION IF EXISTS instant_complete_research(uuid);

CREATE FUNCTION public.instant_complete_research(p_technology_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tech user_technologies%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_tech FROM user_technologies WHERE id = p_technology_id;
  IF v_tech IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Technology not found');
  END IF;
  
  IF v_tech.user_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not your technology');
  END IF;
  
  IF NOT v_tech.is_researching THEN
    RETURN json_build_object('success', false, 'error', 'Technology not being researched');
  END IF;
  
  v_fxu_cost := calculate_fxu_cost_research(p_technology_id);
  IF v_fxu_cost <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Research already complete');
  END IF;
  
  SELECT fxu_balance::integer INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient FXU balance', 'required', v_fxu_cost, 'current', v_current_fxu);
  END IF;
  
  -- Deduct FXU
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  -- Complete the research
  UPDATE user_technologies
  SET level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL
  WHERE id = p_technology_id;
  
  -- Update player points using correct function
  PERFORM update_player_points(v_user_id);
  
  RETURN json_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$$;

-- Drop and recreate instant_complete_shipyard_item with correct function call
DROP FUNCTION IF EXISTS instant_complete_shipyard_item(uuid);

CREATE FUNCTION public.instant_complete_shipyard_item(p_queue_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item shipyard_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu integer;
  v_units_remaining integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_queue_item FROM shipyard_queue WHERE id = p_queue_id;
  IF v_queue_item IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  
  SELECT * INTO v_planet FROM planets WHERE id = v_queue_item.planet_id;
  IF v_planet.user_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not your planet');
  END IF;
  
  v_units_remaining := v_queue_item.quantity - COALESCE(v_queue_item.quantity_completed, 0);
  IF v_units_remaining <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Item already complete');
  END IF;
  
  v_fxu_cost := calculate_fxu_cost_shipyard(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Item already complete');
  END IF;
  
  SELECT fxu_balance::integer INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient FXU balance', 'required', v_fxu_cost, 'current', v_current_fxu);
  END IF;
  
  -- Deduct FXU
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  -- Add ships or defenses
  IF v_queue_item.item_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_queue_item.planet_id, v_queue_item.ship_type_id, v_units_remaining)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + v_units_remaining;
  ELSE
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    VALUES (v_queue_item.planet_id, v_queue_item.defense_type_id, v_units_remaining)
    ON CONFLICT (planet_id, defense_type_id)
    DO UPDATE SET quantity = planet_defenses.quantity + v_units_remaining;
  END IF;
  
  -- Remove from queue
  DELETE FROM shipyard_queue WHERE id = p_queue_id;
  
  -- Reorder remaining queue items
  UPDATE shipyard_queue
  SET queue_position = queue_position - 1,
      start_time = CASE WHEN queue_position = 2 THEN now() ELSE start_time END,
      current_unit_end_time = CASE WHEN queue_position = 2 THEN now() + (build_time_per_unit || ' seconds')::interval ELSE current_unit_end_time END
  WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;
  
  -- Update player points using correct function
  PERFORM update_player_points(v_user_id);
  
  RETURN json_build_object('success', true, 'fxu_spent', v_fxu_cost, 'units_completed', v_units_remaining);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.instant_complete_building(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.instant_complete_research(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.instant_complete_shipyard_item(uuid) TO authenticated, anon;

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';