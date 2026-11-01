/*
  # Secure Market Transaction Functions

  1. New Functions
    - `purchase_market_listing` - Handles buying a listing atomically and securely
    - `cancel_market_listing` - Handles cancelling a listing and returning items
    
  2. Security
    - Both functions use SECURITY DEFINER to bypass RLS
    - All validations performed inside the function
    - Atomic transactions prevent race conditions
    
  3. Changes
    - Fixes critical RLS issues where buyer couldn't update seller's data
*/

-- Function to purchase a market listing
CREATE OR REPLACE FUNCTION purchase_market_listing(
  p_listing_id uuid,
  p_buyer_planet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing record;
  v_buyer_id uuid;
  v_buyer_fxu numeric;
  v_seller_fxu numeric;
  v_total_cost numeric;
  v_seller_receives numeric;
  v_ship_type_id int;
  v_existing_ship record;
  v_existing_resource record;
  v_buyer_dm int;
  v_market_fee_percent numeric := 10;
BEGIN
  -- Get the authenticated user
  v_buyer_id := auth.uid();
  
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Lock and get the listing
  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada');
  END IF;
  
  -- Check listing is still active
  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta ya no esta disponible');
  END IF;
  
  -- Prevent buying own listing
  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes comprar tu propia oferta');
  END IF;
  
  -- Calculate costs
  v_total_cost := v_listing.total_price;
  v_seller_receives := v_total_cost * (1 - v_market_fee_percent / 100);
  
  -- Get buyer's FXU balance
  SELECT fxu_balance, dark_matter INTO v_buyer_fxu, v_buyer_dm
  FROM profiles
  WHERE id = v_buyer_id;
  
  IF v_buyer_fxu IS NULL OR v_buyer_fxu < v_total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes suficiente FXU');
  END IF;
  
  -- Verify buyer owns the target planet (except for dark matter which doesn't need a planet)
  IF v_listing.listing_type != 'dark_matter' THEN
    IF NOT EXISTS (
      SELECT 1 FROM planets WHERE id = p_buyer_planet_id AND user_id = v_buyer_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta no valido');
    END IF;
  END IF;
  
  -- Mark listing as sold
  UPDATE market_listings
  SET status = 'sold', updated_at = now()
  WHERE id = p_listing_id;
  
  -- Deduct FXU from buyer
  UPDATE profiles
  SET fxu_balance = fxu_balance - v_total_cost
  WHERE id = v_buyer_id;
  
  -- Credit FXU to seller (minus fee)
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + v_seller_receives
  WHERE id = v_listing.seller_id;
  
  -- Transfer the items to buyer
  IF v_listing.listing_type = 'resource' THEN
    -- Add resources to buyer's planet
    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    END IF;
    
  ELSIF v_listing.listing_type = 'dark_matter' THEN
    -- Add dark matter to buyer's profile
    UPDATE profiles
    SET dark_matter = COALESCE(dark_matter, 0) + v_listing.quantity
    WHERE id = v_buyer_id;
    
  ELSIF v_listing.listing_type = 'ship' THEN
    -- Get ship type id
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
    
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave no encontrado');
    END IF;
    
    -- Check if buyer already has this ship type
    SELECT * INTO v_existing_ship
    FROM planet_ships
    WHERE planet_id = p_buyer_planet_id AND ship_type_id = v_ship_type_id;
    
    IF FOUND THEN
      UPDATE planet_ships
      SET quantity = quantity + v_listing.quantity
      WHERE planet_id = p_buyer_planet_id AND ship_type_id = v_ship_type_id;
    ELSE
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (p_buyer_planet_id, v_ship_type_id, v_listing.quantity);
    END IF;
  END IF;
  
  -- Record the transaction
  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, v_listing.listing_type, v_listing.item_code, v_listing.quantity, v_listing.total_price);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Compra realizada exitosamente',
    'total_paid', v_total_cost,
    'seller_received', v_seller_receives
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al procesar la compra: ' || SQLERRM);
END;
$$;

-- Function to cancel a market listing
CREATE OR REPLACE FUNCTION cancel_market_listing(
  p_listing_id uuid,
  p_return_planet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing record;
  v_user_id uuid;
  v_ship_type_id int;
  v_existing_ship record;
  v_target_planet_id uuid;
  v_user_dm int;
BEGIN
  -- Get the authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Lock and get the listing
  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada');
  END IF;
  
  -- Verify ownership
  IF v_listing.seller_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres el dueno de esta oferta');
  END IF;
  
  -- Check listing is still active
  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta ya no se puede cancelar');
  END IF;
  
  -- Determine target planet for returns
  IF v_listing.listing_type = 'dark_matter' THEN
    v_target_planet_id := NULL;
  ELSE
    v_target_planet_id := COALESCE(p_return_planet_id, v_listing.planet_id);
    
    -- Verify user owns the target planet
    IF NOT EXISTS (
      SELECT 1 FROM planets WHERE id = v_target_planet_id AND user_id = v_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta de destino no valido');
    END IF;
  END IF;
  
  -- Mark listing as cancelled
  UPDATE market_listings
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_listing_id;
  
  -- Return the items
  IF v_listing.listing_type = 'resource' THEN
    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_listing.quantity WHERE planet_id = v_target_planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_listing.quantity WHERE planet_id = v_target_planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_listing.quantity WHERE planet_id = v_target_planet_id;
    END IF;
    
  ELSIF v_listing.listing_type = 'dark_matter' THEN
    UPDATE profiles
    SET dark_matter = COALESCE(dark_matter, 0) + v_listing.quantity
    WHERE id = v_user_id;
    
  ELSIF v_listing.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
    
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave no encontrado');
    END IF;
    
    SELECT * INTO v_existing_ship
    FROM planet_ships
    WHERE planet_id = v_target_planet_id AND ship_type_id = v_ship_type_id;
    
    IF FOUND THEN
      UPDATE planet_ships
      SET quantity = quantity + v_listing.quantity
      WHERE planet_id = v_target_planet_id AND ship_type_id = v_ship_type_id;
    ELSE
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (v_target_planet_id, v_ship_type_id, v_listing.quantity);
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Oferta cancelada exitosamente',
    'items_returned', v_listing.quantity
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cancelar: ' || SQLERRM);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION purchase_market_listing(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_market_listing(uuid, uuid) TO authenticated;
