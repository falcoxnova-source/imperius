-- =====================================================================
-- P2P Disputes Admin v2:
-- 1) p2p_admin_resolve_dispute: permite admins (profiles.is_admin=true)
--    además de service_role.
-- 2) p2p_admin_list_disputes(): listado para el panel admin.
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
        'market_referral', lower(v_order.asset::text), CEIL(v_ref_fee)::bigint, v_ref_fee, now()
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
    SET status = 'resolved_buyer', admin_id = v_caller_id, admin_notes = p_admin_notes, resolved_at = now()
    WHERE id = v_dispute.id;

    INSERT INTO p2p_reputation(user_id) VALUES (v_order.seller_id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE p2p_reputation SET lost_disputes = lost_disputes + 1, updated_at = now() WHERE user_id = v_order.seller_id;
  ELSE
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
    jsonb_build_object('release_to_buyer', p_release_to_buyer, 'offer_side', v_offer.side, 'internal_fiat', v_internal_fiat, 'resolved_by', v_caller_id)
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION p2p_admin_resolve_dispute(uuid, boolean, text) TO authenticated;


CREATE OR REPLACE FUNCTION p2p_admin_list_disputes(p_status text DEFAULT 'open')
RETURNS TABLE(
  dispute_id uuid,
  order_id uuid,
  offer_id uuid,
  dispute_status text,
  reason text,
  admin_notes text,
  opened_by uuid,
  opened_at timestamptz,
  resolved_at timestamptz,
  asset text,
  asset_amount numeric,
  fiat_currency text,
  fiat_amount numeric,
  seller_id uuid,
  seller_name text,
  buyer_id uuid,
  buyer_name text,
  order_status text,
  order_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT COALESCE(is_admin, false) INTO v_is_admin FROM profiles WHERE id = v_caller_id;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Solo admin'; END IF;

  RETURN QUERY
  SELECT
    d.id,
    o.id,
    o.offer_id,
    d.status::text,
    d.reason,
    d.admin_notes,
    d.opened_by,
    d.opened_at,
    d.resolved_at,
    o.asset::text,
    o.asset_amount,
    o.fiat_currency,
    o.fiat_amount,
    o.seller_id,
    ps.username,
    o.buyer_id,
    pb.username,
    o.status::text,
    o.created_at
  FROM p2p_disputes d
  JOIN p2p_orders o ON o.id = d.order_id
  LEFT JOIN profiles ps ON ps.id = o.seller_id
  LEFT JOIN profiles pb ON pb.id = o.buyer_id
  WHERE (p_status IS NULL OR p_status = 'all' OR d.status = p_status)
  ORDER BY d.opened_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION p2p_admin_list_disputes(text) TO authenticated;
