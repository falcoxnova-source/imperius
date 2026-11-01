-- =====================================================================
-- P2P Marketplace: Estadísticas agregadas para Dashboard Financiero
-- =====================================================================
-- Expone get_p2p_economy_stats() con:
--   · Volumen (FXU/USDT) all-time, 24h, 7d, 30d
--   · Fees cobrados (FXU/USDT) all-time, 30d
--   · Conteo de órdenes por estado
--   · Conteo de disputas por estado
--   · Ofertas activas por lado (buy/sell) y por asset
--   · Traders únicos (con al menos 1 orden liberada) 30d / all-time
-- =====================================================================

CREATE OR REPLACE FUNCTION get_p2p_economy_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;

  -- Volumen (órdenes released)
  v_vol_fxu_total     numeric := 0;
  v_vol_usdt_total    numeric := 0;
  v_vol_fxu_24h       numeric := 0;
  v_vol_usdt_24h      numeric := 0;
  v_vol_fxu_7d        numeric := 0;
  v_vol_usdt_7d       numeric := 0;
  v_vol_fxu_30d       numeric := 0;
  v_vol_usdt_30d      numeric := 0;

  -- Fees
  v_fees_fxu_total    numeric := 0;
  v_fees_usdt_total   numeric := 0;
  v_fees_fxu_30d      numeric := 0;
  v_fees_usdt_30d     numeric := 0;

  -- Conteos
  v_orders_by_status      jsonb := '{}'::jsonb;
  v_disputes_by_status    jsonb := '{}'::jsonb;

  v_orders_total      integer := 0;
  v_orders_released   integer := 0;
  v_orders_disputed   integer := 0;
  v_orders_cancelled  integer := 0;
  v_orders_pending    integer := 0;
  v_orders_paid       integer := 0;

  v_disputes_open        integer := 0;
  v_disputes_investig    integer := 0;
  v_disputes_resolved    integer := 0;

  -- Ofertas activas
  v_offers_active        integer := 0;
  v_offers_sell_fxu      integer := 0;
  v_offers_sell_usdt     integer := 0;
  v_offers_buy_fxu       integer := 0;
  v_offers_buy_usdt      integer := 0;

  -- Traders únicos
  v_traders_total        integer := 0;
  v_traders_30d          integer := 0;

  -- Jackpot contribuido desde P2P
  v_jackpot_from_p2p     numeric := 0;
