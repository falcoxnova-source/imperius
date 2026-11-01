/*
  # VIP-only Telegram DM notifications

  ## Summary
  Game notifications via Telegram (attacks, espionage, battle reports,
  expeditions, fleet warnings, alliance alerts) now require an active
  Plus/VIP subscription. Admin broadcast and system messages are NOT
  affected — they always reach every player.

  ## Changes
  - `notify_telegram_dm_on_message()`: before sending the HTTP call,
    checks if the recipient has an active Plus subscription for
    game-related message types.

  ## What keeps working for ALL players (no VIP needed):
  - broadcast (admin announcements)
  - system (system messages, rewards, etc.)
  - player (player-to-player messages)

  ## What requires VIP:
  - battle (battle reports)
  - espionage (spy reports)
  - fleet_warning (incoming attack/spy alerts)
  - expedition (expedition results)
  - alliance (alliance notifications)

  ## No schema changes. No table changes. No edge function changes.
*/

CREATE OR REPLACE FUNCTION notify_telegram_dm_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_has_telegram boolean;
  v_has_plus boolean;
  v_msg_type text;
  v_request_id bigint;
BEGIN
  -- Get DM config
  SELECT edge_function_url, anon_key, is_enabled INTO v_config
  FROM telegram_dm_config
  WHERE id = 1;

  IF v_config IS NULL OR NOT v_config.is_enabled OR v_config.edge_function_url = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if user has Telegram linked
  SELECT EXISTS (
    SELECT 1 FROM telegram_links
    WHERE user_id = NEW.recipient_id
      AND telegram_id IS NOT NULL
  ) INTO v_has_telegram;

  IF NOT v_has_telegram THEN
    RETURN NEW;
  END IF;

  -- VIP check: game notifications require active Plus subscription
  v_msg_type := COALESCE(NEW.message_type, 'system');

  IF v_msg_type IN ('battle', 'espionage', 'fleet_warning', 'expedition', 'alliance') THEN
    SELECT EXISTS (
      SELECT 1 FROM plus_subscriptions
      WHERE user_id = NEW.recipient_id
        AND is_active = true
        AND expires_at > now()
    ) INTO v_has_plus;

    IF NOT v_has_plus THEN
      -- Not VIP: skip Telegram DM (in-game message is still saved)
      RETURN NEW;
    END IF;
  END IF;
  -- broadcast, system, player messages → always send (no VIP needed)

  -- Send Telegram DM via edge function
  SELECT net.http_post(
    url := v_config.edge_function_url,
    body := jsonb_build_object(
      'recipient_id', NEW.recipient_id,
      'subject', NEW.subject,
      'body', LEFT(COALESCE(NEW.body, ''), 600),
      'message_type', v_msg_type
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_config.anon_key
    )
  ) INTO v_request_id;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Telegram DM notification error: %', SQLERRM;
    RETURN NEW;
END;
$$;
