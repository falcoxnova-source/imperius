/*
  # Market Fee Redistribution: 50% Jackpot, 30% Admin, 20% Referral

  1. Changes
    - The total market fee remains 10% (configurable via game_settings)
    - The fee is now split into three parts:
      - 50% of the fee goes to the Jackpot pool
      - 30% of the fee goes to Admin (empresa)
      - 20% of the fee goes to the seller's referrer in FXU tokens
    - If the seller has NO referrer, the referrer's 20% goes to Admin instead
      (Admin receives 50% of fee = 30% + 20%)
    - Referral commissions are now ALWAYS in FXU, taken from the fee
      (no longer creates new resources or FXU out of thin air)
    - This applies to ALL listing types: resources, ships, and dark_matter

  2. Functions Updated
    - `purchase_market_listing` - new fee distribution logic
    - `fulfill_buy_offer` - same new fee distribution logic

  3. Security
    - No changes to RLS policies
    - All functions remain SECURITY DEFINER with search_path = public

  4. Important Notes
    - The seller still receives total_price - fee (90% by default)
    - The referral_commission_percent setting in game_settings is NO LONGER USED
      for market transactions (the 20% of fee is hardcoded as the market referral share)
    - The jackpot_config.contribution_rate is NO LONGER USED for market transactions
    - Both functions now use fixed ratios: 50/30/20 split of the fee
    - referral_commissions table records now always have commission_type = 'market_referral'
      and resource_type = 'fxu' for market transactions
*/

-- =============================================
-- FUNCTION: purchase_market_listing
-- =============================================
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

  v_market_fee_percent := get_market_fee_percent();

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

  -- Fee calculation: 10% total fee
  v_fee := v_total_price * (v_market_fee_percent / 100);
  v_seller_amount := v_total_price - v_fee;

  -- Fee distribution: 50% jackpot, 30% admin, 20% referral
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

  -- Referral commission from the fee (20% of fee in FXU)
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
    'jackpot_contribution', v_jackpot_amount
  );
END;
$$;


