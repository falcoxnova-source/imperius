/*
  # Telegram DM Notifications for In-Game Messages

  ## Summary
  Adds automatic Telegram direct message notifications to users when they
  receive in-game messages (battle reports, espionage, expeditions, etc.).
  Only users who have linked their Telegram account will receive DMs.
  This does NOT modify any existing Telegram group functionality.

  ## Changes
  1. New Tables
    - `telegram_dm_config`
      - `id` (integer, primary key)
      - `edge_function_url` (text) - URL of the notify-user-telegram edge function
      - `anon_key` (text) - Supabase anon key for API authentication
      - `is_enabled` (boolean) - Toggle to enable/disable DM notifications

  2. New Functions
    - `notify_telegram_dm_on_message()` - Trigger function that fires after
      a new message is inserted, sends an async HTTP request to the edge
      function which delivers the Telegram DM

  3. New Triggers
    - `trigger_telegram_dm_on_message` on `messages` table (AFTER INSERT)

  ## Security
    - RLS enabled on `telegram_dm_config`
    - Only admins can read/update the config
    - Trigger function is SECURITY DEFINER with restricted search_path

  ## Notes
    - Uses pg_net for non-blocking async HTTP calls (does not slow down message insertion)
    - If the user has no Telegram linked, the edge function simply skips
    - If the bot token is missing or Telegram API fails, errors are logged but never block game functionality
*/

-- Config table for DM notification settings
CREATE TABLE IF NOT EXISTS telegram_dm_config (
  id integer PRIMARY KEY DEFAULT 1,
  edge_function_url text NOT NULL DEFAULT '',
  anon_key text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE telegram_dm_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read telegram_dm_config"
  ON telegram_dm_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update telegram_dm_config"
  ON telegram_dm_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Insert default config
INSERT INTO telegram_dm_config (id, edge_function_url, anon_key, is_enabled)
VALUES (
  1,
  'https://hhrgcnvydmjqcevgmlhj.supabase.co/functions/v1/notify-user-telegram',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocmdjbnZ5ZG1qcWNldmdtbGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczOTE2MDEsImV4cCI6MjA4Mjk2NzYwMX0.YYoUqIuz9GS-pgkqkSz33W6K7TCYSyayc1yHtUCryUU',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Trigger function: sends Telegram DM via edge function when a message is inserted
CREATE OR REPLACE FUNCTION notify_telegram_dm_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_has_telegram boolean;
  v_request_id bigint;
BEGIN
  SELECT edge_function_url, anon_key, is_enabled INTO v_config
  FROM telegram_dm_config
  WHERE id = 1;

  IF v_config IS NULL OR NOT v_config.is_enabled OR v_config.edge_function_url = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM telegram_links
    WHERE user_id = NEW.recipient_id
      AND telegram_id IS NOT NULL
  ) INTO v_has_telegram;

  IF NOT v_has_telegram THEN
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := v_config.edge_function_url,
    body := jsonb_build_object(
      'recipient_id', NEW.recipient_id,
      'subject', NEW.subject,
      'body', LEFT(COALESCE(NEW.body, ''), 600),
      'message_type', COALESCE(NEW.message_type, 'system')
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

-- Create trigger on messages table
DROP TRIGGER IF EXISTS trigger_telegram_dm_on_message ON messages;

CREATE TRIGGER trigger_telegram_dm_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_telegram_dm_on_message();
