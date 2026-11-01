/*
  # VIP System - Dynamic Market Fees & FXU Discounts
  
  ## Overview
  Implements the VIP/Plus system with:
  1. Dynamic market fees based on ranking (for non-VIP users)
  2. Fixed 7.5% market fee for VIP/Plus users
  3. 75% discount on building/research acceleration FXU cost for VIP
  4. 25% discount on ship/defense/fleet acceleration FXU cost for VIP
  5. 80% discount on colony abandonment FXU cost for VIP
  
  ## NO changes to:
  - Fleet speed / flight time calculations
  - Combat / battle system
  - ACS system
  - send_fleet / fleet_calc_flight_time
  
  ## Fee tiers by ranking (non-VIP):
  - Rank 201+: 30%
  - Rank 101-200: 25%
  - Rank 51-100: 15%
  - Rank 1-50: 10%
  - VIP/Plus: 7.5% (overrides ranking)
  
  ## Functions created:
  - is_user_plus(uuid) - Check if a user has active Plus subscription
  - get_market_fee_for_user(uuid) - Get personalized fee based on Plus + ranking
  - get_my_market_fee() - Frontend RPC to get current user's fee info
  
  ## Functions updated:
  - purchase_market_listing - Use dynamic fee per user
  - calculate_fxu_cost_building - VIP 75% discount
  - calculate_fxu_cost_research - VIP 75% discount
  - calculate_fxu_cost_shipyard - VIP 25% discount
  - calculate_fxu_cost_fleet - VIP 25% discount (acceleration cost only, NOT speed)
  - secure_abandon_colony - VIP 80% discount
  
  ## Update plus_plans pricing:
  - plus_monthly: $6 (was $10)
  - plus_6months: $14/3mo (was $50/6mo) 
  - plus_annual: $45/9mo (was $80/12mo)
*/

-- ============================================
-- 1. Helper: Check if a specific user is Plus
-- ============================================
CREATE OR REPLACE FUNCTION is_user_plus(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM plus_subscriptions
    WHERE user_id = p_user_id
      AND is_active = true
      AND expires_at > now()
  );
END;
$$;

