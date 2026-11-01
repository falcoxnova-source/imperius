-- =====================================================================
-- P2P Fase 5 — Operación / Antifraude
-- =====================================================================
-- 1) Settings nuevos (límites):
--      p2p_max_open_orders_per_user    (default 3)
--      p2p_max_daily_volume_fxu        (default 1000000 FXU / 24h, interno)
--      p2p_autoban_lost_disputes_7d    (default 3)
-- 2) Trigger BEFORE INSERT en p2p_orders: rechaza si seller/buyer está baneado
--    o excede máximo de órdenes abiertas.
-- 3) Trigger AFTER UPDATE en p2p_disputes: si dispute se resuelve contra un
--    user, contabiliza disputas perdidas en 7d y auto-banea.
-- 4) RPC get_p2p_admin_disputes(): lista para panel admin.
-- 5) RPC get_p2p_user_reputation(uuid): reputación pública.
-- =====================================================================

-- 1) Settings -------------------------------------------------------------
INSERT INTO game_settings (key, value, description)
VALUES
  ('p2p_max_open_orders_per_user', '3',      'Máximo de órdenes abiertas (pending_payment/paid/disputed) por usuario'),
  ('p2p_max_daily_volume_fxu',    '1000000', 'Máximo volumen P2P (FXU equivalente) por usuario en últimas 24h'),
  ('p2p_autoban_lost_disputes_7d','3',       'Nº de disputas perdidas en 7d que activan auto-ban P2P')
ON CONFLICT (key) DO NOTHING;

-- 2) Trigger anti-fraude en p2p_orders -----------------------------------
CREATE OR REPLACE FUNCTION p2p_enforce_order_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_open        int;
  v_seller_open     int;
  v_buyer_open      int;
  v_seller_banned   boolean;
  v_buyer_banned    boolean;
BEGIN
  SELECT COALESCE(value::int, 3) INTO v_max_open
    FROM game_settings WHERE key = 'p2p_max_open_orders_per_user';

  SELECT COALESCE(is_banned, false) INTO v_seller_banned FROM p2p_reputation WHERE user_id = NEW.seller_id;
  SELECT COALESCE(is_banned, false) INTO v_buyer_banned  FROM p2p_reputation WHERE user_id = NEW.buyer_id;

  IF v_seller_banned THEN RAISE EXCEPTION 'Vendedor bloqueado del P2P por historial de disputas.'; END IF;
  IF v_buyer_banned  THEN RAISE EXCEPTION 'Comprador bloqueado del P2P por historial de disputas.'; END IF;

  SELECT count(*) INTO v_seller_open
    FROM p2p_orders
   WHERE seller_id = NEW.seller_id
     AND status IN ('pending_payment','paid','disputed');
  IF v_seller_open >= v_max_open THEN
    RAISE EXCEPTION 'El vendedor ya tiene % órdenes abiertas (máx %). Cierra alguna antes de crear otra.', v_seller_open, v_max_open;
  END IF;

  SELECT count(*) INTO v_buyer_open
    FROM p2p_orders
   WHERE buyer_id = NEW.buyer_id
     AND status IN ('pending_payment','paid','disputed');
  IF v_buyer_open >= v_max_open THEN
    RAISE EXCEPTION 'Ya tienes % órdenes abiertas (máx %). Cierra alguna antes de tomar otra.', v_buyer_open, v_max_open;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p2p_enforce_order_limits ON p2p_orders;
CREATE TRIGGER trg_p2p_enforce_order_limits
  BEFORE INSERT ON p2p_orders
  FOR EACH ROW EXECUTE FUNCTION p2p_enforce_order_limits();

-- 3) Auto-ban tras N disputas perdidas en 7d -----------------------------
CREATE OR REPLACE FUNCTION p2p_autoban_on_dispute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loser uuid;
  v_threshold int;
  v_count int;
  v_order p2p_orders%ROWTYPE;
