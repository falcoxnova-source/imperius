/*
  # Fix: VIP-only Telegram DM notifications — block ALL types except broadcast

  ## Problem
  The previous migration (20260328130000) only blocked VIP check for:
    battle, espionage, fleet_warning, expedition, alliance
  
  But `player` (messages from other players) and `system` (recycling reports, etc.)
  were NOT blocked — they sent Telegram DMs to ALL 739 linked users regardless of VIP.

  ## Fix
  Invert the logic: instead of listing which types need VIP, only EXEMPT `broadcast`.
  Everything else (player, system, battle, espionage, fleet_warning, expedition, alliance)
  now requires an active Plus/VIP subscription.

  ## What keeps working for ALL players (no VIP needed):
  - broadcast (admin announcements) — always reaches every linked player

  ## What requires VIP (Plus subscription):
  - ALL other message types: player, system, battle, espionage, fleet_warning,
    expedition, alliance, and any future types
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

  -- Determine message type
  v_msg_type := COALESCE(NEW.message_type, 'system');

  -- VIP check: ALL notifications require active Plus subscription
  -- EXCEPT broadcast (admin announcements) which always reach everyone
  IF v_msg_type <> 'broadcast' THEN
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
