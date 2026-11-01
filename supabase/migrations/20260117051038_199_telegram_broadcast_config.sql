/*
  # Telegram Broadcast Configuration
  
  1. New Table
    - `admin_telegram_config`
      - `id` (uuid, primary key)
      - `bot_token` (text) - Stored reference (actual token in secrets)
      - `group_chat_id` (text) - The Telegram group/channel chat ID
      - `is_enabled` (boolean) - Whether Telegram broadcasts are enabled
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `admin_telegram_config` table
    - Only admins can read/update the configuration
  
  3. Notes
    - The actual bot token is stored as TELEGRAM_BOT_TOKEN in edge function secrets
    - group_chat_id can be obtained by adding the bot to a group and using getUpdates API
*/

-- Create admin_telegram_config table
CREATE TABLE IF NOT EXISTS admin_telegram_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token_reference text DEFAULT 'TELEGRAM_BOT_TOKEN',
  group_chat_id text,
  is_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE admin_telegram_config ENABLE ROW LEVEL SECURITY;

-- Admin read policy
CREATE POLICY "Admins can read telegram config"
  ON admin_telegram_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Admin update policy
CREATE POLICY "Admins can update telegram config"
  ON admin_telegram_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Insert default config row
INSERT INTO admin_telegram_config (bot_token_reference, group_chat_id, is_enabled)
VALUES ('TELEGRAM_BOT_TOKEN', null, false)
ON CONFLICT DO NOTHING;

-- Function to update telegram config
CREATE OR REPLACE FUNCTION update_telegram_config(
  p_group_chat_id text,
  p_is_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin
  FROM profiles
  WHERE id = auth.uid();
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;
  
  UPDATE admin_telegram_config
  SET 
    group_chat_id = p_group_chat_id,
    is_enabled = p_is_enabled,
    updated_at = now()
  WHERE id = (SELECT id FROM admin_telegram_config LIMIT 1);
  
  RETURN jsonb_build_object('success', true);
END;
$$;