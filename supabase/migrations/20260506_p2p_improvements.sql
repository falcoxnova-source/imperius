-- =====================================================================
-- P2P Improvements (non-breaking)
--  1) Peg USDT→FXU parametrizable desde game_settings (p2p_usdt_fxu_peg)
--     -> p2p_enforce_order_limits lo usa en vez del hardcoded 10000
--  2) p2p_reputation.abandoned_orders  (contador de órdenes que el user
--     deja morir como cancelled/expired)
--     -> trigger AFTER UPDATE en p2p_orders
--  3) get_p2p_reputations_for_users devuelve también rating_avg,
--     rating_count y abandoned_orders (el cliente ya espera esos campos).
--
-- No cambia NINGÚN flujo de dinero ni los estados. Solo añade métricas
-- y parametriza una constante antifraude.
-- =====================================================================

-- 1) Setting peg -------------------------------------------------------
INSERT INTO game_settings (key, value, description)
VALUES (
  'p2p_usdt_fxu_peg',
  '10000',
  'Cuántos FXU equivalen a 1 USDT para cálculos antifraude de volumen diario P2P.'
)
ON CONFLICT (key) DO NOTHING;

-- Extender p2p_enforce_order_limits para leer el peg desde settings.
-- (Copia fiel de la versión de Fase 7, solo cambia el literal 10000)
CREATE OR REPLACE FUNCTION p2p_enforce_order_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_open        int;
  v_max_daily_fxu   numeric;
  v_peg             numeric;
  v_seller_open     int;
  v_buyer_open      int;
  v_seller_banned   boolean;
  v_buyer_banned    boolean;
  v_new_vol_fxu     numeric;
  v_seller_vol_24h  numeric;
  v_buyer_vol_24h   numeric;
BEGIN
  SELECT COALESCE(value::int, 3) INTO v_max_open
    FROM game_settings WHERE key = 'p2p_max_open_orders_per_user';

  SELECT COALESCE(value::numeric, 1000000) INTO v_max_daily_fxu
    FROM game_settings WHERE key = 'p2p_max_daily_volume_fxu';

  SELECT COALESCE(value::numeric, 10000) INTO v_peg
    FROM game_settings WHERE key = 'p2p_usdt_fxu_peg';
  IF v_peg IS NULL OR v_peg <= 0 THEN
    v_peg := 10000;
  END IF;

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

  v_new_vol_fxu := CASE WHEN NEW.asset = 'FXU'
                        THEN NEW.asset_amount
                        ELSE NEW.asset_amount * v_peg
                   END;

  IF v_max_daily_fxu > 0 THEN
    SELECT COALESCE(SUM(
             CASE WHEN asset = 'FXU' THEN asset_amount
                  ELSE asset_amount * v_peg END
           ), 0)
      INTO v_seller_vol_24h
      FROM p2p_orders
     WHERE seller_id = NEW.seller_id
       AND created_at >= now() - interval '24 hours'
       AND status IN ('pending_payment','paid','released','disputed','resolved');

    IF (v_seller_vol_24h + v_new_vol_fxu) > v_max_daily_fxu THEN
      RAISE EXCEPTION 'El vendedor supera el volumen máximo diario P2P (% + % > % FXU-eq).',
        round(v_seller_vol_24h,2), round(v_new_vol_fxu,2), v_max_daily_fxu;
    END IF;

    SELECT COALESCE(SUM(
             CASE WHEN asset = 'FXU' THEN asset_amount
                  ELSE asset_amount * v_peg END
           ), 0)
      INTO v_buyer_vol_24h
      FROM p2p_orders
     WHERE buyer_id = NEW.buyer_id
       AND created_at >= now() - interval '24 hours'
       AND status IN ('pending_payment','paid','released','disputed','resolved');

    IF (v_buyer_vol_24h + v_new_vol_fxu) > v_max_daily_fxu THEN
      RAISE EXCEPTION 'Supera tu volumen máximo diario P2P (% + % > % FXU-eq). Intenta más tarde.',
        round(v_buyer_vol_24h,2), round(v_new_vol_fxu,2), v_max_daily_fxu;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION p2p_enforce_order_limits() IS
'Fase 7 + peg parametrizable: bloquea usuarios baneados, limita órdenes abiertas y volumen diario FXU-eq usando game_settings.p2p_usdt_fxu_peg.';


-- 2) abandoned_orders --------------------------------------------------
ALTER TABLE p2p_reputation
  ADD COLUMN IF NOT EXISTS abandoned_orders int NOT NULL DEFAULT 0;

-- Trigger: cuenta como "abandono" cada vez que una orden pasa a cancelled
-- o expired desde un estado activo. Se imputa al BUYER (único autorizado a
-- cancelar tras el fix de expire-exploit). El seller no se penaliza aquí.
CREATE OR REPLACE FUNCTION p2p_track_abandoned_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('cancelled','expired')
     AND OLD.status = 'pending_payment' THEN

    INSERT INTO p2p_reputation(user_id) VALUES (NEW.buyer_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE p2p_reputation
       SET abandoned_orders = abandoned_orders + 1,
           updated_at = now()
     WHERE user_id = NEW.buyer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p2p_track_abandoned_order ON p2p_orders;
CREATE TRIGGER trg_p2p_track_abandoned_order
  AFTER UPDATE ON p2p_orders
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION p2p_track_abandoned_order();

COMMENT ON FUNCTION p2p_track_abandoned_order() IS
'Incrementa p2p_reputation.abandoned_orders del buyer cuando una orden pending_payment pasa a cancelled/expired.';


-- 3) RPC: devolver rating y abandono para el listado de ofertas -------
DROP FUNCTION IF EXISTS get_p2p_reputations_for_users(uuid[]);
CREATE OR REPLACE FUNCTION get_p2p_reputations_for_users(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  total_orders int,
  completed_orders int,
  abandoned_orders int,
  success_rate numeric,
  rating_avg numeric,
  rating_count int,
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
    COALESCE(r.abandoned_orders, 0),
    CASE
      WHEN COALESCE(r.completed_orders,0) + COALESCE(r.abandoned_orders,0) + COALESCE(r.lost_disputes,0) > 0
        THEN round(
               (r.completed_orders::numeric * 100
                / (r.completed_orders + COALESCE(r.abandoned_orders,0) + COALESCE(r.lost_disputes,0)))
             ::numeric, 1)
      ELSE 0
    END,
    CASE WHEN COALESCE(r.rating_count,0) > 0
         THEN round((r.rating_sum::numeric / r.rating_count)::numeric, 2)
         ELSE 0 END,
    COALESCE(r.rating_count, 0),
    COALESCE(r.is_banned, false)
  FROM profiles p
  LEFT JOIN p2p_reputation r ON r.user_id = p.id
  WHERE p.id = ANY(p_user_ids);
$$;

GRANT EXECUTE ON FUNCTION get_p2p_reputations_for_users(uuid[]) TO authenticated;

COMMENT ON FUNCTION get_p2p_reputations_for_users(uuid[]) IS
'Batch reputación pública: success_rate = completed / (completed + abandoned + lost_disputes). Incluye rating promedio y abandonos.';
