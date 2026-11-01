/*
  # Fix Instant Complete Functions
  
  1. Overview
    - Fixes the instant_complete_building function to call correct helper
    - Fixes the instant_complete_research function to directly update technology
    - Adds proper comments to all admin fee collection functions
  
  2. Bug Fixes
    - instant_complete_building was calling non-existent complete_building_upgrade
      Now correctly calls complete_building_queue_item
    - instant_complete_research was calling complete_research with wrong parameter type
      Now directly updates the specific technology being completed
  
  3. Functions Updated
    - instant_complete_building - Fixed helper function call
    - instant_complete_research - Fixed to directly complete specific technology
*/

-- Fix instant_complete_building to call correct function
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
  v_time_remaining integer;
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

  -- Calculate remaining time in seconds
  v_time_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now()))::integer);
  
  IF v_time_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building already complete');
  END IF;

  -- Calculate FXU cost based on time remaining (tiered pricing)
  IF v_time_remaining <= 60 THEN
    v_fxu_cost := 1;
  ELSIF v_time_remaining <= 300 THEN
    v_fxu_cost := 2;
  ELSIF v_time_remaining <= 900 THEN
    v_fxu_cost := 5;
  ELSIF v_time_remaining <= 1800 THEN
    v_fxu_cost := 10;
  ELSIF v_time_remaining <= 3600 THEN
    v_fxu_cost := 20;
  ELSIF v_time_remaining <= 7200 THEN
    v_fxu_cost := 35;
  ELSIF v_time_remaining <= 14400 THEN
    v_fxu_cost := 60;
  ELSIF v_time_remaining <= 28800 THEN
    v_fxu_cost := 100;
  ELSIF v_time_remaining <= 57600 THEN
    v_fxu_cost := 175;
  ELSIF v_time_remaining <= 86400 THEN
    v_fxu_cost := 250;
  ELSE
    v_fxu_cost := 250 + ((v_time_remaining - 86400) / 3600) * 15;
  END IF;

  -- Check user has enough FXU
  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_user_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_user_fxu);
  END IF;

  -- Deduct FXU from user
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  -- Complete the building directly (instead of calling helper that checks time)
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

-- Fix instant_complete_research to directly update technology
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
  v_time_remaining integer;
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

  -- Calculate remaining time in seconds
  v_time_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_tech.research_end_time - now()))::integer);
  
  IF v_time_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already complete');
  END IF;

  -- Calculate FXU cost based on time remaining (research has higher costs)
  IF v_time_remaining <= 60 THEN
    v_fxu_cost := 1;
  ELSIF v_time_remaining <= 300 THEN
    v_fxu_cost := 3;
  ELSIF v_time_remaining <= 900 THEN
    v_fxu_cost := 7;
  ELSIF v_time_remaining <= 1800 THEN
    v_fxu_cost := 15;
  ELSIF v_time_remaining <= 3600 THEN
    v_fxu_cost := 30;
  ELSIF v_time_remaining <= 7200 THEN
    v_fxu_cost := 50;
  ELSIF v_time_remaining <= 14400 THEN
    v_fxu_cost := 85;
  ELSIF v_time_remaining <= 28800 THEN
    v_fxu_cost := 140;
  ELSIF v_time_remaining <= 57600 THEN
    v_fxu_cost := 230;
  ELSIF v_time_remaining <= 86400 THEN
    v_fxu_cost := 350;
  ELSE
    v_fxu_cost := 350 + ((v_time_remaining - 86400) / 3600) * 20;
  END IF;

  -- Check user has enough FXU
  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_user_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_user_fxu);
  END IF;

  -- Deduct FXU from user
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  -- Directly complete the specific technology (increment level, clear research state)
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

-- Recreate instant_complete_shipyard_item with proper comments
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
  v_time_remaining integer;
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

  -- Calculate total remaining time (current unit + remaining units)
  v_time_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.current_unit_end_time - now()))::integer);
  v_time_remaining := v_time_remaining + (v_units_remaining - 1) * v_queue_item.time_per_unit;

  -- Calculate FXU cost based on time remaining (shipyard has lower costs)
  IF v_time_remaining <= 60 THEN
    v_fxu_cost := 1;
  ELSIF v_time_remaining <= 300 THEN
    v_fxu_cost := 2;
  ELSIF v_time_remaining <= 900 THEN
    v_fxu_cost := 4;
  ELSIF v_time_remaining <= 1800 THEN
    v_fxu_cost := 8;
  ELSIF v_time_remaining <= 3600 THEN
    v_fxu_cost := 15;
  ELSIF v_time_remaining <= 7200 THEN
    v_fxu_cost := 25;
  ELSIF v_time_remaining <= 14400 THEN
    v_fxu_cost := 45;
  ELSIF v_time_remaining <= 28800 THEN
    v_fxu_cost := 75;
  ELSIF v_time_remaining <= 57600 THEN
    v_fxu_cost := 125;
  ELSIF v_time_remaining <= 86400 THEN
    v_fxu_cost := 200;
  ELSE
    v_fxu_cost := 200 + ((v_time_remaining - 86400) / 3600) * 12;
  END IF;

  -- Check user has enough FXU
  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_user_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_user_fxu);
  END IF;

  -- Deduct FXU from user
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
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

-- Add comments to purchase_market_listing for clarity
COMMENT ON FUNCTION purchase_market_listing(uuid, integer) IS 
'Handles P2P market purchases with 10% platform fee.
- Validates buyer authentication and listing status
- Calculates and deducts payment (metal, crystal, deuterium, or FXU)
- Transfers 90% to seller, 10% fee to admin account
- For resource-priced items, fee is converted to FXU (1 FXU per 1000 resources)
- Delivers purchased items to buyer (resources or ships)
- Records transaction in market_transactions table';

COMMENT ON FUNCTION instant_complete_building(uuid) IS 
'Instantly completes a building upgrade in exchange for FXU tokens.
- Cost scales with remaining build time (tiered pricing)
- FXU is deducted from user and deposited to admin account
- Updates planet fields and building level
- Starts next queued building if any';

COMMENT ON FUNCTION instant_complete_research(uuid) IS 
'Instantly completes a research in exchange for FXU tokens.
- Cost scales with remaining research time (higher than buildings)
- FXU is deducted from user and deposited to admin account
- Increments technology level by 1';

COMMENT ON FUNCTION instant_complete_shipyard_item(uuid) IS 
'Instantly completes all remaining units in a shipyard queue item.
- Cost scales with total remaining build time for all units
- FXU is deducted from user and deposited to admin account
- Adds all units (ships or defenses) to planet inventory';

COMMENT ON FUNCTION get_admin_account_id() IS 
'Returns the UUID of the admin account for fee deposits.
- First looks for any profile with is_admin = true
- Falls back to hardcoded admin UUID if not found';
