-- =====================================================================
-- P2P Functions v3
-- - Escrow completo en p2p_accept_offer (evita bloqueos en release)
-- - p2p_release_order libera desde escrow (sin debitar en release)
-- - p2p_cancel_offer bloquea cancel con ordenes abiertas
-- - p2p_expire_order devuelve fondos del taker en escrow
-- - p2p_admin_resolve_dispute soporta BUY/SELL correctamente
-- =====================================================================

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
  v_open_orders int := 0;
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

  SELECT count(*) INTO v_open_orders
  FROM p2p_orders
  WHERE offer_id = p_offer_id
    AND status IN ('pending_payment','paid','disputed');

  IF v_open_orders > 0 THEN
    RAISE EXCEPTION 'No puedes cancelar: hay ordenes activas en la oferta';
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
    -- BUY: devolver fiat correspondiente al remanente disponible
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
  v_taker_fxu numeric;
  v_taker_usdt numeric;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
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

  -- Escrow del taker al aceptar
  SELECT fxu_balance, usdt_balance INTO v_taker_fxu, v_taker_usdt
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil del tomador no encontrado'; END IF;

  IF v_offer.side = 'sell' THEN
    -- taker=buyer: bloquear fiat del comprador al aceptar
    IF v_offer.fiat_currency = 'FXU' THEN
      IF COALESCE(v_taker_fxu, 0) < v_fiat_amount THEN
        RAISE EXCEPTION 'Comprador sin saldo FXU suficiente';
      END IF;
      UPDATE profiles SET fxu_balance = fxu_balance - v_fiat_amount WHERE id = v_user_id;
    ELSE
      IF COALESCE(v_taker_usdt, 0) < v_fiat_amount THEN
        RAISE EXCEPTION 'Comprador sin saldo USDT suficiente';
      END IF;
      UPDATE profiles SET usdt_balance = usdt_balance - v_fiat_amount WHERE id = v_user_id;
    END IF;
  ELSE
    -- taker=seller: bloquear asset del vendedor al aceptar (en BUY)
    IF v_offer.asset = 'FXU' THEN
      IF COALESCE(v_taker_fxu, 0) < p_asset_amount THEN
        RAISE EXCEPTION 'Vendedor sin saldo FXU suficiente';
      END IF;
      UPDATE profiles SET fxu_balance = fxu_balance - p_asset_amount WHERE id = v_user_id;
    ELSE
      IF COALESCE(v_taker_usdt, 0) < p_asset_amount THEN
        RAISE EXCEPTION 'Vendedor sin saldo USDT suficiente';
      END IF;
      UPDATE profiles SET usdt_balance = usdt_balance - p_asset_amount WHERE id = v_user_id;
    END IF;
  END IF;

  UPDATE p2p_offers
  SET available_amount = available_amount - p_asset_amount,
      updated_at = now()
  WHERE id = v_offer.id;

  IF v_offer.side = 'sell' THEN
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
  VALUES (
    v_order_id,
    v_offer.id,
    v_user_id,
    'order_created',
    jsonb_build_object(
      'asset_amount', p_asset_amount,
      'fiat_amount', v_fiat_amount,
      'fee_asset', v_fee_asset,
      'fee_percent', v_fee_percent,
      'escrowed_by_taker', true
    )
  );

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
    IF v_order.seller_id <> v_user_id THEN
      RAISE EXCEPTION 'Solo el vendedor puede liberar';
    END IF;
  ELSE
    IF v_order.buyer_id <> v_user_id THEN
      RAISE EXCEPTION 'Solo el comprador puede liberar en oferta BUY';
    END IF;
  END IF;

  v_fee_asset := COALESCE(v_order.fee_asset, 0);
  v_transfer_asset := GREATEST(0, v_order.asset_amount - v_fee_asset);

  -- 1) Liberar fiat escrow al seller (ya bloqueado en create/accept)
  v_payment_to_seller := v_order.fiat_amount;
  IF v_order.fiat_currency = 'FXU' THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_payment_to_seller WHERE id = v_order.seller_id;
  ELSE
    UPDATE profiles SET usdt_balance = usdt_balance + v_payment_to_seller WHERE id = v_order.seller_id;
  END IF;

  -- 2) Transferir asset (menos fee) al buyer (ya bloqueado en create/accept)
  IF v_order.asset = 'FXU' THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_transfer_asset WHERE id = v_order.buyer_id;
  ELSE
    UPDATE profiles SET usdt_balance = usdt_balance + v_transfer_asset WHERE id = v_order.buyer_id;
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

  -- 4) Consumir lock de la oferta
  UPDATE p2p_offers
  SET locked_amount = GREATEST(0, locked_amount - v_order.asset_amount),
      status = CASE WHEN (available_amount <= 0 AND (locked_amount - v_order.asset_amount) <= 0) THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE id = v_offer.id;

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
  VALUES (
    p_order_id,
    v_order.offer_id,
    v_user_id,
    'order_released',
    jsonb_build_object(
      'fee_asset', v_fee_asset,
      'asset_transferred', v_transfer_asset,
      'fiat_transferred', v_payment_to_seller
    )
  );

  RETURN true;
END;
$$;


