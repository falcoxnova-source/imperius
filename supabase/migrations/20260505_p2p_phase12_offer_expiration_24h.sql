-- =====================================================================
-- P2P Fase 12
-- 1) Las ofertas publicadas vencen a las 24h si nadie toma la parte restante
-- 2) Al vencer, salen del libro y se devuelve el saldo disponible no tomado
-- 3) Las operaciones ya iniciadas siguen su curso normal (locked_amount)
-- =====================================================================

ALTER TABLE p2p_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE p2p_offers
SET expires_at = created_at + interval '24 hours'
WHERE expires_at IS NULL;

ALTER TABLE p2p_offers
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE p2p_offers
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

ALTER TABLE p2p_offers
  DROP CONSTRAINT IF EXISTS p2p_offers_status_check;

ALTER TABLE p2p_offers
  ADD CONSTRAINT p2p_offers_status_check
  CHECK (status IN ('active','paused','completed','cancelled','expired'));


CREATE OR REPLACE FUNCTION p2p_expire_stale_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer p2p_offers%ROWTYPE;
  v_expired_count integer := 0;
  v_refund_fiat numeric;
  v_zero_available_count integer := 0;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  FOR v_offer IN
    SELECT *
    FROM p2p_offers
    WHERE status = 'active'
      AND expires_at <= now()
      AND available_amount > 0
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_offer.side = 'sell' THEN
      IF v_offer.asset = 'FXU' THEN
        UPDATE profiles
        SET fxu_balance = fxu_balance + v_offer.available_amount
        WHERE id = v_offer.user_id;
      ELSE
        UPDATE profiles
        SET usdt_balance = usdt_balance + v_offer.available_amount
        WHERE id = v_offer.user_id;
      END IF;
    ELSE
      v_refund_fiat := round((v_offer.available_amount * v_offer.price_per_unit)::numeric, 8);
      IF upper(v_offer.fiat_currency) = 'FXU' THEN
        UPDATE profiles
        SET fxu_balance = fxu_balance + v_refund_fiat
        WHERE id = v_offer.user_id;
      ELSE
        UPDATE profiles
        SET usdt_balance = usdt_balance + v_refund_fiat
        WHERE id = v_offer.user_id;
      END IF;
    END IF;

    UPDATE p2p_offers
    SET available_amount = 0,
        locked_amount = GREATEST(0, locked_amount - v_offer.available_amount),
        status = 'expired',
        updated_at = now()
    WHERE id = v_offer.id;

    INSERT INTO p2p_audit_log(offer_id, actor_id, action, meta)
    VALUES (
      v_offer.id,
      v_offer.user_id,
      'offer_expired',
      jsonb_build_object(
        'side', v_offer.side,
        'available_amount_refunded', v_offer.available_amount,
        'fiat_currency', v_offer.fiat_currency,
        'expired_at', now()
      )
    );

    v_expired_count := v_expired_count + 1;
  END LOOP;

  -- Ofertas vencidas sin saldo libre: solo sacarlas del libro
  UPDATE p2p_offers
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND expires_at <= now()
    AND available_amount <= 0;

  GET DIAGNOSTICS v_zero_available_count = ROW_COUNT;
  v_expired_count := v_expired_count + v_zero_available_count;

  RETURN v_expired_count;
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
  v_internal_fiat boolean;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  PERFORM p2p_expire_stale_offers();

  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_asset_amount <= 0 THEN RAISE EXCEPTION 'Monto invalido'; END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;
  IF v_offer.status <> 'active' THEN RAISE EXCEPTION 'Oferta no esta activa'; END IF;
  IF v_offer.expires_at <= now() THEN
    RAISE EXCEPTION 'La oferta ha vencido';
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

  SELECT COALESCE(value::numeric, 1) INTO v_fee_percent
  FROM game_settings WHERE key = 'p2p_fee_percent';
  v_fee_percent := COALESCE(v_fee_percent, 1);

  v_fee_asset := round((p_asset_amount * v_fee_percent / 100.0)::numeric, 8);
  v_fiat_amount := round((p_asset_amount * v_offer.price_per_unit)::numeric, 8);
  v_internal_fiat := upper(v_offer.fiat_currency) IN ('FXU','USDT');

  SELECT fxu_balance, usdt_balance INTO v_taker_fxu, v_taker_usdt
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil del tomador no encontrado'; END IF;

  IF v_offer.side = 'sell' THEN
    IF v_internal_fiat THEN
      IF upper(v_offer.fiat_currency) = 'FXU' THEN
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
    END IF;
  ELSE
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
      'internal_fiat', v_internal_fiat,
      'escrowed_by_taker', (v_offer.side = 'buy') OR (v_offer.side = 'sell' AND v_internal_fiat)
    )
  );

  RETURN v_order_id;
END;
$$;


COMMENT ON FUNCTION p2p_expire_stale_offers() IS
'Fase 12: expira ofertas activas vencidas, las saca del libro y devuelve el saldo disponible no tomado.';
