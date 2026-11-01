CREATE OR REPLACE FUNCTION public.fulfill_buy_offer(p_offer_id uuid, p_quantity bigint, p_planet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_offer RECORD;
  v_fill_qty bigint;
  v_fill_price numeric;
  v_fee numeric;
  v_jackpot_contribution_rate numeric;
  v_jackpot_amount numeric;
  v_admin_fee numeric;
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
  v_referral_commission_percent numeric;
  v_referral_commission numeric;
  v_referral_resource_amount bigint;
  v_referrer_planet_id uuid;
  v_transaction_id uuid;
  v_vacation boolean;
  v_buyer_planet_id uuid;
BEGIN
  PERFORM public._occ_guard(p_planet_id); /* [OCUPA1-g] */
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

  v_market_fee_percent := get_market_fee_for_user(v_user_id);
  v_referral_commission_percent := get_referral_commission_percent();

  SELECT contribution_rate INTO v_jackpot_contribution_rate FROM jackpot_config WHERE id = 1;
  v_jackpot_contribution_rate := COALESCE(v_jackpot_contribution_rate, 10);

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

  -- Validar planeta principal del comprador ANTES de descontar items del vendedor.
  IF v_offer.listing_type != 'dark_matter' THEN
    SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_offer.buyer_id AND is_main_planet = true LIMIT 1;
    IF v_buyer_planet_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'El comprador no tiene planeta principal. No se pueden entregar los items.');
    END IF;
  END IF;

  -- Descontar items del vendedor.
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

  -- Calcular fee.
  v_fill_price := v_offer.price_per_unit * v_fill_qty;
  v_fee := v_fill_price * (v_market_fee_percent / 100);
  v_jackpot_amount := floor(v_fee * 50 / 100);
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_user_id;
  IF v_referrer_id IS NOT NULL THEN
    v_referral_commission := floor((v_fee - v_jackpot_amount) * 20 / 100);
  ELSE
    v_referral_commission := 0;
  END IF;
  v_admin_fee := v_fee - v_jackpot_amount - v_referral_commission;
  v_seller_amount := v_fill_price - v_fee;

  PERFORM _internal_set_fxu_context();

  -- Pagar al vendedor.
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_user_id;

  -- Fee de admin.
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;

    PERFORM record_admin_revenue(
      'market_fee',
      v_admin_fee,
      'Oferta compra: ' || v_fill_qty || 'x ' || v_offer.item_code || ' (' || v_market_fee_percent || '% fee)',
      v_user_id,
      p_offer_id
    );
  END IF;

  -- Contribucion al jackpot.
  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_user_id);
  END IF;

  -- Entregar items al planeta principal del comprador (ya validado).
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

  -- Registrar transaccion.
  INSERT INTO market_transactions (buy_offer_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_offer_id, v_offer.buyer_id, v_user_id, v_offer.listing_type, v_offer.item_code, v_fill_qty, v_fill_price)
  RETURNING id INTO v_transaction_id;

  -- Comision de referido: 20% de la parte de empresa (= 10% del fee), en TUNG.
  IF v_referrer_id IS NOT NULL AND v_referral_commission >= 1 THEN
    UPDATE profiles
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_commission
    WHERE id = v_referrer_id;

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
    VALUES (v_referrer_id, v_user_id, v_transaction_id, 'market_referral', 'fxu', v_referral_commission, v_referral_commission);
  END IF;

  -- Actualizar estado de la oferta.
  UPDATE market_buy_offers
  SET
    quantity_filled = quantity_filled + v_fill_qty,
    status = CASE WHEN quantity_filled + v_fill_qty >= quantity THEN 'filled' ELSE 'active' END,
    updated_at = now()
  WHERE id = p_offer_id;

  -- Notificar al comprador.
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    v_user_id,
    v_offer.buyer_id,
    'Oferta de compra cumplida',
    'Tu oferta de compra de ' || v_fill_qty || 'x ' || v_offer.item_code || ' ha sido cumplida. Los items fueron enviados a tu planeta principal.',
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'quantity_filled', v_fill_qty,
    'fxu_received', v_seller_amount,
    'fee_paid', v_fee,
    'jackpot_contribution', v_jackpot_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cumplir oferta: ' || SQLERRM);
END;
$function$

