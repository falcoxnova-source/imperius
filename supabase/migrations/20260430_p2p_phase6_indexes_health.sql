-- =====================================================================
-- P2P Fase 6 — Escala, Seguridad y Métricas
-- =====================================================================
-- 1) Índices adicionales para dashboards y filtros rápidos.
-- 2) RPC get_p2p_health_metrics(): tasa de disputa, tiempo medio resolución,
--    top sellers por volumen.
-- =====================================================================

-- 1) Índices -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_p2p_orders_status_created
  ON p2p_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_p2p_orders_released_at
  ON p2p_orders (released_at DESC) WHERE released_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_p2p_disputes_opened_at
  ON p2p_disputes (opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_p2p_disputes_status_open
  ON p2p_disputes (opened_at DESC) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_p2p_audit_actor
  ON p2p_audit_log (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_revenue_p2p_fee
  ON admin_revenue (created_at DESC) WHERE revenue_type = 'p2p_fee';

-- 2) get_p2p_health_metrics() -------------------------------------------
-- Resumen operativo para ampliar el Dashboard Financiero (pestaña P2P).
CREATE OR REPLACE FUNCTION get_p2p_health_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_orders int := 0;
  v_disputed int := 0;
  v_resolved int := 0;
  v_open_disputes int := 0;
  v_avg_resolution_hours numeric := 0;
  v_dispute_rate_pct numeric := 0;
  v_banned_users int := 0;
  v_top_sellers jsonb;
  v_sla_breached int := 0;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'Solo admin puede consultar métricas P2P';
    END IF;
  END IF;

  SELECT count(*) INTO v_total_orders FROM p2p_orders;
  SELECT count(*) INTO v_disputed     FROM p2p_orders WHERE status IN ('disputed','resolved');
  SELECT count(*) INTO v_resolved     FROM p2p_disputes WHERE status IN ('resolved_buyer','resolved_seller');
  SELECT count(*) INTO v_open_disputes FROM p2p_disputes WHERE status = 'open';
  SELECT count(*) INTO v_sla_breached  FROM p2p_disputes
    WHERE status = 'open' AND opened_at < now() - interval '24 hours';

  SELECT count(*) INTO v_banned_users FROM p2p_reputation WHERE is_banned = true;

  SELECT COALESCE(
           round((EXTRACT(EPOCH FROM AVG(resolved_at - opened_at))/3600)::numeric, 2),
           0)
    INTO v_avg_resolution_hours
    FROM p2p_disputes
   WHERE resolved_at IS NOT NULL;

  IF v_total_orders > 0 THEN
    v_dispute_rate_pct := round((v_disputed::numeric * 100 / v_total_orders)::numeric, 2);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_top_sellers
  FROM (
    SELECT
      o.seller_id,
      p.username,
      count(*) AS orders_count,
      round(sum(
        CASE WHEN o.asset = 'FXU' THEN o.asset_amount
             ELSE o.asset_amount * 10000 END
      )::numeric, 2) AS volume_fxu_eq
    FROM p2p_orders o
    LEFT JOIN profiles p ON p.id = o.seller_id
    WHERE o.status IN ('released','resolved')
      AND o.released_at >= now() - interval '30 days'
    GROUP BY o.seller_id, p.username
    ORDER BY volume_fxu_eq DESC NULLS LAST
    LIMIT 5
  ) x;

  RETURN jsonb_build_object(
    'total_orders',         v_total_orders,
    'disputed_orders',      v_disputed,
    'resolved_disputes',    v_resolved,
    'open_disputes',        v_open_disputes,
    'sla_breached_disputes', v_sla_breached,
    'banned_users',         v_banned_users,
    'avg_resolution_hours', v_avg_resolution_hours,
    'dispute_rate_pct',     v_dispute_rate_pct,
    'top_sellers_30d',      v_top_sellers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_p2p_health_metrics() TO authenticated;

COMMENT ON FUNCTION get_p2p_health_metrics() IS
'Fase 6: métricas de salud operativa del mercado P2P.';
