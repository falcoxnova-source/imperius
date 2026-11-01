-- =====================================================================
-- P2P Fase 7 — Hardening de antifraude (volumen diario + disputa rate-limit)
-- =====================================================================
-- 1) Nueva setting: p2p_dispute_cooldown_minutes (default 2).
-- 2) Extiende p2p_enforce_order_limits: además del máximo de órdenes
--    abiertas, valida el volumen FXU-equivalente acumulado del usuario
--    (buyer+seller) en las últimas 24h contra p2p_max_daily_volume_fxu.
-- 3) Reescribe p2p_open_dispute: exige que el pago esté marcado (o el
--    deadline vencido) y respeta un cooldown configurable desde paid_at,
--    y bloquea a usuarios baneados.
-- =====================================================================

-- 1) Settings -------------------------------------------------------------
INSERT INTO game_settings (key, value, description)
VALUES
  ('p2p_dispute_cooldown_minutes', '2',
   'Minutos mínimos tras marcar la orden como pagada antes de poder abrir disputa')
ON CONFLICT (key) DO NOTHING;

-- 2) Trigger extendido: órdenes abiertas + volumen diario --------------
CREATE OR REPLACE FUNCTION p2p_enforce_order_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_open        int;
  v_max_daily_fxu   numeric;
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

  -- Bans
  SELECT COALESCE(is_banned, false) INTO v_seller_banned FROM p2p_reputation WHERE user_id = NEW.seller_id;
  SELECT COALESCE(is_banned, false) INTO v_buyer_banned  FROM p2p_reputation WHERE user_id = NEW.buyer_id;

  IF v_seller_banned THEN RAISE EXCEPTION 'Vendedor bloqueado del P2P por historial de disputas.'; END IF;
  IF v_buyer_banned  THEN RAISE EXCEPTION 'Comprador bloqueado del P2P por historial de disputas.'; END IF;

  -- Máximo de órdenes abiertas simultáneas
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

  -- Volumen FXU-equivalente de la nueva orden
  v_new_vol_fxu := CASE WHEN NEW.asset = 'FXU'
                        THEN NEW.asset_amount
                        ELSE NEW.asset_amount * 10000
                   END;

  IF v_max_daily_fxu > 0 THEN
    -- Volumen del vendedor en las últimas 24h (cuenta órdenes que han movido valor)
    SELECT COALESCE(SUM(
             CASE WHEN asset = 'FXU' THEN asset_amount
                  ELSE asset_amount * 10000 END
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

    -- Volumen del comprador en las últimas 24h
    SELECT COALESCE(SUM(
             CASE WHEN asset = 'FXU' THEN asset_amount
                  ELSE asset_amount * 10000 END
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

-- Asegurar trigger (ya existe desde fase 5, pero lo re-creamos por idempotencia)
DROP TRIGGER IF EXISTS trg_p2p_enforce_order_limits ON p2p_orders;
CREATE TRIGGER trg_p2p_enforce_order_limits
  BEFORE INSERT ON p2p_orders
  FOR EACH ROW EXECUTE FUNCTION p2p_enforce_order_limits();

COMMENT ON FUNCTION p2p_enforce_order_limits() IS
'Fase 7: Rechaza INSERT si user está baneado, excede órdenes abiertas o volumen diario FXU-eq.';

-- 3) Dispute hardening ---------------------------------------------------
CREATE OR REPLACE FUNCTION p2p_open_dispute(
  p_order_id uuid,
  p_reason text,
  p_evidence jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order p2p_orders%ROWTYPE;
  v_dispute_id uuid;
  v_is_banned boolean;
  v_cooldown_min int;
  v_paid_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Usuarios baneados no pueden abrir disputas (anti-griefing)
  SELECT COALESCE(is_banned, false) INTO v_is_banned
    FROM p2p_reputation WHERE user_id = v_user_id;
  IF v_is_banned THEN
    RAISE EXCEPTION 'Estás bloqueado del P2P y no puedes abrir disputas.';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_user_id <> v_order.seller_id AND v_user_id <> v_order.buyer_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v_order.status NOT IN ('pending_payment','paid') THEN
    RAISE EXCEPTION 'No se puede abrir disputa en este estado';
  END IF;

  -- Si sigue en pending_payment, solo se permite disputa si el deadline ya venció
  IF v_order.status = 'pending_payment'
     AND v_order.payment_deadline IS NOT NULL
     AND v_order.payment_deadline > now() THEN
    RAISE EXCEPTION 'Aún no puedes disputar: el comprador tiene plazo hasta %.',
      to_char(v_order.payment_deadline, 'YYYY-MM-DD HH24:MI');
  END IF;

  -- Cooldown tras marcar como pagada (evita spam de disputas inmediatas)
  IF v_order.status = 'paid' THEN
    SELECT COALESCE(value::int, 2) INTO v_cooldown_min
      FROM game_settings WHERE key = 'p2p_dispute_cooldown_minutes';
    v_paid_at := v_order.paid_at;
    IF v_paid_at IS NOT NULL
       AND v_paid_at > now() - make_interval(mins => v_cooldown_min) THEN
      RAISE EXCEPTION 'Debes esperar al menos % minutos tras marcar la orden como pagada antes de abrir una disputa.', v_cooldown_min;
    END IF;
  END IF;

  UPDATE p2p_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO p2p_disputes(order_id, opened_by, reason, evidence, status)
  VALUES (p_order_id, v_user_id, left(coalesce(p_reason,''), 2000), coalesce(p_evidence, '[]'::jsonb), 'open')
  ON CONFLICT (order_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        evidence = EXCLUDED.evidence,
        status = 'open'
  RETURNING id INTO v_dispute_id;

  INSERT INTO p2p_reputation(user_id) VALUES (v_order.seller_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO p2p_reputation(user_id) VALUES (v_order.buyer_id)  ON CONFLICT (user_id) DO NOTHING;

  UPDATE p2p_reputation
     SET disputed_orders = disputed_orders + 1,
         updated_at = now()
   WHERE user_id IN (v_order.seller_id, v_order.buyer_id);

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action)
  VALUES (p_order_id, v_order.offer_id, v_user_id, 'dispute_opened');

  RETURN v_dispute_id;
END;
$$;

GRANT EXECUTE ON FUNCTION p2p_open_dispute(uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION p2p_open_dispute(uuid, text, jsonb) IS
'Fase 7: abre disputa con validaciones anti-griefing (ban, cooldown, deadline).';
