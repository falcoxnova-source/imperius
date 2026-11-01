-- =====================================================================
-- P2P Marketplace Functions (Fase 1: solo ofertas SELL de FXU/USDT interno)
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF upper(coalesce(p_side,'')) <> 'SELL' THEN
    RAISE EXCEPTION 'Fase 1: solo se permiten ofertas SELL';
  END IF;

  IF upper(coalesce(p_asset,'')) NOT IN ('FXU','USDT') THEN
    RAISE EXCEPTION 'Asset invalido';
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

  SELECT fxu_balance, usdt_balance
    INTO v_fxu, v_usdt
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF upper(p_asset) = 'FXU' THEN
    IF coalesce(v_fxu,0) < p_total_amount THEN
      RAISE EXCEPTION 'Saldo FXU insuficiente';
    END IF;
    UPDATE profiles SET fxu_balance = fxu_balance - p_total_amount WHERE id = v_user_id;
  ELSE
    IF coalesce(v_usdt,0) < p_total_amount THEN
      RAISE EXCEPTION 'Saldo USDT insuficiente';
    END IF;
    UPDATE profiles SET usdt_balance = usdt_balance - p_total_amount WHERE id = v_user_id;
  END IF;

  INSERT INTO p2p_offers (
    user_id, side, asset, fiat_currency,
    price_per_unit, total_amount, available_amount, locked_amount,
    min_trade_amount, max_trade_amount, payment_method_ids,
    terms, country_code, time_limit_minutes, status
  ) VALUES (
    v_user_id, lower(p_side), upper(p_asset), upper(p_fiat_currency),
    p_price_per_unit, p_total_amount, p_total_amount, p_total_amount,
    coalesce(p_min_trade_amount,0), p_max_trade_amount, p_payment_method_ids,
    p_terms, p_country_code, p_time_limit_minutes, 'active'
  ) RETURNING id INTO v_offer_id;

  INSERT INTO p2p_audit_log(offer_id, actor_id, action, meta)
  VALUES (v_offer_id, v_user_id, 'offer_created', jsonb_build_object('asset', upper(p_asset), 'amount', p_total_amount));

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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_offer
  FROM p2p_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oferta no existe';
  END IF;

  IF v_offer.user_id <> v_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v_offer.status IN ('cancelled','completed') THEN
    RETURN true;
  END IF;

  v_return_amount := coalesce(v_offer.available_amount, 0);

  UPDATE p2p_offers
  SET status = 'cancelled',
      available_amount = 0,
      locked_amount = GREATEST(0, locked_amount - v_return_amount),
      updated_at = now()
  WHERE id = p_offer_id;

  IF v_return_amount > 0 THEN
    IF v_offer.asset = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_return_amount WHERE id = v_user_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_return_amount WHERE id = v_user_id;
    END IF;
  END IF;

  INSERT INTO p2p_audit_log(offer_id, actor_id, action, meta)
  VALUES (p_offer_id, v_user_id, 'offer_cancelled', jsonb_build_object('returned', v_return_amount));

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_asset_amount <= 0 THEN
    RAISE EXCEPTION 'Monto invalido';
  END IF;

  SELECT * INTO v_offer
  FROM p2p_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oferta no existe';
  END IF;

  IF v_offer.status <> 'active' THEN
    RAISE EXCEPTION 'Oferta no esta activa';
  END IF;

  IF v_offer.side <> 'sell' THEN
    RAISE EXCEPTION 'Fase 1: solo ofertas SELL';
  END IF;

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

  v_fiat_amount := round((p_asset_amount * v_offer.price_per_unit)::numeric, 8);

  UPDATE p2p_offers
  SET available_amount = available_amount - p_asset_amount,
      updated_at = now()
  WHERE id = v_offer.id;

  INSERT INTO p2p_orders (
    offer_id, seller_id, buyer_id, asset, asset_amount,
    fiat_currency, fiat_amount, price_per_unit,
    payment_method_id, buyer_payment_details,
    payment_deadline, status
  ) VALUES (
    v_offer.id, v_offer.user_id, v_user_id, v_offer.asset, p_asset_amount,
    v_offer.fiat_currency, v_fiat_amount, v_offer.price_per_unit,
    p_payment_method_id, coalesce(p_buyer_payment_details, '{}'::jsonb),
    now() + make_interval(mins => v_offer.time_limit_minutes), 'pending_payment'
  ) RETURNING id INTO v_order_id;

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action, meta)
  VALUES (v_order_id, v_offer.id, v_user_id, 'order_created', jsonb_build_object('asset_amount', p_asset_amount));

  RETURN v_order_id;
END;
$$;