BEGIN
  -- Solo admins
  SELECT COALESCE(is_admin, false) INTO v_is_admin
  FROM profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;

  -- =============================================================
  -- Volumen all-time (órdenes liberadas)
  -- =============================================================
  SELECT
    COALESCE(SUM(asset_amount) FILTER (WHERE asset = 'FXU'), 0),
    COALESCE(SUM(asset_amount) FILTER (WHERE asset = 'USDT'), 0),
    COALESCE(SUM(fee_asset)    FILTER (WHERE asset = 'FXU'), 0),
    COALESCE(SUM(fee_asset)    FILTER (WHERE asset = 'USDT'), 0)
  INTO v_vol_fxu_total, v_vol_usdt_total, v_fees_fxu_total, v_fees_usdt_total
  FROM p2p_orders
  WHERE status IN ('released','resolved');

  -- Volumen 24h / 7d / 30d
  SELECT
    COALESCE(SUM(asset_amount) FILTER (WHERE asset='FXU'  AND released_at >= NOW() - INTERVAL '1 day'),   0),
    COALESCE(SUM(asset_amount) FILTER (WHERE asset='USDT' AND released_at >= NOW() - INTERVAL '1 day'),   0),
    COALESCE(SUM(asset_amount) FILTER (WHERE asset='FXU'  AND released_at >= NOW() - INTERVAL '7 days'),  0),
    COALESCE(SUM(asset_amount) FILTER (WHERE asset='USDT' AND released_at >= NOW() - INTERVAL '7 days'),  0),
    COALESCE(SUM(asset_amount) FILTER (WHERE asset='FXU'  AND released_at >= NOW() - INTERVAL '30 days'), 0),
    COALESCE(SUM(asset_amount) FILTER (WHERE asset='USDT' AND released_at >= NOW() - INTERVAL '30 days'), 0),
    COALESCE(SUM(fee_asset)    FILTER (WHERE asset='FXU'  AND released_at >= NOW() - INTERVAL '30 days'), 0),
    COALESCE(SUM(fee_asset)    FILTER (WHERE asset='USDT' AND released_at >= NOW() - INTERVAL '30 days'), 0)
  INTO
    v_vol_fxu_24h, v_vol_usdt_24h,
    v_vol_fxu_7d,  v_vol_usdt_7d,
    v_vol_fxu_30d, v_vol_usdt_30d,
    v_fees_fxu_30d, v_fees_usdt_30d
  FROM p2p_orders
  WHERE status IN ('released','resolved') AND released_at IS NOT NULL;

  -- =============================================================
  -- Conteo de órdenes por estado
  -- =============================================================
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'released'),
    COUNT(*) FILTER (WHERE status = 'disputed'),
    COUNT(*) FILTER (WHERE status IN ('cancelled','expired')),
    COUNT(*) FILTER (WHERE status = 'pending_payment'),
    COUNT(*) FILTER (WHERE status = 'paid')
  INTO
    v_orders_total,
    v_orders_released,
    v_orders_disputed,
    v_orders_cancelled,
    v_orders_pending,
    v_orders_paid
  FROM p2p_orders;

  SELECT jsonb_object_agg(status, cnt) INTO v_orders_by_status FROM (
    SELECT status, COUNT(*)::int AS cnt
    FROM p2p_orders
    GROUP BY status
  ) t;

  -- =============================================================
  -- Conteo de disputas por estado
  -- =============================================================
  SELECT
    COUNT(*) FILTER (WHERE status = 'open'),
    COUNT(*) FILTER (WHERE status = 'investigating'),
    COUNT(*) FILTER (WHERE status IN ('resolved_buyer','resolved_seller'))
  INTO v_disputes_open, v_disputes_investig, v_disputes_resolved
  FROM p2p_disputes;

  SELECT jsonb_object_agg(status, cnt) INTO v_disputes_by_status FROM (
    SELECT status, COUNT(*)::int AS cnt
    FROM p2p_disputes
    GROUP BY status
  ) t;

  -- =============================================================
  -- Ofertas activas
  -- =============================================================
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE side = 'sell' AND asset = 'FXU'),
    COUNT(*) FILTER (WHERE side = 'sell' AND asset = 'USDT'),
    COUNT(*) FILTER (WHERE side = 'buy'  AND asset = 'FXU'),
    COUNT(*) FILTER (WHERE side = 'buy'  AND asset = 'USDT')
  INTO
    v_offers_active,
    v_offers_sell_fxu, v_offers_sell_usdt,
    v_offers_buy_fxu,  v_offers_buy_usdt
  FROM p2p_offers
  WHERE status = 'active';

  -- =============================================================
  -- Traders únicos (con al menos 1 orden liberada)
  -- =============================================================
  SELECT COUNT(DISTINCT uid)
  INTO v_traders_total
  FROM (
    SELECT seller_id AS uid FROM p2p_orders WHERE status IN ('released','resolved')
    UNION
    SELECT buyer_id  AS uid FROM p2p_orders WHERE status IN ('released','resolved')
  ) t;

  SELECT COUNT(DISTINCT uid)
  INTO v_traders_30d
  FROM (
    SELECT seller_id AS uid FROM p2p_orders
      WHERE status IN ('released','resolved') AND released_at >= NOW() - INTERVAL '30 days'
    UNION
    SELECT buyer_id  AS uid FROM p2p_orders
      WHERE status IN ('released','resolved') AND released_at >= NOW() - INTERVAL '30 days'
  ) t;

  -- =============================================================
  -- Contribución al jackpot desde P2P (tabla admin_revenue / jackpot_contributions si existen)
  -- =============================================================
  BEGIN
    EXECUTE $q$
      SELECT COALESCE(SUM(amount), 0)
      FROM jackpot_contributions
      WHERE source = 'p2p_fee'
    $q$ INTO v_jackpot_from_p2p;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_jackpot_from_p2p := 0;
  END;

  RETURN jsonb_build_object(
    'success', true,
    -- Volumen
    'volume_fxu_total',   v_vol_fxu_total,
    'volume_usdt_total',  v_vol_usdt_total,
    'volume_fxu_24h',     v_vol_fxu_24h,
    'volume_usdt_24h',    v_vol_usdt_24h,
    'volume_fxu_7d',      v_vol_fxu_7d,
    'volume_usdt_7d',     v_vol_usdt_7d,
    'volume_fxu_30d',     v_vol_fxu_30d,
    'volume_usdt_30d',    v_vol_usdt_30d,
    -- Fees
    'fees_fxu_total',     v_fees_fxu_total,
    'fees_usdt_total',    v_fees_usdt_total,
    'fees_fxu_30d',       v_fees_fxu_30d,
    'fees_usdt_30d',      v_fees_usdt_30d,
    -- Órdenes
    'orders_total',       v_orders_total,
    'orders_released',    v_orders_released,
    'orders_disputed',    v_orders_disputed,
    'orders_cancelled',   v_orders_cancelled,
    'orders_pending',     v_orders_pending,
    'orders_paid',        v_orders_paid,
    'orders_by_status',   COALESCE(v_orders_by_status, '{}'::jsonb),
    -- Disputas
    'disputes_open',         v_disputes_open,
    'disputes_investigating',v_disputes_investig,
    'disputes_resolved',     v_disputes_resolved,
    'disputes_by_status',    COALESCE(v_disputes_by_status, '{}'::jsonb),
    -- Ofertas
    'offers_active',      v_offers_active,
    'offers_sell_fxu',    v_offers_sell_fxu,
    'offers_sell_usdt',   v_offers_sell_usdt,
    'offers_buy_fxu',     v_offers_buy_fxu,
    'offers_buy_usdt',    v_offers_buy_usdt,
    -- Traders
    'traders_total',      v_traders_total,
    'traders_30d',        v_traders_30d,
    -- Jackpot
    'jackpot_from_p2p',   v_jackpot_from_p2p,
    'generated_at',       NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_p2p_economy_stats() TO authenticated;

COMMENT ON FUNCTION get_p2p_economy_stats() IS
'Devuelve métricas agregadas del mercado P2P para el Dashboard Financiero del admin.';
