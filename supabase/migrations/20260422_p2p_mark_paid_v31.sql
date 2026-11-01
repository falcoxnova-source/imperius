-- =====================================================================
-- P2P v3.1: mensaje de p2p_mark_paid neutro por lado de la oferta
-- =====================================================================

CREATE OR REPLACE FUNCTION p2p_mark_paid(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order p2p_orders%ROWTYPE;
  v_offer p2p_offers%ROWTYPE;
  v_msg text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no existe'; END IF;

  IF v_order.buyer_id <> v_user_id THEN
    RAISE EXCEPTION 'Solo el comprador puede marcar como pagado';
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Estado invalido para marcar pagado';
  END IF;

  IF now() > v_order.payment_deadline THEN
    RAISE EXCEPTION 'Orden vencida';
  END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = v_order.offer_id;

  UPDATE p2p_orders
  SET status = 'paid', paid_at = now(), updated_at = now()
  WHERE id = p_order_id;

  IF v_offer.side = 'sell' THEN
    v_msg := 'El comprador confirmo el envio del pago. Esperando liberacion del vendedor.';
  ELSE
    v_msg := 'El comprador confirmo la recepcion del pago. Puede liberar el escrow.';
  END IF;

  INSERT INTO p2p_messages(order_id, sender_id, body, is_system)
  VALUES (p_order_id, v_user_id, v_msg, true);

  INSERT INTO p2p_audit_log(order_id, offer_id, actor_id, action, meta)
  VALUES (
    p_order_id,
    v_order.offer_id,
    v_user_id,
    'order_marked_paid',
    jsonb_build_object('offer_side', v_offer.side)
  );

  RETURN true;
END;
$$;