-- ============================================
-- 2. Dynamic market fee based on Plus + ranking
-- ============================================
CREATE OR REPLACE FUNCTION get_market_fee_for_user(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank integer;
  v_is_plus boolean;
BEGIN
  -- Check VIP first
  v_is_plus := is_user_plus(p_user_id);
  
  IF v_is_plus THEN
    RETURN 7.5;
  END IF;
  
  -- Get user ranking
  SELECT COALESCE(rank_position, 9999) INTO v_rank
  FROM profiles WHERE id = p_user_id;
  
  -- Fee tiers by ranking
  IF v_rank <= 50 THEN
    RETURN 10;
  ELSIF v_rank <= 100 THEN
    RETURN 15;
  ELSIF v_rank <= 200 THEN
    RETURN 25;
  ELSE
    RETURN 30;
  END IF;
END;
$$;

-- ============================================
-- 3. Frontend RPC to get current user's fee info
-- ============================================
CREATE OR REPLACE FUNCTION get_my_market_fee()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fee numeric;
  v_is_plus boolean;
  v_rank integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('fee_percent', 30, 'is_plus', false, 'rank', 9999);
  END IF;
  
  v_is_plus := is_user_plus(v_user_id);
  
  SELECT COALESCE(rank_position, 9999) INTO v_rank
  FROM profiles WHERE id = v_user_id;
  
  v_fee := get_market_fee_for_user(v_user_id);
  
  RETURN jsonb_build_object(
    'fee_percent', v_fee,
    'is_plus', v_is_plus,
    'rank', v_rank
  );
END;
$$;

GRANT EXECUTE ON FUNCTION is_user_plus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_market_fee_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_market_fee() TO authenticated;

-- ============================================
-- 4. Update purchase_market_listing to use dynamic fee
-- ============================================
-- Note: We only change the fee line. The vacation mode patch from 20260309190000
-- was applied via pg_proc manipulation and is still in effect.
-- We recreate the base function with the dynamic fee integrated.

CREATE OR REPLACE FUNCTION purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_listing RECORD;
  v_buyer_planet_id uuid;
  v_purchase_qty integer;
  v_total_price numeric;
  v_buyer_fxu numeric;
  v_admin_id uuid;
  v_fee numeric;
  v_jackpot_amount numeric;
  v_admin_fee numeric;
  v_referral_fee numeric;
  v_seller_amount numeric;
  v_ship_type_id integer;
  v_market_fee_percent numeric;
  v_referrer_id uuid;
  v_transaction_id uuid;
  v_seller_resources RECORD;
  v_seller_ship_qty integer;
  v_telegram_id bigint;
  v_is_member boolean;
  v_year_week text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Vacation mode check
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND vacation_mode = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use the market while in vacation mode');
  END IF;

  -- Telegram verification
  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;

  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado. Ve a la seccion de Tareas para vincular tu cuenta.',
      'requires_telegram', true
    );
  END IF;

  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';

  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado. Unete al grupo desde la seccion de Tareas.',
      'requires_telegram', true
    );
  END IF;

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or not active');
  END IF;

  -- Cooldown check
  IF v_listing.purchasable_at > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Esta oferta aun no esta disponible para compra. Espera a que termine el periodo de preparacion.',
      'cooldown_remaining', EXTRACT(EPOCH FROM (v_listing.purchasable_at - now()))::integer
    );
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

  -- === DYNAMIC FEE: based on seller's rank + Plus status ===
  v_market_fee_percent := get_market_fee_for_user(v_listing.seller_id);

  -- Verify seller still has resources/ships
  IF v_listing.listing_type = 'resource' THEN
    SELECT metal, crystal, deuterium INTO v_seller_resources
    FROM planet_resources
    WHERE planet_id = v_listing.planet_id
    FOR UPDATE;

    IF v_listing.item_code = 'metal' AND v_seller_resources.metal < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente metal (posiblemente fue atacado)');
    ELSIF v_listing.item_code = 'crystal' AND v_seller_resources.crystal < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente cristal (posiblemente fue atacado)');
    ELSIF v_listing.item_code = 'deuterium' AND v_seller_resources.deuterium < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente deuterio (posiblemente fue atacado)');
    END IF;

    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    END IF;

  ELSIF v_listing.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
    END IF;

    SELECT quantity INTO v_seller_ship_qty
    FROM planet_ships
    WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id
    FOR UPDATE;

    IF v_seller_ship_qty IS NULL OR v_seller_ship_qty < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficientes naves (posiblemente fueron destruidas en combate)');
    END IF;

    UPDATE planet_ships
    SET quantity = quantity - v_purchase_qty
    WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id;

  ELSIF v_listing.listing_type = 'dark_matter' THEN
    NULL;
  END IF;

  -- Fee calculation (using dynamic percent)
  v_fee := v_total_price * (v_market_fee_percent / 100);
  v_seller_amount := v_total_price - v_fee;

  v_jackpot_amount := floor(v_fee * 50 / 100);

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;

  IF v_referrer_id IS NOT NULL THEN
    v_referral_fee := floor(v_fee * 20 / 100);
    v_admin_fee := v_fee - v_jackpot_amount - v_referral_fee;
  ELSE
    v_referral_fee := 0;
    v_admin_fee := v_fee - v_jackpot_amount;
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;

    PERFORM record_admin_revenue(
      'market_fee',
      v_admin_fee,
      'Venta: ' || v_purchase_qty || 'x ' || v_listing.item_code || ' (fee ' || v_market_fee_percent || '%, admin ' || round(v_admin_fee / v_fee * 100) || '%)',
      v_listing.seller_id,
      p_listing_id
    );
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_listing.seller_id);
  END IF;

  IF v_listing.listing_type = 'ship' THEN
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

  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_user_id, v_listing.seller_id, v_listing.listing_type, v_listing.item_code, v_purchase_qty, v_total_price)
  RETURNING id INTO v_transaction_id;

  IF v_listing.listing_type = 'resource' THEN
    v_year_week := to_char(now(), 'IYYY-"W"IW');

    INSERT INTO market_monthly_sales (user_id, year_month, metal_sold, crystal_sold, deuterium_sold)
    VALUES (
      v_listing.seller_id,
      v_year_week,
      CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END
    )
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      metal_sold = market_monthly_sales.metal_sold + CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      crystal_sold = market_monthly_sales.crystal_sold + CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      deuterium_sold = market_monthly_sales.deuterium_sold + CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END,
      updated_at = now();
  END IF;

  IF v_referrer_id IS NOT NULL AND v_referral_fee >= 1 THEN
    UPDATE profiles
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_fee
    WHERE id = v_referrer_id;

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
    VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'market_referral', 'fxu', v_referral_fee, v_referral_fee);

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_referrer_id,
      v_listing.seller_id,
      'Comision de referido por venta en mercado',
      'Has recibido ' || ROUND(v_referral_fee, 2) || ' FXU como comision por la venta de tu referido en el mercado.',
      'system'
    );
  END IF;

  IF v_purchase_qty = v_listing.quantity THEN
    UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  ELSE
    UPDATE market_listings SET quantity = quantity - v_purchase_qty, total_price = (quantity - v_purchase_qty) * price_per_unit, updated_at = now() WHERE id = p_listing_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'quantity', v_purchase_qty,
    'total_price', v_total_price,
    'jackpot_contribution', v_jackpot_amount,
    'fee_percent', v_market_fee_percent
  );
