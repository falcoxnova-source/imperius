-- =====================================================================
-- P2P fee revenue tracking (Dashboard Financiero)
-- =====================================================================
-- Problema: el admin_fee de p2p_release_order y p2p_admin_resolve_dispute
-- se acreditaba directamente al balance del admin, pero nunca se registraba
-- en admin_revenue, por lo que NO aparecía en:
--   · Desglose por Tipo de Ingreso
--   · Historial Semanal de Ingresos
--
-- Este migration:
--   1) Amplía el CHECK constraint con 'p2p_fee'.
--   2) Parchea p2p_release_order para llamar record_admin_revenue().
--   3) Parchea p2p_admin_resolve_dispute idem.
--   4) Backfill: recrea las filas admin_revenue históricas faltantes
--      para órdenes ya released/resolved con fee_asset > 0.
-- =====================================================================

-- 1) CHECK constraint: añadir 'p2p_fee'
ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee', 'withdrawal_fee', 'instant_build', 'instant_research',
    'instant_ship', 'referral_bonus', 'officer_fxu', 'expedition_fee',
    'supply_box', 'fleet_acceleration', 'swap_fee', 'transfer_fee',
    'plus_subscription', 'colony_abandon', 'planet_rename',
    'alliance_rename', 'alliance_creation', 'lottery_fee',
    'p2p_fee', 'other'
  ]));

-- =====================================================================
-- 2) p2p_release_order — copia exacta + record_admin_revenue()
-- =====================================================================
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

  IF v_offer.side = 'sell' THEN
    IF v_order.seller_id <> v_user_id THEN
      RAISE EXCEPTION 'Solo el vendedor puede liberar';
    END IF;
  ELSE
    IF v_order.buyer_id <> v_user_id THEN
      RAISE EXCEPTION 'Solo el comprador puede liberar en oferta BUY';
    END IF;
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

    -- [NUEVO] Registrar en admin_revenue para que aparezca en el dashboard
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
$$;

GRANT EXECUTE ON FUNCTION p2p_release_order(uuid) TO authenticated;

-- =====================================================================
-- 3) p2p_admin_resolve_dispute — parche al credit del admin (usa v_fee_distrib_currency)
-- =====================================================================
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

  v_fxu_usd_rate numeric;
  v_fee_distrib_currency text;
  v_fee_distrib_amount numeric;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  IF coalesce(auth.role(),'') <> 'service_role' THEN
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
    SELECT COALESCE(is_admin, false) INTO v_caller_is_admin FROM profiles WHERE id = v_caller_id;
    IF NOT v_caller_is_admin THEN RAISE EXCEPTION 'Solo admin o service_role puede resolver disputas'; END IF;
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;
  IF v_order.status <> 'disputed' THEN RAISE EXCEPTION 'La orden no esta en disputa'; END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = v_order.offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no existe'; END IF;

  SELECT * INTO v_dispute FROM p2p_disputes WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disputa no existe'; END IF;

  v_internal_fiat := upper(v_order.fiat_currency) IN ('FXU','USDT');

  IF p_release_to_buyer THEN
    v_fee_asset := COALESCE(v_order.fee_asset, 0);
    v_transfer_asset := GREATEST(0, v_order.asset_amount - v_fee_asset);

    IF v_internal_fiat THEN
      IF upper(v_order.fiat_currency) = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_order.fiat_amount WHERE id = v_order.seller_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_order.fiat_amount WHERE id = v_order.seller_id;
      END IF;
    END IF;

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

    IF v_order.asset = 'USDT' AND v_fee_asset > 0 THEN
      SELECT COALESCE(value::numeric, 0.0001) INTO v_fxu_usd_rate FROM game_settings WHERE key = 'fxu_usd_rate';
      IF v_fxu_usd_rate IS NULL OR v_fxu_usd_rate <= 0 THEN v_fxu_usd_rate := 0.0001; END IF;
      v_fee_distrib_currency := 'FXU';
      v_fee_distrib_amount := v_fee_asset / v_fxu_usd_rate;
    ELSE
      v_fee_distrib_currency := v_order.asset::text;
      v_fee_distrib_amount := v_fee_asset;
    END IF;

    v_admin_fee := round((v_fee_distrib_amount * v_admin_share / 100.0)::numeric, 8);
    v_ref_fee   := round((v_fee_distrib_amount * v_ref_share   / 100.0)::numeric, 8);
    v_pool_fee  := GREATEST(0, v_fee_distrib_amount - v_admin_fee - v_ref_fee);

    IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
      IF v_fee_distrib_currency = 'FXU' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_admin_fee WHERE id = v_admin_id;
      END IF;

      -- [NUEVO] Registrar en admin_revenue
      PERFORM record_admin_revenue(
        'p2p_fee',
        v_admin_fee,
        'P2P dispute resolved (order ' || substr(p_order_id::text, 1, 8) || ')',
        v_order.seller_id,
        NULL,
        v_fee_distrib_currency
      );
    END IF;

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

    IF v_pool_fee > 0 THEN
      IF v_fee_distrib_currency = 'FXU' THEN
        PERFORM contribute_to_jackpot(v_pool_fee, 'p2p_fee', v_order.seller_id);
      ELSIF v_admin_id IS NOT NULL THEN
        UPDATE profiles SET usdt_balance = usdt_balance + v_pool_fee WHERE id = v_admin_id;
      END IF;
    END IF;

    UPDATE p2p_offers
    SET locked_amount = GREATEST(0, locked_amount - v_order.asset_amount),
        status = CASE WHEN (available_amount <= 0 AND (locked_amount - v_order.asset_amount) <= 0) THEN 'completed' ELSE status END,
        updated_at = now()
    WHERE id = v_order.offer_id;

    UPDATE p2p_orders SET status = 'resolved', released_at = now(), updated_at = now() WHERE id = p_order_id;

    UPDATE p2p_disputes
    SET status = 'resolved_buyer', admin_id = v_caller_id, admin_notes = p_admin_notes, resolved_at = now()
    WHERE id = v_dispute.id;

    INSERT INTO p2p_reputation(user_id) VALUES (v_order.seller_id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE p2p_reputation SET lost_disputes = lost_disputes + 1, updated_at = now() WHERE user_id = v_order.seller_id;
  ELSE
    UPDATE p2p_offers
    SET available_amount = available_amount + v_order.asset_amount, updated_at = now()
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
      'admin_fee', v_admin_fee,
      'fee_distrib_currency', v_fee_distrib_currency,
      'fee_distrib_amount', v_fee_distrib_amount,
      'fxu_usd_rate', v_fxu_usd_rate
    )
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION p2p_admin_resolve_dispute(uuid, boolean, text) TO authenticated;

