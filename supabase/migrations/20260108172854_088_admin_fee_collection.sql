/*
  # Admin Fee Collection System
  
  1. Overview
    - Routes all platform fees and instant completion tokens to the admin account
    - Implements fee collection for P2P market transactions (10% fee)
    - Implements FXU collection for instant completion features
  
  2. New Functions
    - `get_admin_account_id()` - Returns the admin account UUID for fee deposits
  
  3. Modified Functions
    - `purchase_market_listing` - Now deposits 10% market fee to admin's fxu_balance
    - `instant_complete_building` - Now deposits FXU cost to admin's fxu_balance
    - `instant_complete_research` - Now deposits FXU cost to admin's fxu_balance
    - `instant_complete_shipyard_item` - Now deposits FXU cost to admin's fxu_balance
  
  4. Security
    - Admin account ID is stored in a secure function
    - All fee deposits happen within existing transaction contexts
    - No new RLS policies needed (internal function calls only)
*/

-- Helper function to get admin account ID
CREATE OR REPLACE FUNCTION get_admin_account_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id
  FROM profiles
  WHERE is_admin = true
  LIMIT 1;
  
  IF v_admin_id IS NULL THEN
    v_admin_id := 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6'::uuid;
  END IF;
  
  RETURN v_admin_id;
END;
$$;

-- Update purchase_market_listing to deposit fee to admin
DROP FUNCTION IF EXISTS purchase_market_listing(uuid, integer);

CREATE FUNCTION purchase_market_listing(
  p_listing_id uuid,
  p_quantity integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing record;
  v_buyer_id uuid;
  v_buyer_planet_id uuid;
  v_buyer_resources record;
  v_total_cost bigint;
  v_purchase_quantity integer;
  v_remaining_quantity integer;
  v_market_fee_percent integer := 10;
  v_seller_receives bigint;
  v_market_fee bigint;
  v_admin_id uuid;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or no longer active');
  END IF;

  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot purchase your own listing');
  END IF;

  v_purchase_quantity := COALESCE(p_quantity, v_listing.quantity);
  
  IF v_purchase_quantity <= 0 OR v_purchase_quantity > v_listing.quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  v_total_cost := v_listing.price_per_unit * v_purchase_quantity;
  v_market_fee := (v_total_cost * v_market_fee_percent) / 100;
  v_seller_receives := v_total_cost - v_market_fee;

  SELECT current_planet_id INTO v_buyer_planet_id
  FROM profiles
  WHERE id = v_buyer_id;

  SELECT metal, crystal, deuterium INTO v_buyer_resources
  FROM planet_resources
  WHERE planet_id = v_buyer_planet_id;

  CASE v_listing.price_resource
    WHEN 'metal' THEN
      IF v_buyer_resources.metal < v_total_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient metal');
      END IF;
      UPDATE planet_resources SET metal = metal - v_total_cost WHERE planet_id = v_buyer_planet_id;
      UPDATE planet_resources SET metal = metal + v_seller_receives WHERE planet_id = v_listing.planet_id;
    WHEN 'crystal' THEN
      IF v_buyer_resources.crystal < v_total_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient crystal');
      END IF;
      UPDATE planet_resources SET crystal = crystal - v_total_cost WHERE planet_id = v_buyer_planet_id;
      UPDATE planet_resources SET crystal = crystal + v_seller_receives WHERE planet_id = v_listing.planet_id;
    WHEN 'deuterium' THEN
      IF v_buyer_resources.deuterium < v_total_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient deuterium');
      END IF;
      UPDATE planet_resources SET deuterium = deuterium - v_total_cost WHERE planet_id = v_buyer_planet_id;
      UPDATE planet_resources SET deuterium = deuterium + v_seller_receives WHERE planet_id = v_listing.planet_id;
    WHEN 'fxu' THEN
      DECLARE
        v_buyer_fxu bigint;
      BEGIN
        SELECT fxu_balance INTO v_buyer_fxu FROM profiles WHERE id = v_buyer_id;
        IF v_buyer_fxu < v_total_cost THEN
          RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU');
        END IF;
        UPDATE profiles SET fxu_balance = fxu_balance - v_total_cost WHERE id = v_buyer_id;
        UPDATE profiles SET fxu_balance = fxu_balance + v_seller_receives WHERE id = v_listing.seller_id;
      END;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid price resource');
  END CASE;

  -- Deposit market fee to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL AND v_market_fee > 0 THEN
    IF v_listing.price_resource = 'fxu' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_market_fee WHERE id = v_admin_id;
    ELSE
      UPDATE profiles SET fxu_balance = fxu_balance + GREATEST(1, v_market_fee / 1000) WHERE id = v_admin_id;
    END IF;
  END IF;

  CASE v_listing.listing_type
    WHEN 'resource' THEN
      CASE v_listing.resource_type
        WHEN 'metal' THEN
          UPDATE planet_resources SET metal = metal + v_purchase_quantity WHERE planet_id = v_buyer_planet_id;
        WHEN 'crystal' THEN
          UPDATE planet_resources SET crystal = crystal + v_purchase_quantity WHERE planet_id = v_buyer_planet_id;
        WHEN 'deuterium' THEN
          UPDATE planet_resources SET deuterium = deuterium + v_purchase_quantity WHERE planet_id = v_buyer_planet_id;
      END CASE;
    WHEN 'ship' THEN
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (v_buyer_planet_id, v_listing.ship_type_id, v_purchase_quantity)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + v_purchase_quantity;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Unsupported listing type');
  END CASE;

  v_remaining_quantity := v_listing.quantity - v_purchase_quantity;
  
  IF v_remaining_quantity <= 0 THEN
    UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  ELSE
    UPDATE market_listings SET quantity = v_remaining_quantity, updated_at = now() WHERE id = p_listing_id;
  END IF;

  INSERT INTO market_transactions (listing_id, buyer_id, quantity, total_price, fee_amount)
  VALUES (p_listing_id, v_buyer_id, v_purchase_quantity, v_total_cost, v_market_fee);

  RETURN jsonb_build_object(
    'success', true,
    'quantity_purchased', v_purchase_quantity,
    'total_cost', v_total_cost,
    'fee_paid', v_market_fee
  );
END;
$$;

-- Update instant_complete_building to deposit FXU to admin
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT bq.*, p.user_id as planet_owner
  INTO v_queue_item
  FROM building_queue bq
  JOIN planets p ON p.id = bq.planet_id
  WHERE bq.id = p_queue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_time_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now()))::integer);
  
  IF v_time_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building already complete');
  END IF;

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

  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_user_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_user_fxu);
  END IF;

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  UPDATE building_queue SET end_time = now() - interval '1 second' WHERE id = p_queue_id;

  PERFORM complete_building_upgrade(p_queue_id);

  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$$;

