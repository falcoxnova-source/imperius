/*
  # Simplified Referral System - Market Sales Only

  ## Overview
  The referral commission system is simplified:
  - Referrers ONLY earn commissions when their referrals SELL in the market
  - NO commissions for deposits - the referrer gets nothing when user deposits FXU
  - Commission comes from the company's 10% market fee (company pays, not the seller)

  ## How it works
  - Market fee: 10% (seller always loses exactly 10%)
  - Of that 10% fee:
    * 5% goes to the referrer (if seller has one)
    * 5% (or 10% if no referrer) stays with the company
  - Example: Sale of 100 FXU
    * Seller receives: 90 FXU
    * Total fee: 10 FXU
    * Referrer gets: 5 FXU (from company fee)
    * Company keeps: 5 FXU

  ## Changes
  - Update `purchase_market_listing` - commission clearly from company fee
  - Update `deposit_fxu` - remove referral commission (deposits don't generate commissions)
  - Update `get_referral_stats` - remove deposit_commissions tracking
  - All existing logic preserved, just cleaner separation

  ## Security
  - No changes to RLS policies
  - All functions remain SECURITY DEFINER with proper search_path
*/

-- Updated purchase_market_listing with clear commission logic
-- Commission comes from the 10% market fee, not additional
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
  v_market_fee_percent numeric := 10;
  v_seller_receives numeric;
  v_ship_type_id int;
  v_existing_ship record;
  v_referrer_id uuid;
  v_referral_commission bigint;
  v_transaction_id uuid;
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
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, v_listing.listing_type, v_listing.item_code, v_listing.quantity, v_listing.total_price)
  RETURNING id INTO v_transaction_id;
  
  /*
   * REFERRAL COMMISSION - ONLY FOR MARKET SALES
   * The commission comes from the company's 10% fee
   * Seller ALWAYS loses exactly 10%, the company pays the referrer 5% from its portion
   */
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;
  
  IF v_referrer_id IS NOT NULL THEN
    v_referral_commission := FLOOR(v_total_cost * 5 / 100);
    
    IF v_referral_commission >= 1 THEN
      UPDATE profiles
      SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_commission
      WHERE id = v_referrer_id;
      
      INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount)
      VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'market_sale', 'fxu', v_referral_commission);
    END IF;
  END IF;
  
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

-- Updated deposit_fxu WITHOUT referral commission
-- Deposits do NOT generate any referral commissions
CREATE OR REPLACE FUNCTION deposit_fxu(p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad invalida');
  END IF;

  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + p_amount
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Deposito realizado exitosamente',
    'amount', p_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION deposit_fxu(bigint) TO authenticated;

-- Updated get_referral_stats - simplified, only market commissions
CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_referral_code text;
  v_total_referrals int;
  v_total_fxu_earned bigint;
  v_recent_commissions jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT referral_code INTO v_referral_code FROM profiles WHERE id = v_user_id;
  SELECT COUNT(*) INTO v_total_referrals FROM profiles WHERE referred_by = v_user_id;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_total_fxu_earned
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'amount', rc.amount,
        'created_at', rc.created_at,
        'seller_username', p.username
      ) ORDER BY rc.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_commissions
  FROM referral_commissions rc
  JOIN profiles p ON p.id = rc.seller_id
  WHERE rc.referrer_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_fxu_earned', v_total_fxu_earned,
    'recent_commissions', v_recent_commissions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION purchase_market_listing(uuid, uuid) TO authenticated;
