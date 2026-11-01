-- ============================================================================
-- 20260713_referral_market.sql — PARTE B (mercado)
--
-- purchase_market_listing(uuid,integer,uuid) [overload que usa el frontend]
-- Cambio unico: el referido gana 20% de la parte de EMPRESA (v_fee - pool),
-- en vez de 20% del fee total. Resultado por fee de mercado:
--   pool = 50% | empresa = 50% | referido = 20% de la empresa (=10% del fee)
--   sin referido -> la empresa se queda su 50%.
-- El resto de la funcion es identico al original (verificado).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL::integer, p_buyer_planet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  v_ship_value bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND vacation_mode = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use the market while in vacation mode');
  END IF;

  SELECT telegram_id INTO v_telegram_id FROM telegram_links WHERE user_id = v_user_id;
  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes vincular tu cuenta de Telegram para usar el mercado.', 'requires_telegram', true);
  END IF;

  SELECT is_member INTO v_is_member FROM telegram_task_rewards WHERE user_id = v_user_id AND task_type = 'join_group';
  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes ser miembro del grupo de Telegram para usar el mercado.', 'requires_telegram', true);
  END IF;

  SELECT * INTO v_listing FROM market_listings WHERE id = p_listing_id AND status = 'active' FOR UPDATE;
  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or not active');
  END IF;

  IF v_listing.purchasable_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta aun no esta disponible para compra.', 'cooldown_remaining', EXTRACT(EPOCH FROM (v_listing.purchasable_at - now()))::integer);
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

  SELECT fxu_balance INTO v_buyer_fxu FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_buyer_fxu < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  -- Use provided planet_id if valid, otherwise fall back to main planet
  IF p_buyer_planet_id IS NOT NULL THEN
    SELECT id INTO v_buyer_planet_id FROM planets WHERE id = p_buyer_planet_id AND user_id = v_user_id;
  END IF;
  IF v_buyer_planet_id IS NULL THEN
    SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_user_id AND is_main_planet = true LIMIT 1;
  END IF;
  IF v_buyer_planet_id IS NULL AND v_listing.listing_type != 'dark_matter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No main planet found');
  END IF;

  v_market_fee_percent := get_market_fee_for_user(v_listing.seller_id);

  -- Verify seller still has resources/ships
  IF v_listing.listing_type = 'resource' THEN
    SELECT metal, crystal, deuterium INTO v_seller_resources FROM planet_resources WHERE planet_id = v_listing.planet_id FOR UPDATE;

    IF v_listing.item_code = 'metal' AND COALESCE(v_seller_resources.metal, 0) < v_purchase_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente metal (oferta cancelada)');
    ELSIF v_listing.item_code = 'crystal' AND COALESCE(v_seller_resources.crystal, 0) < v_purchase_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente cristal (oferta cancelada)');
    ELSIF v_listing.item_code = 'deuterium' AND COALESCE(v_seller_resources.deuterium, 0) < v_purchase_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente deuterio (oferta cancelada)');
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
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found (oferta cancelada)');
    END IF;

    SELECT quantity INTO v_seller_ship_qty FROM planet_ships WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id FOR UPDATE;
    IF v_seller_ship_qty IS NULL OR v_seller_ship_qty < v_purchase_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficientes naves (oferta cancelada)');
    END IF;

    UPDATE planet_ships SET quantity = quantity - v_purchase_qty WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id;

  ELSIF v_listing.listing_type = 'dark_matter' THEN
    NULL;
  END IF;

  -- Fee calculation: pool 50% / empresa 50% / referido 20% de la empresa
  v_fee := v_total_price * (v_market_fee_percent / 100);
  v_seller_amount := v_total_price - v_fee;
  v_jackpot_amount := floor(v_fee * 50 / 100);

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;
  IF v_referrer_id IS NOT NULL THEN
    v_referral_fee := floor((v_fee - v_jackpot_amount) * 20 / 100);
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
    PERFORM record_admin_revenue('market_fee', v_admin_fee, 'Venta: ' || v_purchase_qty || 'x ' || v_listing.item_code || ' (fee ' || v_market_fee_percent || '%, admin ' || round(v_admin_fee / v_fee * 100) || '%)', v_listing.seller_id, p_listing_id);
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_listing.seller_id);
  END IF;

  -- Deliver to buyer's selected planet (or main planet as fallback)
  IF v_listing.listing_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity) VALUES (v_buyer_planet_id, v_ship_type_id, v_purchase_qty)
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

  v_year_week := to_char(now(), 'IYYY-"W"IW');

  -- Track resource sales (units + FXU value)
  IF v_listing.listing_type = 'resource' THEN
    INSERT INTO market_monthly_sales (user_id, year_month, metal_sold, crystal_sold, deuterium_sold, fxu_value_sold)
    VALUES (
      v_listing.seller_id,
      v_year_week,
      CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END,
      v_total_price
    )
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      metal_sold = market_monthly_sales.metal_sold + CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      crystal_sold = market_monthly_sales.crystal_sold + CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      deuterium_sold = market_monthly_sales.deuterium_sold + CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END,
      fxu_value_sold = market_monthly_sales.fxu_value_sold + v_total_price,
      updated_at = now();
  END IF;

  -- Track ship sales (resource value + FXU value)
  IF v_listing.listing_type = 'ship' THEN
    SELECT (COALESCE(metal_cost, 0) + COALESCE(crystal_cost, 0) + COALESCE(deuterium_cost, 0))::bigint
    INTO v_ship_value FROM ship_types WHERE code = v_listing.item_code;
    v_ship_value := COALESCE(v_ship_value, 0);

    INSERT INTO market_monthly_sales (user_id, year_month, ships_value_sold, fxu_value_sold)
    VALUES (v_listing.seller_id, v_year_week, v_purchase_qty * v_ship_value, v_total_price)
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      ships_value_sold = market_monthly_sales.ships_value_sold + (v_purchase_qty * v_ship_value),
      fxu_value_sold = market_monthly_sales.fxu_value_sold + v_total_price,
      updated_at = now();
  END IF;

  -- Referral (20% de la parte de empresa)
  IF v_referrer_id IS NOT NULL AND v_referral_fee >= 1 THEN
    UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_fee WHERE id = v_referrer_id;
    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
    VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'market_referral', 'fxu', v_referral_fee, v_referral_fee);
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (v_referrer_id, v_listing.seller_id, 'Comision de referido por venta en mercado', 'Has recibido ' || ROUND(v_referral_fee, 2) || ' FXU como comision por la venta de tu referido en el mercado.', 'system');
  END IF;

  IF v_purchase_qty = v_listing.quantity THEN
    UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  ELSE
    UPDATE market_listings SET quantity = quantity - v_purchase_qty, total_price = (quantity - v_purchase_qty) * price_per_unit, updated_at = now() WHERE id = p_listing_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'quantity', v_purchase_qty, 'total_price', v_total_price, 'jackpot_contribution', v_jackpot_amount, 'fee_percent', v_market_fee_percent);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al procesar la compra: ' || SQLERRM);
END;
$function$;