-- =====================================================================
-- 4) BACKFILL: registrar admin_fee histórico para órdenes released/resolved
-- =====================================================================
-- Solo inserta si no existe ya un admin_revenue con revenue_type='p2p_fee'
-- y related_tx_id coincidente (usamos order.id como related_tx_id para
-- deduplicar en el futuro).
DO $backfill$
DECLARE
  r RECORD;
  v_admin_share numeric;
  v_admin_fee   numeric;
  v_fxu_usd_rate numeric;
  v_distrib_currency text;
  v_distrib_amount numeric;
  v_inserted integer := 0;
  v_skipped  integer := 0;
BEGIN
  SELECT COALESCE(value::numeric,50) INTO v_admin_share FROM game_settings WHERE key='p2p_fee_admin_share';
  SELECT COALESCE(value::numeric, 0.0001) INTO v_fxu_usd_rate FROM game_settings WHERE key='fxu_usd_rate';
  IF v_fxu_usd_rate IS NULL OR v_fxu_usd_rate <= 0 THEN v_fxu_usd_rate := 0.0001; END IF;

  FOR r IN
    SELECT o.id, o.seller_id, o.asset, o.fee_asset, o.status, o.released_at, o.updated_at
    FROM p2p_orders o
    WHERE o.status IN ('released','resolved')
      AND COALESCE(o.fee_asset, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM admin_revenue ar
        WHERE ar.revenue_type = 'p2p_fee' AND ar.related_tx_id = o.id
      )
  LOOP
    -- Determinar moneda de distribucion
    IF r.asset = 'USDT' AND r.status = 'resolved' THEN
      -- Disputa resuelta -> distribuye en FXU
      v_distrib_currency := 'FXU';
      v_distrib_amount   := r.fee_asset / v_fxu_usd_rate;
    ELSE
      v_distrib_currency := r.asset::text;
      v_distrib_amount   := r.fee_asset;
    END IF;

    v_admin_fee := round((v_distrib_amount * v_admin_share / 100.0)::numeric, 8);

    IF v_admin_fee > 0 THEN
      INSERT INTO admin_revenue (revenue_type, amount, currency, description, related_user_id, related_tx_id, created_at)
      VALUES (
        'p2p_fee',
        v_admin_fee,
        v_distrib_currency,
        'P2P backfill (order ' || substr(r.id::text,1,8) || ', ' || r.status || ')',
        r.seller_id,
        r.id,
        COALESCE(r.released_at, r.updated_at, NOW())
      );
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'P2P fee backfill: inserted=% skipped=%', v_inserted, v_skipped;
END;
$backfill$;

COMMENT ON CONSTRAINT admin_revenue_revenue_type_check ON admin_revenue IS
'Lista de revenue_types permitidos; p2p_fee añadido para tracking del mercado P2P.';