CREATE OR REPLACE FUNCTION p2p_mark_paid(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order p2p_orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_order.buyer_id <> v_user_id THEN
    RAISE EXCEPTION 'Solo el comprador puede marcar pagado';
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Estado invalido para marcar pagado';
  END IF;

  IF now() > v_order.payment_deadline THEN
    RAISE EXCEPTION 'Orden vencida';
  END IF;

  UPDATE p2p_orders
  SET status = 'paid', paid_at = now(), updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO p2p_messages(order_id, sender_id, body, is_system)
  VALUES (p_order_id, v_user_id, 'El comprador marco la orden como PAGADA.', true);

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action)
  VALUES (p_order_id, v_order.offer_id, v_user_id, 'order_marked_paid');

  RETURN true;
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
  v_transfer numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_order.seller_id <> v_user_id THEN
    RAISE EXCEPTION 'Solo el vendedor puede liberar';
  END IF;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'La orden no esta en estado paid';
  END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = v_order.offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;

  v_transfer := GREATEST(0, v_order.asset_amount - coalesce(v_order.fee_asset,0));

  -- liberar escrow: restar lock de la oferta
  UPDATE p2p_offers
  SET locked_amount = GREATEST(0, locked_amount - v_order.asset_amount),
      status = CASE WHEN (available_amount <= 0 AND (locked_amount - v_order.asset_amount) <= 0) THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE id = v_offer.id;

  -- acreditar al comprador
  IF v_order.asset = 'FXU' THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_transfer WHERE id = v_order.buyer_id;
  ELSE
    UPDATE profiles SET usdt_balance = usdt_balance + v_transfer WHERE id = v_order.buyer_id;
  END IF;

  UPDATE p2p_orders
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE id = p_order_id;

  -- reputación básica
  INSERT INTO p2p_reputation(user_id) VALUES (v_order.seller_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO p2p_reputation(user_id) VALUES (v_order.buyer_id)  ON CONFLICT (user_id) DO NOTHING;

  UPDATE p2p_reputation SET total_orders = total_orders + 1, completed_orders = completed_orders + 1, updated_at = now()
  WHERE user_id IN (v_order.seller_id, v_order.buyer_id);

  INSERT INTO p2p_messages(order_id, sender_id, body, is_system)
  VALUES (p_order_id, v_user_id, 'El vendedor libero el escrow. Orden completada.', true);

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action, meta)
  VALUES (p_order_id, v_order.offer_id, v_user_id, 'order_released', jsonb_build_object('transfer', v_transfer));

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
BEGIN
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

  UPDATE p2p_orders
  SET status = 'expired', cancelled_at = now(), updated_at = now(), cancellation_reason = 'payment_timeout'
  WHERE id = p_order_id;

  UPDATE p2p_offers
  SET available_amount = available_amount + v_order.asset_amount,
      updated_at = now()
  WHERE id = v_order.offer_id;

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action)
  VALUES (p_order_id, v_order.offer_id, v_user_id, 'order_expired');

  RETURN true;
END;
$$;


CREATE OR REPLACE FUNCTION p2p_open_dispute(
  p_order_id uuid,
  p_reason text,
  p_evidence jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order p2p_orders%ROWTYPE;
  v_dispute_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_user_id <> v_order.seller_id AND v_user_id <> v_order.buyer_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v_order.status NOT IN ('pending_payment','paid') THEN
    RAISE EXCEPTION 'No se puede abrir disputa en este estado';
  END IF;

  UPDATE p2p_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO p2p_disputes(order_id, opened_by, reason, evidence, status)
  VALUES (p_order_id, v_user_id, left(coalesce(p_reason,''), 2000), coalesce(p_evidence, '[]'::jsonb), 'open')
  ON CONFLICT (order_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        evidence = EXCLUDED.evidence,
        status = 'open'
  RETURNING id INTO v_dispute_id;

  INSERT INTO p2p_reputation(user_id) VALUES (v_order.seller_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO p2p_reputation(user_id) VALUES (v_order.buyer_id)  ON CONFLICT (user_id) DO NOTHING;

  UPDATE p2p_reputation
  SET disputed_orders = disputed_orders + 1,
      updated_at = now()
  WHERE user_id IN (v_order.seller_id, v_order.buyer_id);

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action)
  VALUES (p_order_id, v_order.offer_id, v_user_id, 'dispute_opened');

  RETURN v_dispute_id;
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
  v_dispute p2p_disputes%ROWTYPE;
BEGIN
  -- Nota: resolver disputas solo desde backend con service key
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role puede resolver disputas';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_order.status <> 'disputed' THEN
    RAISE EXCEPTION 'La orden no esta en disputa';
  END IF;

  SELECT * INTO v_dispute FROM p2p_disputes WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disputa no existe'; END IF;

  IF p_release_to_buyer THEN
    -- libera al comprador
    IF v_order.asset = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_order.asset_amount WHERE id = v_order.buyer_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_order.asset_amount WHERE id = v_order.buyer_id;
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
    -- devuelve el lock a disponible del vendedor
    UPDATE p2p_offers
    SET available_amount = available_amount + v_order.asset_amount,
        updated_at = now()
    WHERE id = v_order.offer_id;

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
  VALUES (p_order_id, v_order.offer_id, 'dispute_resolved', jsonb_build_object('release_to_buyer', p_release_to_buyer));

  RETURN true;
END;
$$;