BEGIN
  -- Solo actuar cuando la disputa pasa a resuelta
  IF NEW.status NOT IN ('resolved_buyer','resolved_seller') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- resolved_buyer => seller pierde; resolved_seller => buyer pierde
  IF NEW.status = 'resolved_buyer' THEN
    v_loser := v_order.seller_id;
  ELSE
    v_loser := v_order.buyer_id;
  END IF;

  SELECT COALESCE(value::int, 3) INTO v_threshold
    FROM game_settings WHERE key = 'p2p_autoban_lost_disputes_7d';

  -- Contar disputas perdidas del v_loser en 7d
  SELECT count(*) INTO v_count
    FROM p2p_disputes d
    JOIN p2p_orders   o ON o.id = d.order_id
   WHERE d.resolved_at >= now() - interval '7 days'
     AND (
           (d.status = 'resolved_buyer'  AND o.seller_id = v_loser) OR
           (d.status = 'resolved_seller' AND o.buyer_id  = v_loser)
         );

  IF v_count >= v_threshold THEN
    INSERT INTO p2p_reputation(user_id, is_banned, updated_at)
    VALUES (v_loser, true, now())
    ON CONFLICT (user_id) DO UPDATE SET is_banned = true, updated_at = now();

    INSERT INTO p2p_audit_log(order_id, action, actor_id, meta)
    VALUES (
      NEW.order_id,
      'user_autobanned',
      v_loser,
      jsonb_build_object('lost_disputes_7d', v_count, 'threshold', v_threshold)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p2p_autoban_on_dispute ON p2p_disputes;
CREATE TRIGGER trg_p2p_autoban_on_dispute
  AFTER UPDATE ON p2p_disputes
  FOR EACH ROW EXECUTE FUNCTION p2p_autoban_on_dispute();

-- 4) RPC get_p2p_admin_disputes() ----------------------------------------
CREATE OR REPLACE FUNCTION get_p2p_admin_disputes(p_status text DEFAULT NULL)
RETURNS TABLE (
  dispute_id      uuid,
  order_id        uuid,
  status          text,
  reason          text,
  evidence        jsonb,
  opened_by       uuid,
  opened_by_name  text,
  opened_at       timestamptz,
  resolved_at     timestamptz,
  admin_id        uuid,
  admin_notes     text,
  order_status    text,
  asset           text,
  asset_amount    numeric,
  fiat_currency   text,
  fiat_amount     numeric,
  fee_asset       numeric,
  seller_id       uuid,
  seller_name     text,
  buyer_id        uuid,
  buyer_name      text,
  payment_deadline timestamptz,
  paid_at         timestamptz,
  age_hours       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'Solo admin puede consultar disputas';
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      d.id,
      d.order_id,
      d.status,
      d.reason,
      d.evidence,
      d.opened_by,
      pb.username,
      d.opened_at,
      d.resolved_at,
      d.admin_id,
      d.admin_notes,
      o.status,
      o.asset,
      o.asset_amount,
      o.fiat_currency,
      o.fiat_amount,
      o.fee_asset,
      o.seller_id,
      ps.username,
      o.buyer_id,
      pbu.username,
      o.payment_deadline,
      o.paid_at,
      EXTRACT(EPOCH FROM (COALESCE(d.resolved_at, now()) - d.opened_at)) / 3600.0
    FROM p2p_disputes d
    JOIN p2p_orders   o  ON o.id  = d.order_id
    LEFT JOIN profiles pb  ON pb.id  = d.opened_by
    LEFT JOIN profiles ps  ON ps.id  = o.seller_id
    LEFT JOIN profiles pbu ON pbu.id = o.buyer_id
   WHERE (p_status IS NULL OR d.status = p_status)
   ORDER BY (d.status = 'open') DESC, d.opened_at DESC
   LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION get_p2p_admin_disputes(text) TO authenticated;

-- 5) RPC get_p2p_user_reputation() ---------------------------------------
CREATE OR REPLACE FUNCTION get_p2p_user_reputation(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  username text,
  total_orders int,
  completed_orders int,
  cancelled_orders int,
  disputed_orders int,
  lost_disputes int,
  success_rate numeric,
  avg_release_minutes numeric,
  rating_avg numeric,
  rating_count int,
  is_banned boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id,
      p.username,
      COALESCE(r.total_orders, 0),
      COALESCE(r.completed_orders, 0),
      COALESCE(r.cancelled_orders, 0),
      COALESCE(r.disputed_orders, 0),
      COALESCE(r.lost_disputes, 0),
      CASE WHEN COALESCE(r.total_orders,0) > 0
           THEN round((r.completed_orders::numeric * 100 / r.total_orders)::numeric, 1)
           ELSE 0 END,
      CASE WHEN COALESCE(r.avg_release_seconds,0) > 0
           THEN round((r.avg_release_seconds::numeric / 60)::numeric, 1)
           ELSE 0 END,
      CASE WHEN COALESCE(r.rating_count,0) > 0
           THEN round((r.rating_sum::numeric / r.rating_count)::numeric, 2)
           ELSE 0 END,
      COALESCE(r.rating_count, 0),
      COALESCE(r.is_banned, false)
    FROM profiles p
    LEFT JOIN p2p_reputation r ON r.user_id = p.id
    WHERE p.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_p2p_user_reputation(uuid) TO authenticated;

-- 6) RPC batch: reputación de varios vendedores para la lista de ofertas
CREATE OR REPLACE FUNCTION get_p2p_reputations_for_users(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  total_orders int,
  completed_orders int,
  success_rate numeric,
  is_banned boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(r.total_orders, 0),
    COALESCE(r.completed_orders, 0),
    CASE WHEN COALESCE(r.total_orders,0) > 0
         THEN round((r.completed_orders::numeric * 100 / r.total_orders)::numeric, 1)
         ELSE 0 END,
    COALESCE(r.is_banned, false)
  FROM profiles p
  LEFT JOIN p2p_reputation r ON r.user_id = p.id
  WHERE p.id = ANY(p_user_ids);
$$;

GRANT EXECUTE ON FUNCTION get_p2p_reputations_for_users(uuid[]) TO authenticated;

COMMENT ON FUNCTION p2p_enforce_order_limits() IS
'Fase 5: bloquea usuarios baneados y limita órdenes abiertas simultáneas.';
COMMENT ON FUNCTION p2p_autoban_on_dispute() IS
'Fase 5: auto-banea a quien pierde ≥ p2p_autoban_lost_disputes_7d disputas en 7 días.';