CREATE OR REPLACE FUNCTION p2p_expire_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order p2p_orders%ROWTYPE;
  v_offer p2p_offers%ROWTYPE;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'La orden no se puede expirar en este estado';
  END IF;

  IF now() <= v_order.payment_deadline THEN
    RAISE EXCEPTION 'La orden aun no vence';
  END IF;

  IF v_user_id <> v_order.seller_id AND v_user_id <> v_order.buyer_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = v_order.offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;

  -- Devolver liquidez de la oferta
  UPDATE p2p_offers
  SET available_amount = available_amount + v_order.asset_amount,
      updated_at = now()
  WHERE id = v_order.offer_id;

  -- Reembolsar escrow del taker en accept
  IF v_offer.side = 'sell' THEN
    -- Refund fiat al buyer(taker)
    IF v_order.fiat_currency = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_order.fiat_amount WHERE id = v_order.buyer_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_order.fiat_amount WHERE id = v_order.buyer_id;
    END IF;
  ELSE
    -- side=buy: refund asset al seller(taker)
    IF v_order.asset = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_order.asset_amount WHERE id = v_order.seller_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_order.asset_amount WHERE id = v_order.seller_id;
    END IF;
  END IF;

  UPDATE p2p_orders
  SET status = 'expired', cancelled_at = now(), updated_at = now(), cancellation_reason = 'payment_timeout'
  WHERE id = p_order_id;

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action, meta)
  VALUES (
    p_order_id,
    v_order.offer_id,
    v_user_id,
    'order_expired',
    jsonb_build_object('offer_side', v_offer.side, 'refunded_taker_escrow', true)
  );

  RETURN true;
END;
$$;


CREATE OR REPLACE FUNCTION p2p_admin_resolve_dispute(
  p_order_id uuid,
  p_release_to_buyer boolean,
  p_admin_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order p2p_orders%ROWTYPE;
  v_offer p2p_offers%ROWTYPE;
  v_dispute p2p_disputes%ROWTYPE;
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
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Nota: resolver disputas solo desde backend con service key
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role puede resolver disputas';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_order.status <> 'disputed' THEN
    RAISE EXCEPTION 'La orden no esta en disputa';
  END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = v_order.offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;

  SELECT * INTO v_dispute FROM p2p_disputes WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disputa no existe'; END IF;

  IF p_release_to_buyer THEN
    -- Misma liquidacion economica que release normal, usando escrow ya bloqueado
    v_fee_asset := COALESCE(v_order.fee_asset, 0);
    v_transfer_asset := GREATEST(0, v_order.asset_amount - v_fee_asset);

    -- Fiat al seller
    IF v_order.fiat_currency = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_order.fiat_amount WHERE id = v_order.seller_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_order.fiat_amount WHERE id = v_order.seller_id;
    END IF;

    -- Asset (menos fee) al buyer
    IF v_order.asset = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_transfer_asset WHERE id = v_order.buyer_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_transfer_asset WHERE id = v_order.buyer_id;
    END IF;

    -- Distribucion fee
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

    UPDATE p2p_offers
    SET locked_amount = GREATEST(0, locked_amount - v_order.asset_amount),
        status = CASE WHEN (available_amount <= 0 AND (locked_amount - v_order.asset_amount) <= 0) THEN 'completed' ELSE status END,
        updated_at = now()
    WHERE id = v_order.offer_id;

    UPDATE p2p_orders
    SET status = 'resolved', released_at = now(), updated_at = now()
    WHERE id = p_order_id;

    UPDATE p2p_disputes
    SET status = 'resolved_buyer', admin_notes = p_admin_notes, resolved_at = now()
    WHERE id = v_dispute.id;

    INSERT INTO p2p_reputation(user_id) VALUES (v_order.seller_id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE p2p_reputation SET lost_disputes = lost_disputes + 1, updated_at = now() WHERE user_id = v_order.seller_id;
  ELSE
    -- Cancelar orden y devolver escrows a sus dueños originales
    UPDATE p2p_offers
    SET available_amount = available_amount + v_order.asset_amount,
        updated_at = now()
    WHERE id = v_order.offer_id;

    -- Refund fiat escrow al buyer
    IF v_order.fiat_currency = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_order.fiat_amount WHERE id = v_order.buyer_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_order.fiat_amount WHERE id = v_order.buyer_id;
    END IF;

    -- Refund asset escrow al seller
    IF v_order.asset = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_order.asset_amount WHERE id = v_order.seller_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_order.asset_amount WHERE id = v_order.seller_id;
    END IF;

    UPDATE p2p_orders
    SET status = 'resolved', cancelled_at = now(), cancellation_reason = 'admin_resolved_seller', updated_at = now()
    WHERE id = p_order_id;

    UPDATE p2p_disputes
    SET status = 'resolved_seller', admin_notes = p_admin_notes, resolved_at = now()
    WHERE id = v_dispute.id;

    INSERT INTO p2p_reputation(user_id) VALUES (v_order.buyer_id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE p2p_reputation SET lost_disputes = lost_disputes + 1, updated_at = now() WHERE user_id = v_order.buyer_id;
  END IF;

  INSERT INTO p2p_audit_log(order_id, offer_id, action, meta)
  VALUES (
    p_order_id,
    v_order.offer_id,
    'dispute_resolved',
    jsonb_build_object('release_to_buyer', p_release_to_buyer, 'offer_side', v_offer.side)
  );

  RETURN true;
END;
$$;
