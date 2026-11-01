/*
  # Configurable Market and Referral Fees
  
  1. New Settings
    - `market_fee_percent` - Fee percentage charged on market transactions (default 10%)
    - `referral_commission_percent` - Commission percentage for referrers (default 5%)
  
  2. Changes
    - Add new settings to game_settings table
    - Create helper functions to get these values
    - Update purchase_market_listing to read fee from settings
    - Create admin function to update these settings
  
  3. Security
    - Only admins can update fee settings
    - All users can read fee settings (for display purposes)
*/

-- Add market fee setting
INSERT INTO game_settings (key, value, description)
VALUES ('market_fee_percent', '10', 'Porcentaje de comision del mercado P2P')
ON CONFLICT (key) DO UPDATE SET value = '10', description = 'Porcentaje de comision del mercado P2P';

-- Add referral commission setting
INSERT INTO game_settings (key, value, description)
VALUES ('referral_commission_percent', '5', 'Porcentaje de comision para referidos')
ON CONFLICT (key) DO UPDATE SET value = '5', description = 'Porcentaje de comision para referidos';

-- Function to get market fee
CREATE OR REPLACE FUNCTION get_market_fee_percent()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fee numeric;
BEGIN
  SELECT COALESCE(value::numeric, 10) INTO v_fee
  FROM game_settings
  WHERE key = 'market_fee_percent';
  
  RETURN COALESCE(v_fee, 10);
END;
$$;

-- Function to get referral commission
CREATE OR REPLACE FUNCTION get_referral_commission_percent()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_commission numeric;
BEGIN
  SELECT COALESCE(value::numeric, 5) INTO v_commission
  FROM game_settings
  WHERE key = 'referral_commission_percent';
  
  RETURN COALESCE(v_commission, 5);
END;
$$;

-- Function to get both fee settings (for admin panel)
CREATE OR REPLACE FUNCTION get_fee_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_market_fee numeric;
  v_referral_commission numeric;
BEGIN
  SELECT COALESCE(value::numeric, 10) INTO v_market_fee
  FROM game_settings WHERE key = 'market_fee_percent';
  
  SELECT COALESCE(value::numeric, 5) INTO v_referral_commission
  FROM game_settings WHERE key = 'referral_commission_percent';
  
  RETURN jsonb_build_object(
    'market_fee_percent', COALESCE(v_market_fee, 10),
    'referral_commission_percent', COALESCE(v_referral_commission, 5)
  );
END;
$$;

-- Admin function to update fee settings
CREATE OR REPLACE FUNCTION update_fee_settings(
  p_market_fee numeric DEFAULT NULL,
  p_referral_commission numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  -- Validate ranges
  IF p_market_fee IS NOT NULL THEN
    IF p_market_fee < 0 OR p_market_fee > 50 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Fee del mercado debe estar entre 0% y 50%');
    END IF;
    
    UPDATE game_settings 
    SET value = p_market_fee::text, updated_at = now()
    WHERE key = 'market_fee_percent';
  END IF;
  
  IF p_referral_commission IS NOT NULL THEN
    IF p_referral_commission < 0 OR p_referral_commission > 50 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Comision de referidos debe estar entre 0% y 50%');
    END IF;
    
    UPDATE game_settings 
    SET value = p_referral_commission::text, updated_at = now()
    WHERE key = 'referral_commission_percent';
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Configuracion actualizada');
END;
$$;

-- Update purchase_market_listing to use dynamic fee
CREATE OR REPLACE FUNCTION public.purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_listing RECORD;
  v_buyer_planet_id uuid;
  v_purchase_qty integer;
  v_total_price numeric;
  v_buyer_fxu numeric;
  v_admin_id uuid;
  v_fee numeric;
  v_seller_amount numeric;
  v_ship_type_id integer;
  v_market_fee_percent numeric;
  v_referral_commission_percent numeric;
  v_referrer_id uuid;
  v_referral_commission numeric;
  v_transaction_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get fee settings from game_settings
  v_market_fee_percent := get_market_fee_percent();
  v_referral_commission_percent := get_referral_commission_percent();

  SELECT * INTO v_listing 
  FROM market_listings 
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or not active');
  END IF;

  IF v_listing.seller_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot buy your own listing');
  END IF;

  v_purchase_qty := COALESCE(p_quantity, v_listing.quantity::integer);
  IF v_purchase_qty > v_listing.quantity OR v_purchase_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  v_total_price := v_listing.price_per_unit * v_purchase_qty;

  IF v_total_price > 1000000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total price exceeds maximum');
  END IF;

  SELECT fxu_balance INTO v_buyer_fxu 
  FROM profiles 
  WHERE id = v_user_id 
  FOR UPDATE;

  IF v_buyer_fxu < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_user_id AND is_main_planet = true LIMIT 1;
  IF v_buyer_planet_id IS NULL AND v_listing.listing_type != 'dark_matter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No main planet found');
  END IF;

  -- Calculate fee using dynamic percentage
  v_fee := v_total_price * (v_market_fee_percent / 100);
  v_seller_amount := v_total_price - v_fee;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fee WHERE id = v_admin_id;
  END IF;

  IF v_listing.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
    
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
    END IF;
    
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_buyer_planet_id, v_ship_type_id, v_purchase_qty)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_purchase_qty;
    
  ELSIF v_listing.listing_type = 'resource' THEN
    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    END IF;
    
  ELSIF v_listing.listing_type = 'dark_matter' THEN
    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_purchase_qty WHERE id = v_user_id;
  END IF;

  -- Insert transaction record
  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_user_id, v_listing.seller_id, v_listing.listing_type, v_listing.item_code, v_purchase_qty, v_total_price)
  RETURNING id INTO v_transaction_id;

  -- Process referral commission (dynamic percentage)
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;
  
  IF v_referrer_id IS NOT NULL AND v_referral_commission_percent > 0 THEN
    v_referral_commission := FLOOR(v_total_price * v_referral_commission_percent / 100);
    
    IF v_referral_commission >= 1 THEN
      UPDATE profiles 
      SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_commission
      WHERE id = v_referrer_id;
      
      INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
      VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'fxu', 'fxu', v_referral_commission, v_referral_commission);
    END IF;
  END IF;

  IF v_purchase_qty = v_listing.quantity THEN
    UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  ELSE
    UPDATE market_listings SET quantity = quantity - v_purchase_qty, total_price = (quantity - v_purchase_qty) * price_per_unit, updated_at = now() WHERE id = p_listing_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'quantity', v_purchase_qty, 'total_price', v_total_price);
END;
$function$;
