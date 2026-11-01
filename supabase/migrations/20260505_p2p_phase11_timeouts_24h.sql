-- =====================================================================
-- P2P Fase 11
-- 1) Extiende límite de pago por orden hasta 24h (1440 min)
-- 2) Por defecto nuevas ofertas salen con 24h de ventana de pago
-- 3) Protección antifraude: si ambos usuarios ya hablaron en el chat,
--    la orden NO se puede expirar manualmente (debe ir a disputa)
-- =====================================================================

ALTER TABLE p2p_offers
  DROP CONSTRAINT IF EXISTS p2p_offers_time_limit_minutes_check;

ALTER TABLE p2p_offers
  ADD CONSTRAINT p2p_offers_time_limit_minutes_check
  CHECK (time_limit_minutes BETWEEN 5 AND 1440);


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
  p_time_limit_minutes integer DEFAULT 1440
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

  IF v_side = 'BUY' AND v_fiat NOT IN ('FXU','USDT') THEN
    RAISE EXCEPTION 'BUY solo permite fiat interno (FXU/USDT)';
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

  IF p_time_limit_minutes < 5 OR p_time_limit_minutes > 1440 THEN
    RAISE EXCEPTION 'time_limit_minutes fuera de rango';
  END IF;

  IF array_length(p_payment_method_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Debes seleccionar al menos 1 metodo de pago';
  END IF;

  SELECT count(*) INTO v_valid_methods
  FROM p2p_payment_methods
  WHERE is_enabled = true
    AND id = ANY(p_payment_method_ids)
    AND upper(currency_code) = v_fiat;

  IF v_valid_methods <> array_length(p_payment_method_ids,1) THEN
    RAISE EXCEPTION 'Hay metodos de pago invalidos/deshabilitados o no corresponden a la moneda fiat';
  END IF;

  SELECT fxu_balance, usdt_balance INTO v_fxu, v_usdt
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;

  IF v_side = 'SELL' THEN
    IF v_asset = 'FXU' THEN
      IF coalesce(v_fxu,0) < p_total_amount THEN RAISE EXCEPTION 'Saldo FXU insuficiente'; END IF;
      UPDATE profiles SET fxu_balance = fxu_balance - p_total_amount WHERE id = v_user_id;
    ELSE
      IF coalesce(v_usdt,0) < p_total_amount THEN RAISE EXCEPTION 'Saldo USDT insuficiente'; END IF;
      UPDATE profiles SET usdt_balance = usdt_balance - p_total_amount WHERE id = v_user_id;
    END IF;
  ELSE
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
  VALUES (
    v_offer_id,
    v_user_id,
    'offer_created',
    jsonb_build_object('side', lower(v_side), 'asset', v_asset, 'fiat_currency', v_fiat, 'amount', p_total_amount)
  );

  RETURN v_offer_id;
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
  v_internal_fiat boolean;
  v_buyer_msg boolean;
  v_seller_msg boolean;
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

  SELECT EXISTS (
    SELECT 1
    FROM p2p_messages
    WHERE order_id = v_order.id
      AND sender_id = v_order.buyer_id
      AND coalesce(is_system,false) = false
  ) INTO v_buyer_msg;

  SELECT EXISTS (
    SELECT 1
    FROM p2p_messages
    WHERE order_id = v_order.id
      AND sender_id = v_order.seller_id
      AND coalesce(is_system,false) = false
  ) INTO v_seller_msg;

  IF coalesce(v_buyer_msg,false) AND coalesce(v_seller_msg,false) THEN
    RAISE EXCEPTION 'La orden tiene interaccion de ambas partes. Abra una disputa para resolverla.';
  END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = v_order.offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;

  v_internal_fiat := upper(v_order.fiat_currency) IN ('FXU','USDT');

  UPDATE p2p_offers
  SET available_amount = available_amount + v_order.asset_amount,
      updated_at = now()
  WHERE id = v_order.offer_id;

  IF v_offer.side = 'sell' THEN
    IF v_internal_fiat THEN
      IF upper(v_order.fiat_currency) = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_order.fiat_amount WHERE id = v_order.buyer_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_order.fiat_amount WHERE id = v_order.buyer_id;
      END IF;
    END IF;
  ELSE
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
    jsonb_build_object('offer_side', v_offer.side, 'internal_fiat', v_internal_fiat)
  );

  RETURN true;
END;
$$;

COMMENT ON FUNCTION p2p_create_offer(text, text, text, numeric, numeric, numeric, numeric, integer[], text, text, integer) IS
'Fase 11: permite time_limit_minutes hasta 1440 (24h).';

COMMENT ON FUNCTION p2p_expire_order(uuid) IS
'Fase 11: evita expirar manualmente si ambas partes ya interactuaron en chat; usar disputa.';
