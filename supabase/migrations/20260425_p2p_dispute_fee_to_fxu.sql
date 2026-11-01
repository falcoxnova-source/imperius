-- =====================================================================
-- P2P Disputes: Convertir fees USDT -> FXU al resolver disputa
--
-- Cambio: cuando el admin resuelve una disputa a favor del comprador,
-- y el asset es USDT, el fee se convierte automaticamente a FXU usando
-- la tasa fxu_usd_rate (default 0.0001 USD por FXU, o 10,000 FXU por USD).
--
-- Todos los fees (admin, pool, referido) se distribuyen entonces en FXU.
-- El pool siempre va al jackpot FXU.
--
-- Ejemplo: orden de 100 USDT con fee 1 USDT
--   -> 1 USDT se convierte a 10,000 FXU
--   -> admin: 5,000 FXU / pool: 4,500 FXU / referido: 500 FXU
--      (si no hay referido: admin 5,000 / pool 5,000)
-- =====================================================================

-- Asegurar que exista la tasa FXU/USD en game_settings (0.0001 USD = 1 FXU)
INSERT INTO game_settings (key, value, description)
VALUES ('fxu_usd_rate', '0.0001', 'Valor en USD de 1 FXU. Tasa fija para convertir fees USDT->FXU.')
ON CONFLICT (key) DO NOTHING;


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

  v_caller_id uuid := auth.uid();
  v_caller_is_admin boolean := false;

  v_admin_id uuid;
  v_referrer_id uuid;

  v_admin_share numeric;
  v_ref_share numeric;
  v_pool_share numeric;

  v_admin_fee numeric;
  v_ref_fee numeric;
  v_pool_fee numeric;

  v_internal_fiat boolean;

  -- [NUEVO] Conversion USDT -> FXU para distribucion de fees
  v_fxu_usd_rate numeric;       -- USD por 1 FXU (ej: 0.0001)
  v_fee_distrib_currency text;  -- 'FXU' o 'USDT' - moneda en la que se reparte el fee
  v_fee_distrib_amount numeric; -- cantidad total de fee en la moneda de distribucion
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  IF coalesce(auth.role(),'') <> 'service_role' THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'No autenticado';
    END IF;
    SELECT COALESCE(is_admin, false) INTO v_caller_is_admin
    FROM profiles WHERE id = v_caller_id;
    IF NOT v_caller_is_admin THEN
      RAISE EXCEPTION 'Solo admin o service_role puede resolver disputas';
    END IF;
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

  v_internal_fiat := upper(v_order.fiat_currency) IN ('FXU','USDT');

  IF p_release_to_buyer THEN
    v_fee_asset := COALESCE(v_order.fee_asset, 0);
    v_transfer_asset := GREATEST(0, v_order.asset_amount - v_fee_asset);

    -- El vendedor recibe el fiat
    IF v_internal_fiat THEN
      IF upper(v_order.fiat_currency) = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_order.fiat_amount WHERE id = v_order.seller_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_order.fiat_amount WHERE id = v_order.seller_id;
      END IF;
    END IF;

    -- El comprador recibe el asset MENOS el fee (igual que antes)
    IF v_order.asset = 'FXU' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_transfer_asset WHERE id = v_order.buyer_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_transfer_asset WHERE id = v_order.buyer_id;
    END IF;

    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_order.seller_id;

    SELECT COALESCE(value::numeric,50) INTO v_admin_share FROM game_settings WHERE key='p2p_fee_admin_share';
    SELECT COALESCE(value::numeric,5)  INTO v_ref_share   FROM game_settings WHERE key='p2p_fee_referrer_share';
    SELECT COALESCE(value::numeric,45) INTO v_pool_share  FROM game_settings WHERE key='p2p_fee_pool_share';

    IF v_referrer_id IS NULL THEN
      v_pool_share := v_pool_share + v_ref_share;
      v_ref_share := 0;
    END IF;

    -- =================================================================
    -- [NUEVO] Determinar moneda de distribucion del fee
    --   - Si asset = FXU  -> distribuir en FXU (como siempre)
    --   - Si asset = USDT -> convertir a FXU usando fxu_usd_rate y distribuir en FXU
    -- =================================================================
    IF v_order.asset = 'USDT' AND v_fee_asset > 0 THEN
      SELECT COALESCE(value::numeric, 0.0001) INTO v_fxu_usd_rate
      FROM game_settings WHERE key = 'fxu_usd_rate';
      IF v_fxu_usd_rate IS NULL OR v_fxu_usd_rate <= 0 THEN
        v_fxu_usd_rate := 0.0001; -- fallback seguro
      END IF;

      -- USDT_fee / (USD_por_FXU) = FXU_equivalente
      -- ej: 1 USDT / 0.0001 = 10,000 FXU
      v_fee_distrib_currency := 'FXU';
      v_fee_distrib_amount := v_fee_asset / v_fxu_usd_rate;
    ELSE
      -- asset = FXU o fee=0: comportamiento original
      v_fee_distrib_currency := v_order.asset::text;
      v_fee_distrib_amount := v_fee_asset;
    END IF;

    v_admin_fee := round((v_fee_distrib_amount * v_admin_share / 100.0)::numeric, 8);
    v_ref_fee   := round((v_fee_distrib_amount * v_ref_share   / 100.0)::numeric, 8);
    v_pool_fee  := GREATEST(0, v_fee_distrib_amount - v_admin_fee - v_ref_fee);

    -- Admin fee
    IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
      IF v_fee_distrib_currency = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_admin_fee WHERE id = v_admin_id;
      END IF;
    END IF;

    -- Referido fee
    IF v_referrer_id IS NOT NULL AND v_ref_fee > 0 THEN
      IF v_fee_distrib_currency = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_ref_fee WHERE id = v_referrer_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_ref_fee WHERE id = v_referrer_id;
      END IF;

      INSERT INTO referral_commissions (
        referrer_id, seller_id, transaction_id,
        commission_type, resource_type, amount, fxu_amount, created_at
      ) VALUES (
        v_referrer_id, v_order.seller_id, NULL,
        'market_referral', lower(v_fee_distrib_currency), CEIL(v_ref_fee)::bigint, v_ref_fee, now()
      );
    END IF;

    -- Pool fee -> SIEMPRE al jackpot FXU si la distribucion es en FXU
    IF v_pool_fee > 0 THEN
      IF v_fee_distrib_currency = 'FXU' THEN
        PERFORM contribute_to_jackpot(v_pool_fee, 'p2p_fee', v_order.seller_id);
      ELSIF v_admin_id IS NOT NULL THEN
        -- Fallback (no deberia ocurrir con la logica actual): va al admin en USDT
        UPDATE profiles SET usdt_balance = usdt_balance + v_pool_fee WHERE id = v_admin_id;
      END IF;
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
    SET status = 'resolved_buyer', admin_id = v_caller_id, admin_notes = p_admin_notes, resolved_at = now()
    WHERE id = v_dispute.id;

    INSERT INTO p2p_reputation(user_id) VALUES (v_order.seller_id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE p2p_reputation SET lost_disputes = lost_disputes + 1, updated_at = now() WHERE user_id = v_order.seller_id;
  ELSE
    -- Rama a favor del vendedor: no hay fee (se cancela la operacion), queda igual
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
    SET status = 'resolved', cancelled_at = now(), cancellation_reason = 'admin_resolved_seller', updated_at = now()
    WHERE id = p_order_id;

    UPDATE p2p_disputes
    SET status = 'resolved_seller', admin_id = v_caller_id, admin_notes = p_admin_notes, resolved_at = now()
    WHERE id = v_dispute.id;

    INSERT INTO p2p_reputation(user_id) VALUES (v_order.buyer_id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE p2p_reputation SET lost_disputes = lost_disputes + 1, updated_at = now() WHERE user_id = v_order.buyer_id;
  END IF;

  INSERT INTO p2p_audit_log(order_id, offer_id, action, meta)
  VALUES (
    p_order_id,
    v_order.offer_id,
    'dispute_resolved',
    jsonb_build_object(
      'release_to_buyer', p_release_to_buyer,
      'offer_side', v_offer.side,
      'internal_fiat', v_internal_fiat,
      'resolved_by', v_caller_id,
      'fee_asset', v_fee_asset,
      'fee_distrib_currency', v_fee_distrib_currency,
      'fee_distrib_amount', v_fee_distrib_amount,
      'fxu_usd_rate', v_fxu_usd_rate
    )
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION p2p_admin_resolve_dispute(uuid, boolean, text) TO authenticated;
