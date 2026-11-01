-- =====================================================================
-- P2P Fase 10b — DM de Telegram al recibir mensaje en el chat de una orden
-- =====================================================================
-- Reutiliza la edge function `notify-user-telegram` y la config existente
-- en `telegram_dm_config` (URL + anon_key).  Se dispara AFTER INSERT en
-- p2p_messages SOLO si:
--   * el mensaje NO es de sistema (is_system=false)
--   * el receptor tiene cuenta vinculada en telegram_links
-- Best-effort: nunca rompe el INSERT del mensaje.
-- =====================================================================

CREATE OR REPLACE FUNCTION p2p_message_notify_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        p2p_orders%ROWTYPE;
  v_recipient    uuid;
  v_sender_name  text;
  v_cfg_url      text;
  v_cfg_key      text;
  v_enabled      boolean;
  v_has_link     boolean;
  v_subject      text;
  v_body         text;
  v_req_id       bigint;
BEGIN
  -- Solo mensajes reales, no los de sistema
  IF NEW.is_system THEN RETURN NEW; END IF;

  SELECT edge_function_url, anon_key, is_enabled
    INTO v_cfg_url, v_cfg_key, v_enabled
    FROM telegram_dm_config
   WHERE id = 1;

  IF NOT COALESCE(v_enabled, false) OR COALESCE(v_cfg_url,'') = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM p2p_orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Destinatario = la contraparte del sender en la orden
  IF NEW.sender_id = v_order.seller_id THEN
    v_recipient := v_order.buyer_id;
  ELSIF NEW.sender_id = v_order.buyer_id THEN
    v_recipient := v_order.seller_id;
  ELSE
    RETURN NEW;  -- mensaje enviado por terceros (admin?), no notificamos
  END IF;

  -- Verificar que el receptor tenga cuenta de Telegram vinculada
  SELECT EXISTS (SELECT 1 FROM telegram_links WHERE user_id = v_recipient)
    INTO v_has_link;
  IF NOT v_has_link THEN RETURN NEW; END IF;

  SELECT username INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

  v_subject := '💬 Nuevo mensaje P2P de ' || COALESCE(v_sender_name, 'contraparte');
  v_body := LEFT(COALESCE(NEW.body, ''), 500);
  IF COALESCE(NEW.attachment_url,'') <> '' THEN
    v_body := v_body || E'\n\n📎 (incluye adjunto)';
  END IF;
  v_body := v_body || E'\n\n🎮 Abre la orden en el Mercado P2P para responder.';

  BEGIN
    SELECT net.http_post(
      url := v_cfg_url,
      body := jsonb_build_object(
        'recipient_id', v_recipient,
        'subject',      v_subject,
        'body',         v_body,
        'message_type', 'player'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey',       v_cfg_key,
        'Authorization','Bearer ' || v_cfg_key
      )
    ) INTO v_req_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'p2p_message_notify_telegram: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p2p_message_notify_telegram ON p2p_messages;
CREATE TRIGGER trg_p2p_message_notify_telegram
  AFTER INSERT ON p2p_messages
  FOR EACH ROW EXECUTE FUNCTION p2p_message_notify_telegram();

COMMENT ON FUNCTION p2p_message_notify_telegram() IS
'Fase 10b: manda DM a Telegram al receptor cuando llega un mensaje P2P (si tiene cuenta vinculada).';