END;
$$;

-- ============================================
-- 5. Update calculate_fxu_cost_building - VIP 75% discount
-- ============================================
CREATE OR REPLACE FUNCTION calculate_fxu_cost_building(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_building_type building_types%ROWTYPE;
  v_seconds_remaining integer;
  v_total_build_time integer;
  v_time_ratio numeric;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
  v_cost_factor numeric;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  
  IF v_queue IS NULL THEN
    RETURN 0;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue.end_time - now()))::integer);
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  v_total_build_time := GREATEST(1, EXTRACT(EPOCH FROM (v_queue.end_time - v_queue.start_time))::integer);
  v_time_ratio := v_seconds_remaining::numeric / v_total_build_time::numeric;
  
  SELECT * INTO v_building_type FROM building_types WHERE id = v_queue.building_type_id;
  
  v_cost_factor := COALESCE(v_building_type.cost_factor::numeric, 1.5);
  
  v_metal_cost := FLOOR(COALESCE(v_building_type.base_metal, 0) * POWER(v_cost_factor, v_queue.target_level - 1));
  v_crystal_cost := FLOOR(COALESCE(v_building_type.base_crystal, 0) * POWER(v_cost_factor, v_queue.target_level - 1));
  v_deut_cost := FLOOR(COALESCE(v_building_type.base_deuterium, 0) * POWER(v_cost_factor, v_queue.target_level - 1));
  
  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);
  
  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_building';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 5000;
  END IF;
  
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  v_fxu_cost := v_fxu_cost * v_time_ratio;
  
  -- VIP discount: 75% off building acceleration
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL AND is_user_plus(v_user_id) THEN
    v_fxu_cost := v_fxu_cost * 0.25;
  END IF;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- ============================================
