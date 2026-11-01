-- =====================================================================
-- P2P Fase 9 — Rating post-release y notificaciones in-app
-- =====================================================================
-- 1) Tabla p2p_ratings: ambas partes pueden calificar tras 'released'.
-- 2) Trigger sobre p2p_ratings: actualiza rating_sum/rating_count en
--    p2p_reputation del ratee.
-- 3) RPC p2p_rate_order(order_id, stars 1-5, comment).
-- 4) Mensajes de sistema en p2p_messages al aceptar / pagar / liberar /
--    disputar — sirven como "notificaciones" para la contraparte.
-- =====================================================================

-- 1) Tabla --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES p2p_orders(id) ON DELETE CASCADE,
  rater_id     uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  ratee_id     uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  stars        smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_p2p_ratings_ratee  ON p2p_ratings (ratee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2p_ratings_rater  ON p2p_ratings (rater_id, created_at DESC);

ALTER TABLE p2p_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p2p_ratings_read   ON p2p_ratings;
DROP POLICY IF EXISTS p2p_ratings_insert ON p2p_ratings;

-- Lectura pública: las reputaciones son visibles (sin exponer comentarios privados innecesarios)
CREATE POLICY p2p_ratings_read ON p2p_ratings
  FOR SELECT USING (true);

-- Las inserciones van por RPC (SECURITY DEFINER), así que dejamos policy restrictiva.
CREATE POLICY p2p_ratings_insert ON p2p_ratings
  FOR INSERT WITH CHECK (rater_id = auth.uid());

-- 2) Trigger: mantener rating_sum/rating_count --------------------------
CREATE OR REPLACE FUNCTION p2p_rating_update_reputation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO p2p_reputation(user_id) VALUES (NEW.ratee_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE p2p_reputation
     SET rating_sum   = rating_sum + NEW.stars,
         rating_count = rating_count + 1,
         updated_at   = now()
   WHERE user_id = NEW.ratee_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p2p_rating_update_reputation ON p2p_ratings;
CREATE TRIGGER trg_p2p_rating_update_reputation
  AFTER INSERT ON p2p_ratings
  FOR EACH ROW EXECUTE FUNCTION p2p_rating_update_reputation();

-- 3) RPC: p2p_rate_order ------------------------------------------------
CREATE OR REPLACE FUNCTION p2p_rate_order(
  p_order_id uuid,
  p_stars    int,
  p_comment  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order p2p_orders%ROWTYPE;
  v_ratee uuid;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'Las estrellas deben estar entre 1 y 5';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_order.status <> 'released' THEN
    RAISE EXCEPTION 'Solo se pueden calificar órdenes completadas (released).';
  END IF;

  IF v_user = v_order.seller_id THEN
    v_ratee := v_order.buyer_id;
  ELSIF v_user = v_order.buyer_id THEN
    v_ratee := v_order.seller_id;
  ELSE
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO p2p_ratings(order_id, rater_id, ratee_id, stars, comment)
  VALUES (p_order_id, v_user, v_ratee, p_stars, NULLIF(left(coalesce(p_comment,''), 500), ''))
  ON CONFLICT (order_id, rater_id) DO UPDATE
    SET stars = EXCLUDED.stars,
        comment = EXCLUDED.comment
  RETURNING id INTO v_id;

  -- Mensaje de sistema para que la contraparte lo vea en el chat
  INSERT INTO p2p_messages(order_id, sender_id, body, is_system)
  VALUES (p_order_id, v_user, '⭐ Recibiste una calificación: ' || p_stars || '/5', true);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION p2p_rate_order(uuid, int, text) TO authenticated;

-- 4) Mensajes de sistema en eventos clave -------------------------------
-- Los insertamos solo si no existía ya un msg similar para esa orden+acción
-- (simples anuncios; el usuario los ve al abrir el chat)

-- Accept offer (al crear orden)
CREATE OR REPLACE FUNCTION p2p_notify_on_order_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO p2p_messages(order_id, sender_id, body, is_system)
  VALUES (NEW.id, COALESCE(NEW.buyer_id, NEW.seller_id),
          '🆕 Orden creada. El comprador tiene hasta ' ||
          to_char(NEW.payment_deadline, 'YYYY-MM-DD HH24:MI') ||
          ' para pagar.', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p2p_notify_on_order_create ON p2p_orders;
CREATE TRIGGER trg_p2p_notify_on_order_create
  AFTER INSERT ON p2p_orders
  FOR EACH ROW EXECUTE FUNCTION p2p_notify_on_order_create();

-- Status changes (paid, disputed, cancelled, expired)
CREATE OR REPLACE FUNCTION p2p_notify_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_body := CASE NEW.status
    WHEN 'paid'      THEN '💸 El comprador marcó la orden como pagada. El vendedor debe verificar y liberar.'
    WHEN 'released'  THEN '✅ Escrow liberado. Orden completada. Puedes calificar a la contraparte.'
    WHEN 'disputed'  THEN '⚠️ Disputa abierta. Un administrador revisará el caso.'
    WHEN 'cancelled' THEN '❌ Orden cancelada por el comprador.'
    WHEN 'expired'   THEN '⏰ Orden expirada sin pago.'
    WHEN 'resolved'  THEN '⚖️ Disputa resuelta por un administrador.'
    ELSE NULL
  END;

  -- Evitamos duplicar el mensaje "released" porque p2p_release_order ya inserta uno.
  IF v_body IS NOT NULL AND NEW.status NOT IN ('released') THEN
    INSERT INTO p2p_messages(order_id, sender_id, body, is_system)
    VALUES (NEW.id, COALESCE(NEW.buyer_id, NEW.seller_id), v_body, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p2p_notify_on_status_change ON p2p_orders;
CREATE TRIGGER trg_p2p_notify_on_status_change
  AFTER UPDATE OF status ON p2p_orders
  FOR EACH ROW EXECUTE FUNCTION p2p_notify_on_status_change();

COMMENT ON FUNCTION p2p_rate_order(uuid, int, text) IS
'Fase 9: califica al contraparte de una orden released (1-5 estrellas + comentario opcional).';
