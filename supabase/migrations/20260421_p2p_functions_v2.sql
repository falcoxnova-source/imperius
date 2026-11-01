-- =====================================================================
-- P2P Functions v2
-- - Habilita ofertas BUY y SELL
-- - Calcula fee en p2p_accept_offer
-- - Distribuye fee en p2p_release_order
-- =====================================================================

CREATE OR REPLACE FUNCTION p2p_create_offer(
  p_side text,
  p_asset text,
  p_fiat_currency text,
  p_price_per_unit numeric,
  p_total_amount numeric,
  p_min_trade_amount numeric DEFAULT 0,
  p_max_trade_amount numeric DEFAULT NULL,
  p_payment_method_ids integer[] DEFAULT '{}',
  p_terms text DEFAULT NULL,
  p_country_code text DEFAULT NULL,
  p_time_limit_minutes integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer_id uuid;
  v_fxu numeric;
  v_usdt numeric;
  v_valid_methods int;
  v_side text := upper(coalesce(p_side,''));
  v_asset text := upper(coalesce(p_asset,''));
  v_fiat text := upper(coalesce(p_fiat_currency,''));
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  IF v_side NOT IN ('SELL','BUY') THEN
    RAISE EXCEPTION 'side invalido';
  END IF;

  IF v_asset NOT IN ('FXU','USDT') THEN
    RAISE EXCEPTION 'Asset invalido';
  END IF;

  -- Fase 1 interna: fiat solo FXU/USDT
  IF v_fiat NOT IN ('FXU','USDT') THEN
    RAISE EXCEPTION 'Fase interna: fiat_currency debe ser FXU o USDT';
  END IF;

  IF p_price_per_unit <= 0 OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Precio y monto deben ser > 0';
  END IF;

  IF p_min_trade_amount < 0 OR (p_max_trade_amount IS NOT NULL AND p_max_trade_amount <= 0) THEN
    RAISE EXCEPTION 'Min/Max trade invalidos';
  END IF;

  IF p_max_trade_amount IS NOT NULL AND p_max_trade_amount < p_min_trade_amount THEN
    RAISE EXCEPTION 'max_trade_amount debe ser >= min_trade_amount';
  END IF;

  IF p_time_limit_minutes < 5 OR p_time_limit_minutes > 180 THEN
    RAISE EXCEPTION 'time_limit_minutes fuera de rango';
  END IF;

  IF array_length(p_payment_method_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Debes seleccionar al menos 1 metodo de pago';
  END IF;

  SELECT count(*) INTO v_valid_methods
  FROM p2p_payment_methods
  WHERE is_enabled = true
    AND id = ANY(p_payment_method_ids);

  IF v_valid_methods <> array_length(p_payment_method_ids,1) THEN
    RAISE EXCEPTION 'Hay metodos de pago invalidos o deshabilitados';
  END IF;

  SELECT fxu_balance, usdt_balance INTO v_fxu, v_usdt
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;

  IF v_side = 'SELL' THEN
    -- SELL: bloquear asset del vendedor
    IF v_asset = 'FXU' THEN
      IF coalesce(v_fxu,0) < p_total_amount THEN RAISE EXCEPTION 'Saldo FXU insuficiente'; END IF;
      UPDATE profiles SET fxu_balance = fxu_balance - p_total_amount WHERE id = v_user_id;
    ELSE
      IF coalesce(v_usdt,0) < p_total_amount THEN RAISE EXCEPTION 'Saldo USDT insuficiente'; END IF;
      UPDATE profiles SET usdt_balance = usdt_balance - p_total_amount WHERE id = v_user_id;
    END IF;
  ELSE
    -- BUY: bloquear la moneda de pago (fiat interna) del comprador
    -- total fiat lock = asset_amount * price
    IF v_fiat = 'FXU' THEN
      IF coalesce(v_fxu,0) < (p_total_amount * p_price_per_unit) THEN
        RAISE EXCEPTION 'Saldo FXU insuficiente para BUY';
      END IF;
      UPDATE profiles SET fxu_balance = fxu_balance - (p_total_amount * p_price_per_unit) WHERE id = v_user_id;
    ELSE
      IF coalesce(v_usdt,0) < (p_total_amount * p_price_per_unit) THEN
        RAISE EXCEPTION 'Saldo USDT insuficiente para BUY';
      END IF;
      UPDATE profiles SET usdt_balance = usdt_balance - (p_total_amount * p_price_per_unit) WHERE id = v_user_id;
    END IF;
  END IF;

  INSERT INTO p2p_offers (
    user_id, side, asset, fiat_currency,
    price_per_unit, total_amount, available_amount, locked_amount,
    min_trade_amount, max_trade_amount, payment_method_ids,
    terms, country_code, time_limit_minutes, status
  ) VALUES (
    v_user_id, lower(v_side), v_asset, v_fiat,
    p_price_per_unit, p_total_amount, p_total_amount, p_total_amount,
    coalesce(p_min_trade_amount,0), p_max_trade_amount, p_payment_method_ids,
    p_terms, p_country_code, p_time_limit_minutes, 'active'
  ) RETURNING id INTO v_offer_id;

  INSERT INTO p2p_audit_log(offer_id, actor_id, action, meta)
  VALUES (v_offer_id, v_user_id, 'offer_created', jsonb_build_object('side', lower(v_side), 'asset', v_asset, 'amount', p_total_amount));

  RETURN v_offer_id;
END;
$$;


CREATE OR REPLACE FUNCTION p2p_cancel_offer(p_offer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer p2p_offers%ROWTYPE;
  v_return_amount numeric := 0;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT * INTO v_offer
  FROM p2p_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;
  IF v_offer.user_id <> v_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;

  IF v_offer.status IN ('cancelled','completed') THEN
    RETURN true;
  END IF;

  IF v_offer.side = 'sell' THEN
    v_return_amount := COALESCE(v_offer.available_amount, 0);
    IF v_return_amount > 0 THEN
      IF v_offer.asset = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_return_amount WHERE id = v_user_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_return_amount WHERE id = v_user_id;
      END IF;
    END IF;
  ELSE
    -- buy: devolver moneda de pago equivalente al remanente disponible
    v_return_amount := round((COALESCE(v_offer.available_amount, 0) * COALESCE(v_offer.price_per_unit, 0))::numeric, 8);
    IF v_return_amount > 0 THEN
      IF v_offer.fiat_currency = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_return_amount WHERE id = v_user_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_return_amount WHERE id = v_user_id;
      END IF;
    END IF;
  END IF;

  UPDATE p2p_offers
  SET status = 'cancelled',
      available_amount = 0,
      locked_amount = GREATEST(0, locked_amount - COALESCE(v_offer.available_amount, 0)),
      updated_at = now()
  WHERE id = p_offer_id;

  INSERT INTO p2p_audit_log(offer_id, actor_id, action, meta)
  VALUES (p_offer_id, v_user_id, 'offer_cancelled', jsonb_build_object('returned', v_return_amount, 'side', v_offer.side));

  RETURN true;
END;
$$;


CREATE OR REPLACE FUNCTION p2p_accept_offer(
  p_offer_id uuid,
  p_asset_amount numeric,
  p_payment_method_id integer,
  p_buyer_payment_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer p2p_offers%ROWTYPE;
  v_order_id uuid;
  v_fiat_amount numeric;
  v_fee_percent numeric;
  v_fee_asset numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_asset_amount <= 0 THEN RAISE EXCEPTION 'Monto invalido'; END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;
  IF v_offer.status <> 'active' THEN RAISE EXCEPTION 'Oferta no esta activa'; END IF;

  IF v_offer.user_id = v_user_id THEN
    RAISE EXCEPTION 'No puedes tomar tu propia oferta';
  END IF;

  IF NOT (p_payment_method_id = ANY(v_offer.payment_method_ids)) THEN
    RAISE EXCEPTION 'Metodo de pago no permitido para esta oferta';
  END IF;

  IF p_asset_amount > v_offer.available_amount THEN
    RAISE EXCEPTION 'No hay liquidez suficiente';
  END IF;

  IF v_offer.min_trade_amount > 0 AND p_asset_amount < v_offer.min_trade_amount THEN
    RAISE EXCEPTION 'Monto menor al minimo';
  END IF;

  IF v_offer.max_trade_amount IS NOT NULL AND p_asset_amount > v_offer.max_trade_amount THEN
    RAISE EXCEPTION 'Monto mayor al maximo';
  END IF;

  -- Fee configurable
  SELECT COALESCE(value::numeric, 1) INTO v_fee_percent
  FROM game_settings WHERE key = 'p2p_fee_percent';
  v_fee_percent := COALESCE(v_fee_percent, 1);

  v_fee_asset := round((p_asset_amount * v_fee_percent / 100.0)::numeric, 8);
  v_fiat_amount := round((p_asset_amount * v_offer.price_per_unit)::numeric, 8);

  UPDATE p2p_offers
  SET available_amount = available_amount - p_asset_amount,
      updated_at = now()
  WHERE id = v_offer.id;

  IF v_offer.side = 'sell' THEN
    -- seller es owner del offer, taker (auth user) es buyer
    INSERT INTO p2p_orders (
      offer_id, seller_id, buyer_id, asset, asset_amount,
      fiat_currency, fiat_amount, price_per_unit,
      payment_method_id, buyer_payment_details,
      fee_asset, fee_percent,
      payment_deadline, status
    ) VALUES (
      v_offer.id, v_offer.user_id, v_user_id, v_offer.asset, p_asset_amount,
      v_offer.fiat_currency, v_fiat_amount, v_offer.price_per_unit,
      p_payment_method_id, coalesce(p_buyer_payment_details, '{}'::jsonb),
      v_fee_asset, v_fee_percent,
      now() + make_interval(mins => v_offer.time_limit_minutes), 'pending_payment'
    ) RETURNING id INTO v_order_id;
  ELSE
    -- side=buy: owner del offer es buyer, taker es seller
    INSERT INTO p2p_orders (
      offer_id, seller_id, buyer_id, asset, asset_amount,
      fiat_currency, fiat_amount, price_per_unit,
      payment_method_id, buyer_payment_details,
      fee_asset, fee_percent,
      payment_deadline, status
    ) VALUES (
      v_offer.id, v_user_id, v_offer.user_id, v_offer.asset, p_asset_amount,
      v_offer.fiat_currency, v_fiat_amount, v_offer.price_per_unit,
      p_payment_method_id, coalesce(p_buyer_payment_details, '{}'::jsonb),
      v_fee_asset, v_fee_percent,
      now() + make_interval(mins => v_offer.time_limit_minutes), 'pending_payment'
    ) RETURNING id INTO v_order_id;
  END IF;

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action, meta)
  VALUES (v_order_id, v_offer.id, v_user_id, 'order_created', jsonb_build_object('asset_amount', p_asset_amount, 'fee_asset', v_fee_asset, 'fee_percent', v_fee_percent));

  RETURN v_order_id;
END;
$$;


CREATE OR REPLACE FUNCTION p2p_release_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order p2p_orders%ROWTYPE;
  v_offer p2p_offers%ROWTYPE;
  v_transfer_asset numeric;
  v_fee_asset numeric;

  v_admin_id uuid;
  v_referrer_id uuid;

  v_admin_share numeric;
  v_ref_share numeric;
  v_pool_share numeric;

  v_admin_fee numeric;
  v_ref_fee numeric;
  v_pool_fee numeric;

  v_payment_to_seller numeric;
  v_tmp_balance numeric;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'La orden no esta en estado paid';
  END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = v_order.offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;

  IF v_offer.side = 'sell' THEN
    -- flujo clásico: seller confirma pago fiat y libera asset al buyer
    IF v_order.seller_id <> v_user_id THEN
      RAISE EXCEPTION 'Solo el vendedor puede liberar';
    END IF;

    v_fee_asset := COALESCE(v_order.fee_asset, 0);
    v_transfer_asset := GREATEST(0, v_order.asset_amount - v_fee_asset);

    -- mover pago interno (fiat) del comprador al vendedor
    v_payment_to_seller := v_order.fiat_amount;
    IF v_order.fiat_currency = 'FXU' THEN
      SELECT fxu_balance INTO v_tmp_balance FROM profiles WHERE id = v_order.buyer_id FOR UPDATE;
      IF COALESCE(v_tmp_balance, 0) < v_payment_to_seller THEN
        RAISE EXCEPTION 'Comprador sin saldo FXU suficiente para completar la orden';
      END IF;
      UPDATE profiles SET fxu_balance = fxu_balance - v_payment_to_seller WHERE id = v_order.buyer_id;
      UPDATE profiles SET fxu_balance = fxu_balance + v_payment_to_seller WHERE id = v_order.seller_id;
    ELSE
      SELECT usdt_balance INTO v_tmp_balance FROM profiles WHERE id = v_order.buyer_id FOR UPDATE;
      IF COALESCE(v_tmp_balance, 0) < v_payment_to_seller THEN
        RAISE EXCEPTION 'Comprador sin saldo USDT suficiente para completar la orden';
      END IF;
      UPDATE profiles SET usdt_balance = usdt_balance - v_payment_to_seller WHERE id = v_order.buyer_id;
      UPDATE profiles SET usdt_balance = usdt_balance + v_payment_to_seller WHERE id = v_order.seller_id;
    END IF;

    -- créditos del asset al comprador
    IF v_order.asset = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_transfer_asset WHERE id = v_order.buyer_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_transfer_asset WHERE id = v_order.buyer_id;
    END IF;

    -- distribución fee del asset (basado en vendedor = owner del offer)
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_order.seller_id;

    SELECT COALESCE(value::numeric,50) INTO v_admin_share FROM game_settings WHERE key='p2p_fee_admin_share';
    SELECT COALESCE(value::numeric,5)  INTO v_ref_share   FROM game_settings WHERE key='p2p_fee_referrer_share';
    SELECT COALESCE(value::numeric,45) INTO v_pool_share  FROM game_settings WHERE key='p2p_fee_pool_share';

    IF v_referrer_id IS NULL THEN
      v_pool_share := v_pool_share + v_ref_share;
      v_ref_share := 0;
    END IF;

    v_admin_fee := round((v_fee_asset * v_admin_share / 100.0)::numeric, 8);
    v_ref_fee   := round((v_fee_asset * v_ref_share   / 100.0)::numeric, 8);
    v_pool_fee  := GREATEST(0, v_fee_asset - v_admin_fee - v_ref_fee);

    IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
      IF v_order.asset = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_admin_fee WHERE id = v_admin_id;
      END IF;
    END IF;

    IF v_referrer_id IS NOT NULL AND v_ref_fee > 0 THEN
      IF v_order.asset = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_ref_fee WHERE id = v_referrer_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_ref_fee WHERE id = v_referrer_id;
      END IF;

      INSERT INTO referral_commissions (
        referrer_id, seller_id, transaction_id,
        commission_type, resource_type, amount, fxu_amount, created_at
      ) VALUES (
        v_referrer_id, v_order.seller_id, NULL,
        'market_referral', lower(v_order.asset), CEIL(v_ref_fee)::bigint, v_ref_fee, now()
      );
    END IF;

    IF v_pool_fee > 0 AND v_order.asset = 'FXU' THEN
      PERFORM contribute_to_jackpot(v_pool_fee, 'p2p_fee', v_order.seller_id);
    ELSIF v_pool_fee > 0 AND v_admin_id IS NOT NULL THEN
      -- Si el asset fee es USDT, enviamos al admin (no hay pool USDT actualmente)
      UPDATE profiles SET usdt_balance = usdt_balance + v_pool_fee WHERE id = v_admin_id;
    END IF;

    -- liberar lock de la oferta
    UPDATE p2p_offers
    SET locked_amount = GREATEST(0, locked_amount - v_order.asset_amount),
        status = CASE WHEN (available_amount <= 0 AND (locked_amount - v_order.asset_amount) <= 0) THEN 'completed' ELSE status END,
        updated_at = now()
    WHERE id = v_offer.id;

  ELSE
    -- side=buy: buyer (owner del offer) confirma recepción del asset y libera pago fiat al seller
    IF v_order.buyer_id <> v_user_id THEN
      RAISE EXCEPTION 'Solo el comprador puede liberar en oferta BUY';
    END IF;

    v_fee_asset := COALESCE(v_order.fee_asset, 0);

    -- Debitar asset al seller (taker) en ofertas BUY
    IF v_order.asset = 'FXU' THEN
      SELECT fxu_balance INTO v_tmp_balance FROM profiles WHERE id = v_order.seller_id FOR UPDATE;
      IF COALESCE(v_tmp_balance, 0) < v_order.asset_amount THEN
        RAISE EXCEPTION 'Vendedor sin saldo FXU suficiente para completar la orden BUY';
      END IF;
      UPDATE profiles SET fxu_balance = fxu_balance - v_order.asset_amount WHERE id = v_order.seller_id;
    ELSE
      SELECT usdt_balance INTO v_tmp_balance FROM profiles WHERE id = v_order.seller_id FOR UPDATE;
      IF COALESCE(v_tmp_balance, 0) < v_order.asset_amount THEN
        RAISE EXCEPTION 'Vendedor sin saldo USDT suficiente para completar la orden BUY';
      END IF;
      UPDATE profiles SET usdt_balance = usdt_balance - v_order.asset_amount WHERE id = v_order.seller_id;
    END IF;

    -- 1) Transferir asset (menos fee) al buyer
    v_transfer_asset := GREATEST(0, v_order.asset_amount - v_fee_asset);
    IF v_order.asset = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_transfer_asset WHERE id = v_order.buyer_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_transfer_asset WHERE id = v_order.buyer_id;
    END IF;

    -- 2) Liberar fiat escrow al seller (de la oferta BUY)
    v_payment_to_seller := v_order.fiat_amount;
    IF v_order.fiat_currency = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_payment_to_seller WHERE id = v_order.seller_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_payment_to_seller WHERE id = v_order.seller_id;
    END IF;

    -- 3) Distribuir fee del asset usando seller real de la orden
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_order.seller_id;

    SELECT COALESCE(value::numeric,50) INTO v_admin_share FROM game_settings WHERE key='p2p_fee_admin_share';
    SELECT COALESCE(value::numeric,5)  INTO v_ref_share   FROM game_settings WHERE key='p2p_fee_referrer_share';
    SELECT COALESCE(value::numeric,45) INTO v_pool_share  FROM game_settings WHERE key='p2p_fee_pool_share';

    IF v_referrer_id IS NULL THEN
      v_pool_share := v_pool_share + v_ref_share;
      v_ref_share := 0;
    END IF;

    v_admin_fee := round((v_fee_asset * v_admin_share / 100.0)::numeric, 8);
    v_ref_fee   := round((v_fee_asset * v_ref_share   / 100.0)::numeric, 8);
    v_pool_fee  := GREATEST(0, v_fee_asset - v_admin_fee - v_ref_fee);

    IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
      IF v_order.asset = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_admin_fee WHERE id = v_admin_id;
      END IF;
    END IF;

    IF v_referrer_id IS NOT NULL AND v_ref_fee > 0 THEN
      IF v_order.asset = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_ref_fee WHERE id = v_referrer_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_ref_fee WHERE id = v_referrer_id;
      END IF;

      INSERT INTO referral_commissions (
        referrer_id, seller_id, transaction_id,
        commission_type, resource_type, amount, fxu_amount, created_at
      ) VALUES (
        v_referrer_id, v_order.seller_id, NULL,
        'market_referral', lower(v_order.asset), CEIL(v_ref_fee)::bigint, v_ref_fee, now()
      );
    END IF;

    IF v_pool_fee > 0 AND v_order.asset = 'FXU' THEN
      PERFORM contribute_to_jackpot(v_pool_fee, 'p2p_fee', v_order.seller_id);
    ELSIF v_pool_fee > 0 AND v_admin_id IS NOT NULL THEN
      UPDATE profiles SET usdt_balance = usdt_balance + v_pool_fee WHERE id = v_admin_id;
    END IF;

    -- liberar lock de la oferta BUY sobre amount de asset correspondientemente
    UPDATE p2p_offers
    SET locked_amount = GREATEST(0, locked_amount - v_order.asset_amount),
        status = CASE WHEN (available_amount <= 0 AND (locked_amount - v_order.asset_amount) <= 0) THEN 'completed' ELSE status END,
        updated_at = now()
    WHERE id = v_offer.id;
  END IF;

  UPDATE p2p_orders
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO p2p_reputation(user_id) VALUES (v_order.seller_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO p2p_reputation(user_id) VALUES (v_order.buyer_id)  ON CONFLICT (user_id) DO NOTHING;
  UPDATE p2p_reputation
  SET total_orders = total_orders + 1,
      completed_orders = completed_orders + 1,
      updated_at = now()
  WHERE user_id IN (v_order.seller_id, v_order.buyer_id);

  INSERT INTO p2p_messages(order_id, sender_id, body, is_system)
  VALUES (p_order_id, v_user_id, 'Escrow liberado. Orden completada.', true);

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action, meta)
  VALUES (p_order_id, v_order.offer_id, v_user_id, 'order_released',
          jsonb_build_object('fee_asset', v_fee_asset, 'asset_transferred', v_transfer_asset));

  RETURN true;
END;
$$;
