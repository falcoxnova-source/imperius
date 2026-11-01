-- VIP Telegram game alerts (ataques, espionajes, reportes)
-- Antes: notify_telegram_dm_on_message hacia net.http_post a una edge function
-- de la nube (URL vaciada el 2026-08-30) => ningun DM se enviaba.
-- Ahora: encola en notification_queue (canal telegram) y lo entrega el
-- notification_worker local de email_service.py.
-- Solo: battle / espionage / fleet_warning, solo VIP activo, Telegram vinculado
-- y opt-out por usuario (profiles.telegram_alerts_enabled).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_alerts_enabled boolean NOT NULL DEFAULT true;

-- profiles usa grants por columna; el usuario solo puede cambiar su propia
-- fila (RLS uid() = id)
GRANT UPDATE (telegram_alerts_enabled) ON public.profiles TO authenticated;

CREATE INDEX IF NOT EXISTS idx_notification_queue_user_ntype_created
  ON public.notification_queue (user_id, ntype, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_telegram_dm_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_msg_type text;
  v_body text;
  v_json jsonb;
  v_data jsonb := NULL;
  v_payload jsonb;
BEGIN
  -- Seguridad: solo mensajes del sistema (sender_id NULL). La RLS de messages
  -- obliga sender_id = uid() en inserts del cliente, asi un jugador no puede
  -- falsificar alertas de ataque/espionaje hacia el Telegram de otro.
  IF NEW.recipient_id IS NULL OR NEW.sender_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_msg_type := COALESCE(NEW.message_type, 'system');
  IF v_msg_type NOT IN ('battle', 'espionage', 'fleet_warning') THEN
    RETURN NEW;
  END IF;

  -- Interruptor global (admin)
  SELECT is_enabled INTO v_enabled FROM telegram_dm_config WHERE id = 1;
  IF v_enabled IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- Opt-out del usuario
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = NEW.recipient_id AND telegram_alerts_enabled = true
  ) THEN
    RETURN NEW;
  END IF;

  -- Telegram vinculado
  IF NOT EXISTS (
    SELECT 1 FROM telegram_links
    WHERE user_id = NEW.recipient_id AND telegram_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- VIP activo
  IF NOT EXISTS (
    SELECT 1 FROM plus_subscriptions
    WHERE user_id = NEW.recipient_id
      AND is_active = true
      AND expires_at > now()
  ) THEN
    RETURN NEW;
  END IF;

  -- Anti-flood: max 30 alertas por usuario cada 10 minutos
  IF (SELECT count(*) FROM notification_queue
      WHERE user_id = NEW.recipient_id
        AND ntype = 'game_alert'
        AND created_at > now() - interval '10 minutes') >= 30 THEN
    RETURN NEW;
  END IF;

  v_body := COALESCE(NEW.body, '');

  -- Reportes en JSON (combate v2 / espionaje): solo campos resumidos
  IF left(ltrim(v_body), 1) = '{' THEN
    BEGIN
      v_json := v_body::jsonb;
      v_data := jsonb_strip_nulls(jsonb_build_object(
        'result',          v_json->'result',
        'perspective',     v_json->'perspective',
        'attacker',        v_json->'attacker',
        'defender',        v_json->'defender',
        'coordinates',     v_json->'coordinates',
        'planet_name',     v_json->'planet_name',
        'loot',            v_json->'loot',
        'debris',          v_json->'debris',
        'moon_created',    v_json#>'{moon,moon_created}',
        'attacker_losses', v_json->'attacker_losses',
        'defender_losses', v_json->'defender_losses',
        'resources',       v_json->'resources',
        'ships_count',     CASE WHEN jsonb_typeof(v_json->'ships') = 'array'
                                THEN jsonb_array_length(v_json->'ships') END,
        'defenses_count',  CASE WHEN jsonb_typeof(v_json->'defenses') = 'array'
                                THEN jsonb_array_length(v_json->'defenses') END,
        'spy_detected',    v_json->'spy_detected'
      ));
      v_body := '';
    EXCEPTION WHEN OTHERS THEN
      v_data := NULL;
    END;
  END IF;

  v_payload := jsonb_build_object(
    'message_type', v_msg_type,
    'subject', left(COALESCE(NEW.subject, ''), 200),
    'body', left(v_body, 900)
  );
  IF v_data IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('data', v_data);
  END IF;

  -- El worker parsea la salida de psql separada por '|'
  v_payload := replace(v_payload::text, '|', '/')::jsonb;

  INSERT INTO notification_queue (user_id, ntype, payload, channels)
  VALUES (NEW.recipient_id, 'game_alert', v_payload, ARRAY['telegram']);

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Telegram game alert error: %', SQLERRM;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_telegram_dm_on_message() FROM PUBLIC, anon, authenticated;

-- Tablas internas: solo backend. RLS ya bloquea, quitamos grants sobrantes.
REVOKE ALL ON public.notification_queue FROM anon, authenticated;
REVOKE ALL ON public.telegram_dm_config FROM anon;
