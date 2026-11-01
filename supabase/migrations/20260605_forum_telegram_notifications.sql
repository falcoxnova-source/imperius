-- =====================================================================
-- Telegram DM al recibir respuesta en un tema del foro
-- =====================================================================
-- Reutiliza la edge function `notify-user-telegram` y la config existente
-- en `telegram_dm_config` (URL + anon_key).  Se dispara AFTER INSERT en
-- forum_posts SOLO si:
--   * el que responde NO es el autor del tema
--   * el autor del tema tiene cuenta vinculada en telegram_links
-- Best-effort: nunca rompe el INSERT del mensaje.
-- =====================================================================

CREATE OR REPLACE FUNCTION forum_post_notify_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg_url      text;
  v_cfg_key      text;
  v_enabled      boolean;
  v_has_link     boolean;
  v_topic_author uuid;
  v_topic_title  text;
  v_replier_name text;
  v_subject      text;
  v_body         text;
  v_req_id       bigint;
BEGIN
  SELECT edge_function_url, anon_key, is_enabled
    INTO v_cfg_url, v_cfg_key, v_enabled
    FROM telegram_dm_config
   WHERE id = 1;

  IF NOT COALESCE(v_enabled, false) OR COALESCE(v_cfg_url, '') = '' THEN
    RETURN NEW;
  END IF;

  SELECT user_id, title INTO v_topic_author, v_topic_title
    FROM forum_topics
   WHERE id = NEW.topic_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_topic_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM telegram_links
     WHERE user_id = v_topic_author
       AND telegram_id IS NOT NULL
  ) INTO v_has_link;

  IF NOT v_has_link THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_replier_name
    FROM profiles
   WHERE id = NEW.user_id;

  v_subject := '💬 Nueva respuesta en el Foro: ' || COALESCE(v_topic_title, 'Tema sin título');
  v_body := '👤 ' || COALESCE(v_replier_name, 'Alguien')
         || ' respondió a tu tema.' || E'\n\n'
         || LEFT(COALESCE(NEW.content, ''), 500)
         || E'\n\n🎮 Abre el Foro para leer la respuesta completa.';

  BEGIN
    SELECT net.http_post(
      url := v_cfg_url,
      body := jsonb_build_object(
        'recipient_id', v_topic_author,
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
    RAISE NOTICE 'forum_post_notify_telegram: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_post_notify_telegram ON forum_posts;
CREATE TRIGGER trg_forum_post_notify_telegram
  AFTER INSERT ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION forum_post_notify_telegram();

COMMENT ON FUNCTION forum_post_notify_telegram() IS
'Envía DM a Telegram al autor del tema cuando alguien responde en el foro (si tiene Telegram vinculado). No requiere VIP.';
