/*
  # Synchronize FXU Cost Calculations
  
  1. Overview
    - Ensures instant_complete functions use the SAME cost calculation
      as the display functions (calculate_fxu_cost_*)
    - Fixes mismatch between displayed cost and actual charged amount
  
  2. Changes
    - instant_complete_building now calls calculate_fxu_cost_building
    - instant_complete_research now calls calculate_fxu_cost_research
    - instant_complete_shipyard_item now calls calculate_fxu_cost_shipyard
  
  3. Business Logic
    - Building cost: ~1 FXU per 60 seconds, adjusted by resource cost
    - Research cost: ~1 FXU per 30 seconds, scaled quadratically by level
    - Shipyard cost: ~1 FXU per 90 seconds, ships 0.5x, defense 0.3x multiplier
    - All fees collected go to admin account
*/

-- Update instant_complete_building to use shared calculation
DROP FUNCTION IF EXISTS instant_complete_building(uuid);

CREATE FUNCTION instant_complete_building(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item record;
  v_user_fxu bigint;
  v_fxu_cost integer;
  v_admin_id uuid;
  v_existing_building record;
  v_levels_added integer;
BEGIN
  -- Verify authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get queue item with planet ownership check
  SELECT bq.*, p.user_id as planet_owner
  INTO v_queue_item
  FROM building_queue bq
  JOIN planets p ON p.id = bq.planet_id
  WHERE bq.id = p_queue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  -- Verify ownership
  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  -- Use shared calculation function (same as frontend display)
  v_fxu_cost := calculate_fxu_cost_building(p_queue_id);
  
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building already complete');
  END IF;

  -- Check user has enough FXU
  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF COALESCE(v_user_fxu, 0) < v_fxu_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient FXU', 
      'required', v_fxu_cost, 
      'available', COALESCE(v_user_fxu, 0)
    );
  END IF;

  -- Deduct FXU from user
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  -- Complete the building directly
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

  -- Update fields used
  IF v_levels_added > 0 THEN
    UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue_item.planet_id;
  END IF;

  -- Delete completed queue item
  DELETE FROM building_queue WHERE id = p_queue_id;

  -- Reorder remaining queue items and start next one
  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue_item.planet_id
  )
  UPDATE building_queue bq
  SET 
    queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND bq.start_time IS NULL THEN NOW() ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND bq.end_time IS NULL THEN NOW() + (bq.build_time || ' seconds')::interval ELSE bq.end_time END
  FROM reordered r
  WHERE bq.id = r.id;

  -- Update user points
  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$$;

-- Update instant_complete_research to use shared calculation
DROP FUNCTION IF EXISTS instant_complete_research(uuid);

CREATE FUNCTION instant_complete_research(p_technology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tech record;
  v_user_fxu bigint;
  v_fxu_cost integer;
  v_admin_id uuid;
BEGIN
  -- Verify authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get research item with ownership verification
  SELECT * INTO v_tech
  FROM user_technologies
  WHERE id = p_technology_id AND user_id = v_user_id AND is_researching = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research not found or not in progress');
  END IF;

  -- Use shared calculation function (same as frontend display)
  v_fxu_cost := calculate_fxu_cost_research(p_technology_id);
  
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already complete');
  END IF;

  -- Check user has enough FXU
  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF COALESCE(v_user_fxu, 0) < v_fxu_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient FXU', 
      'required', v_fxu_cost, 
      'available', COALESCE(v_user_fxu, 0)
    );
  END IF;

  -- Deduct FXU from user
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  -- Complete the specific technology (increment level, clear research state)
  UPDATE user_technologies
  SET level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL
  WHERE id = p_technology_id;

  -- Update user points
  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$$;

-- Update instant_complete_shipyard_item to use shared calculation
DROP FUNCTION IF EXISTS instant_complete_shipyard_item(uuid);

CREATE FUNCTION instant_complete_shipyard_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item record;
  v_user_fxu bigint;
  v_fxu_cost integer;
  v_units_remaining integer;
  v_admin_id uuid;
BEGIN
  -- Verify authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get queue item with planet ownership check
  SELECT sq.*, p.user_id as planet_owner
  INTO v_queue_item
  FROM shipyard_queue sq
  JOIN planets p ON p.id = sq.planet_id
  WHERE sq.id = p_queue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  -- Verify ownership
  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  -- Calculate remaining units to build
  v_units_remaining := v_queue_item.quantity - v_queue_item.quantity_completed;
  
  IF v_units_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'All units already complete');
  END IF;

  -- Use shared calculation function (same as frontend display)
  v_fxu_cost := calculate_fxu_cost_shipyard(p_queue_id);
  
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shipyard item already complete');
  END IF;

  -- Check user has enough FXU
  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF COALESCE(v_user_fxu, 0) < v_fxu_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient FXU', 
      'required', v_fxu_cost, 
      'available', COALESCE(v_user_fxu, 0)
    );
  END IF;

  -- Deduct FXU from user
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  -- Add completed units to planet (ships or defenses)
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

  -- Remove completed queue item
  DELETE FROM shipyard_queue WHERE id = p_queue_id;

  -- Reorder remaining queue items
  UPDATE shipyard_queue
  SET queue_position = queue_position - 1
  WHERE planet_id = v_queue_item.planet_id
    AND item_type = v_queue_item.item_type
    AND queue_position > v_queue_item.queue_position;

  -- Update user points
  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'units_completed', v_units_remaining);
END;
$$;

-- Add documentation comments
COMMENT ON FUNCTION instant_complete_building(uuid) IS 
'Instantly completes a building upgrade in exchange for FXU tokens.
Uses calculate_fxu_cost_building() for consistent pricing with UI.
Cost formula: ~1 FXU per 60 seconds, adjusted by resource cost.
FXU is deducted from user and deposited to admin account.';

COMMENT ON FUNCTION instant_complete_research(uuid) IS 
'Instantly completes a research in exchange for FXU tokens.
Uses calculate_fxu_cost_research() for consistent pricing with UI.
Cost formula: ~1 FXU per 30 seconds, scaled quadratically by level.
FXU is deducted from user and deposited to admin account.';

COMMENT ON FUNCTION instant_complete_shipyard_item(uuid) IS 
'Instantly completes all remaining units in a shipyard queue item.
Uses calculate_fxu_cost_shipyard() for consistent pricing with UI.
Cost formula: ~1 FXU per 90 seconds, ships 0.5x multiplier, defense 0.3x.
FXU is deducted from user and deposited to admin account.';
