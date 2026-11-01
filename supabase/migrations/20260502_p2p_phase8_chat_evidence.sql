-- =====================================================================
-- P2P Fase 8 — Chat + Evidencia en disputas
-- =====================================================================
-- 1) Bucket privado `p2p-evidence` para adjuntos de chat y disputas.
-- 2) Policies de storage: solo participantes de la orden (o admin) pueden
--    leer / subir / eliminar, usando el primer segmento del path como
--    order_id.
-- 3) Índice en p2p_messages(order_id, created_at).
-- 4) RPC p2p_send_message(p_order_id, p_body, p_attachment_url):
--    inserta con validaciones de longitud y estado de orden.
-- =====================================================================

-- 1) Bucket privado ------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('p2p-evidence', 'p2p-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- 2) Policies storage.objects -------------------------------------------
-- Helper: el primer segmento del path es el order_id
--   ej: "a1b2c3d4-.../file.png"
DROP POLICY IF EXISTS "p2p_evidence_read" ON storage.objects;
DROP POLICY IF EXISTS "p2p_evidence_insert" ON storage.objects;
DROP POLICY IF EXISTS "p2p_evidence_delete" ON storage.objects;

CREATE POLICY "p2p_evidence_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'p2p-evidence'
    AND (
      EXISTS (
        SELECT 1 FROM p2p_orders o
         WHERE o.id::text = split_part(name, '/', 1)
           AND (o.seller_id = auth.uid() OR o.buyer_id = auth.uid())
      )
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    )
  );

CREATE POLICY "p2p_evidence_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'p2p-evidence'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM p2p_orders o
       WHERE o.id::text = split_part(name, '/', 1)
         AND (o.seller_id = auth.uid() OR o.buyer_id = auth.uid())
    )
  );

CREATE POLICY "p2p_evidence_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'p2p-evidence'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    )
  );

-- 3) Índice para recuperación rápida del chat --------------------------
CREATE INDEX IF NOT EXISTS idx_p2p_messages_order_created
  ON p2p_messages (order_id, created_at);

-- 4) RPC p2p_send_message ----------------------------------------------
CREATE OR REPLACE FUNCTION p2p_send_message(
  p_order_id uuid,
  p_body text,
  p_attachment_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order p2p_orders%ROWTYPE;
  v_msg_id uuid;
  v_body_clean text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_user <> v_order.seller_id AND v_user <> v_order.buyer_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v_order.status IN ('cancelled','expired') THEN
    RAISE EXCEPTION 'No se puede escribir en una orden cerrada';
  END IF;

  v_body_clean := trim(coalesce(p_body, ''));
  IF v_body_clean = '' AND coalesce(p_attachment_url,'') = '' THEN
    RAISE EXCEPTION 'El mensaje no puede estar vacío';
  END IF;
  IF length(v_body_clean) > 2000 THEN
    v_body_clean := left(v_body_clean, 2000);
  END IF;

  INSERT INTO p2p_messages(order_id, sender_id, body, attachment_url, is_system)
  VALUES (p_order_id, v_user, v_body_clean, nullif(p_attachment_url,''), false)
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION p2p_send_message(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION p2p_send_message(uuid, text, text) IS
'Fase 8: envía mensaje en el chat de una orden P2P (valida participación y estado).';
