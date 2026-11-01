-- ============================================================================
-- P2P HARDENING: vender TUNG por todas las monedas + liberar = vendedor
-- Fecha: 2026-05-13
-- ----------------------------------------------------------------------------
-- FIX 1 (create_offer): el juego usa el token "TUNG" (columna tung_balance),
--   que está espejado 1:1 con fxu_balance por el trigger sync_tung_balance().
--   El P2P internamente opera sobre 'FXU'. El frontend enviaba p_asset='TUNG'
--   y la función lo rechazaba con "Asset invalido", impidiendo VENDER TUNG.
--   -> Normalizamos 'TUNG' -> 'FXU' (asset y fiat interno). Almacenamos 'FXU'.
--
-- FIX 2 (release_order): la liberación del escrow debe hacerla SIEMPRE el
--   VENDEDOR (quien tiene el activo en garantía). Antes, en ofertas BUY la
--   liberaba el COMPRADOR, permitiendo que en pago externo el comprador se
--   quedara el activo sin haber pagado. -> Siempre exige seller_id = auth.uid().
-- ============================================================================

-- ------------------------- FIX 1: p2p_create_offer --------------------------
CREATE OR REPLACE FUNCTION public.p2p_create_offer(
  p_side text, p_asset text, p_fiat_currency text, p_price_per_unit numeric,
  p_total_amount numeric, p_min_trade_amount numeric DEFAULT 0,
  p_max_trade_amount numeric DEFAULT NULL::numeric,
  p_payment_method_ids integer[] DEFAULT '{}'::integer[],
  p_terms text DEFAULT NULL::text, p_country_code text DEFAULT NULL::text,
  p_time_limit_minutes integer DEFAULT 1440)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Normalizacion de marca: TUNG (token del juego) == FXU (columna interna,
  -- espejada por trigger). Aceptamos ambos alias y almacenamos 'FXU'.
  IF v_asset = 'TUNG' THEN v_asset := 'FXU'; END IF;
  IF v_fiat  = 'TUNG' THEN v_fiat  := 'FXU'; END IF;

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
      IF coalesce(v_fxu,0) < p_total_amount THEN RAISE EXCEPTION 'Saldo TUNG insuficiente'; END IF;
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
          RAISE EXCEPTION 'Saldo TUNG insuficiente para BUY';
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
$function$;

-- ------------------------- FIX 2: p2p_release_order -------------------------
-- Unico cambio funcional vs. version viva: la liberacion la hace SIEMPRE el
-- vendedor (dueno del activo en garantia), tambien en ofertas BUY.
CREATE OR REPLACE FUNCTION public.p2p_release_order(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_internal_fiat boolean;
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

  -- La garantia (activo) siempre la aporta el VENDEDOR, por lo que solo el
  -- vendedor puede liberarla, sin importar quien creo la oferta.
  IF v_order.seller_id <> v_user_id THEN
    RAISE EXCEPTION 'Solo el vendedor puede liberar el escrow';
  END IF;

  v_internal_fiat := upper(v_order.fiat_currency) IN ('FXU','USDT');
  v_fee_asset := COALESCE(v_order.fee_asset, 0);
  v_transfer_asset := GREATEST(0, v_order.asset_amount - v_fee_asset);

  -- 1) Transferencia fiat al seller solo cuando es interno
  v_payment_to_seller := v_order.fiat_amount;
  IF v_internal_fiat THEN
    IF upper(v_order.fiat_currency) = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_payment_to_seller WHERE id = v_order.seller_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_payment_to_seller WHERE id = v_order.seller_id;
    END IF;
  END IF;

  -- 2) Transferir asset (menos fee) al buyer
  IF v_order.asset = 'FXU' THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_transfer_asset WHERE id = v_order.buyer_id;
  ELSE
    UPDATE profiles SET usdt_balance = usdt_balance + v_transfer_asset WHERE id = v_order.buyer_id;
  END IF;

  -- 3) Distribuir fee del asset
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

    PERFORM record_admin_revenue(
      'p2p_fee',
      v_admin_fee,
      'P2P ' || v_offer.side || ' ' || v_order.asset || ' (order ' || substr(p_order_id::text, 1, 8) || ')',
      v_order.seller_id,
      NULL,
      v_order.asset::text
    );
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
      'admin_fee', v_admin_fee,
      'asset_transferred', v_transfer_asset,
      'fiat_transferred', CASE WHEN v_internal_fiat THEN v_payment_to_seller ELSE 0 END,
      'internal_fiat', v_internal_fiat
    )
  );

  RETURN true;
END;
$function$;