-- Update instant_complete_research to deposit FXU to admin
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_tech
  FROM user_technologies
  WHERE id = p_technology_id AND user_id = v_user_id AND is_researching = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research not found or not in progress');
  END IF;

  v_time_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_tech.research_end_time - now()))::integer);
  
  IF v_time_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already complete');
  END IF;

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

  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_user_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_user_fxu);
  END IF;

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  PERFORM complete_research(p_technology_id);

  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$$;

-- Update instant_complete_shipyard_item to deposit FXU to admin
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT sq.*, p.user_id as planet_owner
  INTO v_queue_item
  FROM shipyard_queue sq
  JOIN planets p ON p.id = sq.planet_id
  WHERE sq.id = p_queue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_units_remaining := v_queue_item.quantity - v_queue_item.quantity_completed;
  
  IF v_units_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'All units already complete');
  END IF;

  v_time_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.current_unit_end_time - now()))::integer);
  v_time_remaining := v_time_remaining + (v_units_remaining - 1) * v_queue_item.time_per_unit;

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

  SELECT fxu_balance INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_user_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_user_fxu);
  END IF;

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Deposit FXU to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

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

  DELETE FROM shipyard_queue WHERE id = p_queue_id;

  UPDATE shipyard_queue
  SET queue_position = queue_position - 1
  WHERE planet_id = v_queue_item.planet_id
    AND item_type = v_queue_item.item_type
    AND queue_position > v_queue_item.queue_position;

  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'units_completed', v_units_remaining);
END;
$$;