-- 6. Update calculate_fxu_cost_research - VIP 75% discount
-- ============================================
CREATE OR REPLACE FUNCTION calculate_fxu_cost_research(p_technology_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tech user_technologies%ROWTYPE;
  v_tech_type technology_types%ROWTYPE;
  v_seconds_remaining integer;
  v_total_research_time integer;
  v_time_ratio numeric;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_tech FROM user_technologies WHERE id = p_technology_id;

  IF v_tech IS NULL OR NOT v_tech.is_researching THEN
    RETURN 0;
  END IF;

  IF v_tech.research_end_time IS NULL THEN
    RETURN 1;
  END IF;

  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_tech.research_end_time - now()))::integer);

  IF v_seconds_remaining <= 0 THEN
    RETURN 1;
  END IF;

  IF v_tech.research_start_time IS NOT NULL THEN
    v_total_research_time := GREATEST(1, EXTRACT(EPOCH FROM (v_tech.research_end_time - v_tech.research_start_time))::integer);
  ELSE
    v_total_research_time := v_seconds_remaining;
  END IF;

  v_time_ratio := LEAST(1, GREATEST(0.01, v_seconds_remaining::numeric / v_total_research_time::numeric));

  SELECT * INTO v_tech_type FROM technology_types WHERE id = v_tech.technology_type_id;

  IF v_tech_type IS NULL THEN
    RETURN 1;
  END IF;

  v_metal_cost := FLOOR(COALESCE(v_tech_type.base_metal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_crystal_cost := FLOOR(COALESCE(v_tech_type.base_crystal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_deut_cost := FLOOR(COALESCE(v_tech_type.base_deuterium, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));

  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);

  IF v_resource_value <= 0 THEN
    RETURN 1;
  END IF;

  SELECT COALESCE(value::numeric, 3000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_research';

  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 3000;
  END IF;

  v_fxu_cost := v_resource_value / v_fxu_ratio;
  v_fxu_cost := v_fxu_cost * v_time_ratio;

  -- VIP discount: 75% off research acceleration
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL AND is_user_plus(v_user_id) THEN
    v_fxu_cost := v_fxu_cost * 0.25;
  END IF;

  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- ============================================
-- 7. Update calculate_fxu_cost_shipyard - VIP 25% discount
-- ============================================
CREATE OR REPLACE FUNCTION calculate_fxu_cost_shipyard(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue shipyard_queue%ROWTYPE;
  v_ship_type ship_types%ROWTYPE;
  v_defense_type defense_types%ROWTYPE;
  v_current_unit_time_remaining integer;
  v_total_time_remaining integer;
  v_total_time_for_remaining_units integer;
  v_time_ratio numeric;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_units_remaining integer;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_queue FROM shipyard_queue WHERE id = p_queue_id;
  
  IF v_queue IS NULL THEN
    RETURN 0;
  END IF;
  
  v_current_unit_time_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue.current_unit_end_time - now()))::integer);
  v_units_remaining := v_queue.quantity - v_queue.quantity_completed;
  
  IF v_units_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  v_total_time_remaining := v_current_unit_time_remaining;
  IF v_units_remaining > 1 THEN
    v_total_time_remaining := v_total_time_remaining + ((v_units_remaining - 1) * v_queue.build_time_per_unit);
  END IF;
  
  IF v_total_time_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  v_total_time_for_remaining_units := v_units_remaining * v_queue.build_time_per_unit;
  v_time_ratio := v_total_time_remaining::numeric / GREATEST(1, v_total_time_for_remaining_units)::numeric;
  
  IF v_queue.item_type = 'ship' THEN
    SELECT * INTO v_ship_type FROM ship_types WHERE id = v_queue.ship_type_id;
    v_metal_cost := COALESCE(v_ship_type.metal_cost, 0);
    v_crystal_cost := COALESCE(v_ship_type.crystal_cost, 0);
    v_deut_cost := COALESCE(v_ship_type.deuterium_cost, 0);
    
    SELECT COALESCE(value::numeric, 8000) INTO v_fxu_ratio
    FROM game_settings WHERE key = 'fxu_cost_ratio_ships';
    
    IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
      v_fxu_ratio := 8000;
    END IF;
  ELSE
    SELECT * INTO v_defense_type FROM defense_types WHERE id = v_queue.defense_type_id;
    v_metal_cost := COALESCE(v_defense_type.metal_cost, 0);
    v_crystal_cost := COALESCE(v_defense_type.crystal_cost, 0);
    v_deut_cost := COALESCE(v_defense_type.deuterium_cost, 0);
    
    SELECT COALESCE(value::numeric, 10000) INTO v_fxu_ratio
    FROM game_settings WHERE key = 'fxu_cost_ratio_defense';
    
    IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
      v_fxu_ratio := 10000;
    END IF;
  END IF;
  
  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost) * v_units_remaining;
  
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  v_fxu_cost := v_fxu_cost * v_time_ratio;
  
  -- VIP discount: 25% off ship/defense acceleration
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL AND is_user_plus(v_user_id) THEN
    v_fxu_cost := v_fxu_cost * 0.75;
  END IF;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- ============================================
-- 8. Update calculate_fxu_cost_fleet - VIP 25% discount (cost only, NOT speed)
-- ============================================
CREATE OR REPLACE FUNCTION calculate_fxu_cost_fleet(p_fleet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet fleets%ROWTYPE;
  v_seconds_remaining numeric;
  v_minutes_remaining numeric;
  v_target_time timestamptz;
  v_ratio numeric;
  v_cost numeric;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;

  IF v_fleet IS NULL OR v_fleet.is_completed THEN
    RETURN 0;
  END IF;

  IF v_fleet.is_returning THEN
    v_target_time := v_fleet.return_time;
  ELSE
    v_target_time := v_fleet.arrival_time;
  END IF;

  IF v_target_time IS NULL THEN
    RETURN 1;
  END IF;

  v_seconds_remaining := EXTRACT(EPOCH FROM (v_target_time - now()));

  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;

  v_minutes_remaining := v_seconds_remaining / 60.0;

  SELECT COALESCE(value::numeric, 1) INTO v_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';

  IF v_ratio <= 0 THEN
    v_ratio := 1;
  END IF;

  v_cost := v_minutes_remaining * v_ratio;

  -- VIP discount: 25% off fleet acceleration cost (NOT speed)
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL AND is_user_plus(v_user_id) THEN
    v_cost := v_cost * 0.75;
  END IF;

  RETURN GREATEST(1, CEIL(v_cost))::integer;
END;
$$;

-- ============================================
-- 9. Update secure_abandon_colony - VIP 80% discount
-- ============================================
CREATE OR REPLACE FUNCTION secure_abandon_colony(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_fxu_fee numeric;
  v_user_fxu numeric;
  v_admin_id uuid;
  v_active_fleet_count integer;
  v_building_queue_count integer;
  v_shipyard_queue_count integer;
  v_research_on_planet boolean;
  v_is_plus boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_user_in_vacation_mode(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while in vacation mode');
  END IF;

  SELECT * INTO v_planet
  FROM planets
  WHERE id = p_planet_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  IF v_planet.is_main_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon your homeworld');
  END IF;

  SELECT COUNT(*) INTO v_building_queue_count
  FROM building_queue
  WHERE planet_id = p_planet_id;

  IF v_building_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active building construction. Cancel it first.');
  END IF;

  SELECT COUNT(*) INTO v_shipyard_queue_count
  FROM shipyard_queue
  WHERE planet_id = p_planet_id;

  IF v_shipyard_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active shipyard production. Cancel it first.');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_technologies
    WHERE user_id = auth.uid()
      AND is_researching = true
      AND research_planet_id = p_planet_id
  ) INTO v_research_on_planet;

  IF v_research_on_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active research. Cancel research first.');
  END IF;

  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE origin_planet_id = p_planet_id
    AND is_completed = false;

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active fleets. Recall all fleets first.');
  END IF;

  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE target_galaxy = v_planet.galaxy
    AND target_system = v_planet.solar_system
    AND target_position = v_planet.position
    AND is_completed = false;

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while fleets are heading to it. Wait until they arrive.');
  END IF;

  SELECT COALESCE(value::numeric, 10000) INTO v_fxu_fee
  FROM game_settings WHERE key = 'fxu_abandon_colony_fee';

  IF v_fxu_fee IS NULL THEN
    v_fxu_fee := 10000;
  END IF;

  -- VIP discount: 80% off colony abandonment
  v_is_plus := is_user_plus(auth.uid());
  IF v_is_plus THEN
    v_fxu_fee := v_fxu_fee * 0.20;
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu
  FROM profiles WHERE id = auth.uid();

  IF v_user_fxu < v_fxu_fee THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient FXU. Required: ' || v_fxu_fee::text || ', Available: ' || v_user_fxu::text
    );
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = auth.uid();

  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id;
  END IF;

  DELETE FROM research_queue WHERE planet_id = p_planet_id;
  DELETE FROM planets WHERE id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'planet_name', v_planet.name,
    'fxu_charged', v_fxu_fee,
    'vip_discount', v_is_plus
  );
END;
$$;

-- ============================================
-- 10. Update plus_plans pricing
-- ============================================
UPDATE plus_plans SET 
  price_usdt = 6,
  price_fxu = 60000,
  duration_months = 1,
  name = 'VIP Mensual'
WHERE code = 'plus_monthly';

UPDATE plus_plans SET 
  price_usdt = 14,
  price_fxu = 140000,
  duration_months = 3,
  name = 'VIP Trimestral'
WHERE code = 'plus_6months';

UPDATE plus_plans SET 
  price_usdt = 45,
  price_fxu = 450000,
  duration_months = 9,
  name = 'VIP 9 Meses'
WHERE code = 'plus_annual';
