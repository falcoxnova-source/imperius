-- =====================================================================
-- P2P BUY con fiat externo
-- - BUY ahora permite cualquier moneda/método habilitado (igual que SELL)
-- - Si BUY usa fiat interno (FXU/USDT), mantiene bloqueo interno al crear oferta
-- - Si BUY usa fiat externo, no bloquea saldo interno al crear/cancelar oferta
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
  v_internal_fiat boolean;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  IF v_side NOT IN ('SELL','BUY') THEN
    RAISE EXCEPTION 'side invalido';
  END IF;

  IF v_asset NOT IN ('FXU','USDT') THEN
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

  v_internal_fiat := v_fiat IN ('FXU','USDT');

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
    -- BUY: solo bloquear cuando fiat es interno
    IF v_internal_fiat THEN
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
    jsonb_build_object(
      'side', lower(v_side),
      'asset', v_asset,
      'fiat_currency', v_fiat,
      'internal_fiat', v_internal_fiat,
      'amount', p_total_amount
    )
  );

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
  v_open_orders int := 0;
  v_internal_fiat boolean;
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

  v_internal_fiat := upper(coalesce(v_offer.fiat_currency, '')) IN ('FXU', 'USDT');

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
    -- BUY: solo devolver fiat si fue interno
    IF v_internal_fiat THEN
      v_return_amount := round((COALESCE(v_offer.available_amount, 0) * COALESCE(v_offer.price_per_unit, 0))::numeric, 8);
      IF v_return_amount > 0 THEN
        IF upper(v_offer.fiat_currency) = 'FXU' THEN
          UPDATE profiles SET fxu_balance = fxu_balance + v_return_amount WHERE id = v_user_id;
        ELSE
          UPDATE profiles SET usdt_balance = usdt_balance + v_return_amount WHERE id = v_user_id;
        END IF;
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
  VALUES (
    p_offer_id,
    v_user_id,
    'offer_cancelled',
    jsonb_build_object(
      'returned', v_return_amount,
      'side', v_offer.side,
      'internal_fiat', v_internal_fiat
    )
  );

  RETURN true;
END;
$$;
