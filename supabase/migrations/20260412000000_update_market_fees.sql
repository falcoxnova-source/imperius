#!/bin/bash
set -e
docker exec -i xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
-- ============================================================
-- 1/2: Actualizar fee según ranking/VIP
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_market_fee_for_user(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rank integer;
  v_is_plus boolean;
BEGIN
  -- Check VIP first
  v_is_plus := is_user_plus(p_user_id);
  
  IF v_is_plus THEN
    RETURN 10;
  END IF;
  
  -- Get user ranking
  SELECT COALESCE(rank_position, 9999) INTO v_rank
  FROM profiles WHERE id = p_user_id;
  
  -- Fee tiers by ranking
  IF v_rank <= 50 THEN
    RETURN 20;
  ELSIF v_rank <= 100 THEN
    RETURN 30;
  ELSIF v_rank <= 200 THEN
    RETURN 40;
  ELSE
    RETURN 50;
  END IF;
END;
$function$;

-- ============================================================
-- 2/2: purchase_market_listing usa fee dinámico del vendedor
-- ============================================================
CREATE OR REPLACE FUNCTION public.purchase_market_listing(p_listing_id uuid, p_buyer_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_listing record;
  v_buyer_id uuid;
  v_buyer_profile record;
  v_total_cost numeric;
  v_market_fee_percent numeric;
  v_seller_receives numeric;
  v_market_fee numeric;
  v_ship_type_id int;
  v_existing_ship record;
  v_referrer_id uuid;
  v_referral_commission_fxu numeric;
  v_transaction_id uuid;
  v_admin_id uuid;
BEGIN
  -- Verify authentication
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get buyer profile
  SELECT * INTO v_buyer_profile
  FROM profiles
  WHERE id = v_buyer_id;

  IF v_buyer_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  -- Lock listing for update
  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found');
  END IF;

  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing no longer available');
  END IF;

  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot buy your own listing');
  END IF;

  -- Dynamic fee based on seller's VIP/ranking
  v_market_fee_percent := get_market_fee_for_user(v_listing.seller_id);

  -- Calculate costs
  v_total_cost := v_listing.total_price;
  v_market_fee := v_total_cost * v_market_fee_percent / 100;
  v_seller_receives := v_total_cost - v_market_fee;

  -- Check buyer has enough FXU
  IF COALESCE(v_buyer_profile.fxu_balance, 0) < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient FXU. Have ' || COALESCE(v_buyer_profile.fxu_balance, 0)::text || ', need ' || v_total_cost::text
    );
  END IF;

  -- Validate buyer planet for non-dark_matter items
  IF v_listing.listing_type != 'dark_matter' THEN
    IF NOT EXISTS (
      SELECT 1 FROM planets WHERE id = p_buyer_planet_id AND user_id = v_buyer_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid planet');
    END IF;
  END IF;

  -- Mark listing as sold
  UPDATE market_listings
  SET status = 'sold', updated_at = now()
  WHERE id = p_listing_id;

  -- Deduct FXU from buyer
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_total_cost
  WHERE id = v_buyer_id;

  -- Pay seller (minus fee)
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + v_seller_receives
  WHERE id = v_listing.seller_id;

  -- Deposit market fee to admin account
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL AND v_market_fee > 0 THEN
    UPDATE profiles 
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_market_fee 
    WHERE id = v_admin_id;
  END IF;

  -- Deliver purchased items
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
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
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

  -- Record transaction
  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, v_listing.listing_type, v_listing.item_code, v_listing.quantity, v_listing.total_price)
  RETURNING id INTO v_transaction_id;

  -- Process referral commission (5% of total to referrer)
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;

  IF v_referrer_id IS NOT NULL THEN
    v_referral_commission_fxu := FLOOR(v_total_cost * 5 / 100);

    IF v_referral_commission_fxu >= 1 THEN
      UPDATE profiles
      SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_commission_fxu
      WHERE id = v_referrer_id;

      INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
      VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'fxu', 'fxu', v_referral_commission_fxu, v_referral_commission_fxu);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Purchase completed successfully',
    'total_paid', v_total_cost,
    'seller_received', v_seller_receives,
    'fee_collected', v_market_fee
  );
END;
$function$;
SQL
echo "=== Verify new fees ==="
docker exec -i xnova-database psql -U postgres -d postgres -c "SELECT get_market_fee_for_user('00000000-0000-0000-0000-000000000000');" 2>/dev/null || echo "(defaults to 50 for non-existent user - expected)"
echo "=== Fee for a real VIP user (first plus user) ==="
docker exec -i xnova-database psql -U postgres -d postgres -tAc "SELECT 'VIP fee: ' || get_market_fee_for_user(id) FROM profiles WHERE rank_position IS NOT NULL AND rank_position <= 50 AND is_user_plus(id) LIMIT 1;"
echo "=== Fee for a top 10 user (no plus) ==="
docker exec -i xnova-database psql -U postgres -d postgres -tAc "SELECT 'Top10 fee: ' || get_market_fee_for_user(id) FROM profiles WHERE rank_position IS NOT NULL AND rank_position <= 10 AND NOT is_user_plus(id) LIMIT 1;"
echo "=== Fee for a rank 150 user ==="
docker exec -i xnova-database psql -U postgres -d postgres -tAc "SELECT 'Rank150 fee: ' || get_market_fee_for_user(id) FROM profiles WHERE rank_position IS NOT NULL AND rank_position BETWEEN 51 AND 200 AND NOT is_user_plus(id) LIMIT 1;"
echo "=== Fee for rank 9999 user ==="
docker exec -i xnova-database psql -U postgres -d postgres -tAc "SELECT 'NoRank fee: ' || get_market_fee_for_user(id) FROM profiles WHERE (rank_position IS NULL OR rank_position > 200) AND NOT is_user_plus(id) LIMIT 1;"
echo "=== Verify purchase fn uses dynamic fee ==="
docker exec -i xnova-database psql -U postgres -d postgres -tAc "SELECT CASE WHEN pg_get_functiondef('public.purchase_market_listing(uuid,uuid)'::regprocedure) ILIKE '%get_market_fee_for_user%' THEN 'OK - dynamic fee' ELSE 'ERROR - still hardcoded' END;"