-- =============================================
-- FUNCTION: fulfill_buy_offer
-- =============================================
CREATE OR REPLACE FUNCTION fulfill_buy_offer(
  p_offer_id uuid,
  p_quantity bigint,
  p_planet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_offer RECORD;
  v_fill_qty bigint;
  v_fill_price numeric;
  v_fee numeric;
  v_jackpot_amount numeric;
  v_admin_fee numeric;
  v_referral_fee numeric;
  v_seller_amount numeric;
  v_admin_id uuid;
  v_market_fee_percent numeric;
  v_ship_type_id integer;
  v_seller_ship_qty integer;
  v_seller_resources RECORD;
  v_seller_dm integer;
  v_telegram_id bigint;
  v_is_member boolean;
  v_referrer_id uuid;
  v_transaction_id uuid;
  v_vacation boolean;
  v_buyer_planet_id uuid;
  v_limits RECORD;
  v_year_week text;
  v_current_sold bigint;
  v_active_listed bigint;
  v_weekly_limit bigint;
  v_weekly_remaining bigint;
  v_was_capped boolean := false;
  v_weekly_limit_enabled boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;

  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';

  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  SELECT vacation_mode INTO v_vacation FROM profiles WHERE id = v_user_id;
  IF COALESCE(v_vacation, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes operar en el mercado en modo vacaciones');
  END IF;

  v_market_fee_percent := get_market_fee_percent();

  SELECT * INTO v_offer
  FROM market_buy_offers
  WHERE id = p_offer_id AND status = 'active'
  FOR UPDATE;

  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada o no esta activa');
  END IF;

  IF v_offer.buyer_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes cumplir tu propia oferta');
  END IF;

  v_fill_qty := LEAST(p_quantity, v_offer.quantity - v_offer.quantity_filled);
  IF v_fill_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad invalida');
  END IF;

  IF v_offer.listing_type != 'dark_matter' THEN
    IF p_planet_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta requerido');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = v_user_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'No eres dueno de este planeta');
    END IF;
  END IF;

  IF v_offer.listing_type = 'resource' THEN
    SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;
    v_weekly_limit_enabled := (v_limits IS NOT NULL AND v_limits.monthly_limit_enabled);

    IF v_weekly_limit_enabled THEN
      v_weekly_limit := calculate_monthly_market_limit(v_user_id);

      v_year_week := to_char(now(), 'IYYY-"W"IW');

      SELECT
        CASE v_offer.item_code
          WHEN 'metal' THEN COALESCE(metal_sold, 0)
          WHEN 'crystal' THEN COALESCE(crystal_sold, 0)
          WHEN 'deuterium' THEN COALESCE(deuterium_sold, 0)
        END INTO v_current_sold
      FROM market_monthly_sales
      WHERE user_id = v_user_id AND year_month = v_year_week;

      v_current_sold := COALESCE(v_current_sold, 0);

      SELECT COALESCE(SUM(quantity), 0) INTO v_active_listed
      FROM market_listings
      WHERE seller_id = v_user_id
        AND listing_type = 'resource'
        AND item_code = v_offer.item_code
        AND status = 'active'
        AND created_at >= date_trunc('week', now());

      v_weekly_remaining := GREATEST(0, v_weekly_limit - v_current_sold - v_active_listed);

      IF v_weekly_remaining <= 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Has alcanzado tu limite semanal de venta de ' || v_offer.item_code || '. No puedes vender mas esta semana.',
          'weekly_limit', v_weekly_limit,
          'current_sold', v_current_sold,
          'active_listed', v_active_listed,
          'weekly_remaining', 0
        );
      END IF;

      IF v_fill_qty > v_weekly_remaining THEN
        v_fill_qty := v_weekly_remaining;
        v_was_capped := true;
      END IF;
    END IF;
  END IF;

  IF v_offer.listing_type != 'dark_matter' THEN
    SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_offer.buyer_id AND is_main_planet = true LIMIT 1;
    IF v_buyer_planet_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'El comprador no tiene planeta principal. No se pueden entregar los items.');
    END IF;
  END IF;

  IF v_offer.listing_type = 'resource' THEN
    SELECT metal, crystal, deuterium INTO v_seller_resources
    FROM planet_resources
    WHERE planet_id = p_planet_id
    FOR UPDATE;

    IF v_offer.item_code = 'metal' AND (v_seller_resources.metal IS NULL OR v_seller_resources.metal < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Metal insuficiente en tu planeta');
    ELSIF v_offer.item_code = 'crystal' AND (v_seller_resources.crystal IS NULL OR v_seller_resources.crystal < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cristal insuficiente en tu planeta');
    ELSIF v_offer.item_code = 'deuterium' AND (v_seller_resources.deuterium IS NULL OR v_seller_resources.deuterium < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente en tu planeta');
    END IF;

    IF v_offer.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal - v_fill_qty WHERE planet_id = p_planet_id;
    ELSIF v_offer.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal - v_fill_qty WHERE planet_id = p_planet_id;
    ELSIF v_offer.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium - v_fill_qty WHERE planet_id = p_planet_id;
    END IF;

  ELSIF v_offer.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_offer.item_code;
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave no encontrado');
    END IF;

    SELECT quantity INTO v_seller_ship_qty
    FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship_type_id
    FOR UPDATE;

    IF v_seller_ship_qty IS NULL OR v_seller_ship_qty < v_fill_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'Naves insuficientes en tu planeta');
    END IF;

    UPDATE planet_ships
    SET quantity = quantity - v_fill_qty
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship_type_id;

  ELSIF v_offer.listing_type = 'dark_matter' THEN
    SELECT dark_matter INTO v_seller_dm FROM profiles WHERE id = v_user_id FOR UPDATE;
    IF v_seller_dm IS NULL OR v_seller_dm < v_fill_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'Materia oscura insuficiente');
    END IF;

    UPDATE profiles SET dark_matter = dark_matter - v_fill_qty WHERE id = v_user_id;
  END IF;

  -- Fee calculation: 10% total fee
  v_fill_price := v_offer.price_per_unit * v_fill_qty;
  v_fee := v_fill_price * (v_market_fee_percent / 100);
  v_seller_amount := v_fill_price - v_fee;

  -- Fee distribution: 50% jackpot, 30% admin, 20% referral
  v_jackpot_amount := floor(v_fee * 50 / 100);

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_user_id;

  IF v_referrer_id IS NOT NULL THEN
    v_referral_fee := floor(v_fee * 20 / 100);
    v_admin_fee := v_fee - v_jackpot_amount - v_referral_fee;
  ELSE
    v_referral_fee := 0;
    v_admin_fee := v_fee - v_jackpot_amount;
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;

    PERFORM record_admin_revenue(
      'market_fee',
      v_admin_fee,
      'Oferta compra: ' || v_fill_qty || 'x ' || v_offer.item_code || ' (fee ' || v_market_fee_percent || '%, admin ' || round(v_admin_fee / v_fee * 100) || '%)',
      v_user_id,
      p_offer_id
    );
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_user_id);
  END IF;

  IF v_offer.listing_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_buyer_planet_id, v_ship_type_id, v_fill_qty)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_fill_qty;

  ELSIF v_offer.listing_type = 'resource' THEN
    IF v_offer.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_fill_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_offer.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_fill_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_offer.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_fill_qty WHERE planet_id = v_buyer_planet_id;
    END IF;

  ELSIF v_offer.listing_type = 'dark_matter' THEN
    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_fill_qty WHERE id = v_offer.buyer_id;
  END IF;

  IF v_offer.listing_type = 'resource' THEN
    v_year_week := COALESCE(v_year_week, to_char(now(), 'IYYY-"W"IW'));

    INSERT INTO market_monthly_sales (user_id, year_month, metal_sold, crystal_sold, deuterium_sold)
    VALUES (
      v_user_id,
      v_year_week,
      CASE WHEN v_offer.item_code = 'metal' THEN v_fill_qty ELSE 0 END,
      CASE WHEN v_offer.item_code = 'crystal' THEN v_fill_qty ELSE 0 END,
      CASE WHEN v_offer.item_code = 'deuterium' THEN v_fill_qty ELSE 0 END
    )
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      metal_sold = market_monthly_sales.metal_sold + CASE WHEN v_offer.item_code = 'metal' THEN v_fill_qty ELSE 0 END,
      crystal_sold = market_monthly_sales.crystal_sold + CASE WHEN v_offer.item_code = 'crystal' THEN v_fill_qty ELSE 0 END,
      deuterium_sold = market_monthly_sales.deuterium_sold + CASE WHEN v_offer.item_code = 'deuterium' THEN v_fill_qty ELSE 0 END,
      updated_at = now();
  END IF;

  INSERT INTO market_transactions (buy_offer_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_offer_id, v_offer.buyer_id, v_user_id, v_offer.listing_type, v_offer.item_code, v_fill_qty, v_fill_price)
  RETURNING id INTO v_transaction_id;

  -- Referral commission from the fee (20% of fee in FXU)
  IF v_referrer_id IS NOT NULL AND v_referral_fee >= 1 THEN
    UPDATE profiles
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_fee
    WHERE id = v_referrer_id;

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
    VALUES (v_referrer_id, v_user_id, v_transaction_id, 'market_referral', 'fxu', v_referral_fee, v_referral_fee);

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_referrer_id,
      v_user_id,
      'Comision de referido por venta en mercado',
      'Has recibido ' || ROUND(v_referral_fee, 2) || ' FXU como comision por la venta de tu referido en el mercado.',
      'system'
    );
  END IF;

  UPDATE market_buy_offers
  SET
    quantity_filled = quantity_filled + v_fill_qty,
    status = CASE WHEN quantity_filled + v_fill_qty >= quantity THEN 'filled' ELSE 'active' END,
    updated_at = now()
  WHERE id = p_offer_id;

  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    v_user_id,
    v_offer.buyer_id,
    'Oferta de compra cumplida',
    'Tu oferta de compra de ' || v_fill_qty || 'x ' || v_offer.item_code || ' ha sido cumplida' ||
    CASE WHEN v_was_capped THEN ' (parcial por limite semanal del vendedor)' ELSE '' END ||
    '. Los items fueron enviados a tu planeta principal.',
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'quantity_filled', v_fill_qty,
    'quantity_requested', p_quantity,
    'was_capped', v_was_capped,
    'fxu_received', v_seller_amount,
    'fee_paid', v_fee,
    'jackpot_contribution', v_jackpot_amount,
    'weekly_remaining', CASE
      WHEN v_weekly_limit_enabled
      THEN GREATEST(0, COALESCE(v_weekly_remaining, 0) - v_fill_qty)
      ELSE NULL
    END
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cumplir oferta: ' || SQLERRM);
END;
$$;
