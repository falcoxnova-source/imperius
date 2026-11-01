/*
  # Fix Purchase Function

  1. Changes
    - Add better error messages for debugging
    - Ensure proper handling of NULL values
    - Add explicit type casting for comparisons
*/

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
  v_buyer_profile record;
  v_total_cost numeric;
  v_seller_receives numeric;
  v_ship_type_id int;
  v_existing_ship record;
  v_market_fee_percent numeric := 10;
BEGIN
  v_buyer_id := auth.uid();
  
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_buyer_profile
  FROM profiles
  WHERE id = v_buyer_id;
  
  IF v_buyer_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada');
  END IF;
  
  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta ya no esta disponible');
  END IF;
  
  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes comprar tu propia oferta');
  END IF;
  
  v_total_cost := v_listing.total_price;
  v_seller_receives := v_total_cost * (1 - v_market_fee_percent / 100);
  
  IF COALESCE(v_buyer_profile.fxu_balance, 0) < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'No tienes suficiente FXU. Tienes ' || COALESCE(v_buyer_profile.fxu_balance, 0)::text || ' y necesitas ' || v_total_cost::text
    );
  END IF;
  
  IF v_listing.listing_type != 'dark_matter' THEN
    IF NOT EXISTS (
      SELECT 1 FROM planets WHERE id = p_buyer_planet_id AND user_id = v_buyer_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta no valido');
    END IF;
  END IF;
  
  UPDATE market_listings
  SET status = 'sold', updated_at = now()
  WHERE id = p_listing_id;
  
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_total_cost
  WHERE id = v_buyer_id;
  
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + v_seller_receives
  WHERE id = v_listing.seller_id;
  
  IF v_listing.listing_type = 'resource' THEN
    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    END IF;
    
  ELSIF v_listing.listing_type = 'dark_matter' THEN
    UPDATE profiles
    SET dark_matter = COALESCE(dark_matter, 0) + v_listing.quantity
    WHERE id = v_buyer_id;
    
  ELSIF v_listing.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
    
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave no encontrado');
    END IF;
    
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
