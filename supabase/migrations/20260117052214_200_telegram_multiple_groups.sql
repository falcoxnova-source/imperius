/*
  # Telegram Multiple Groups Support
  
  1. Changes
    - Add `telegram_groups` table to store multiple groups
    - Each group has chat_id, title, username, and is_enabled
    - Bot will automatically detect and store groups
  
  2. Security
    - Enable RLS on `telegram_groups` table
    - Only admins can read/modify groups
*/

-- Create telegram_groups table
CREATE TABLE IF NOT EXISTS telegram_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text UNIQUE NOT NULL,
  title text,
  username text,
  is_enabled boolean DEFAULT true,
  added_at timestamptz DEFAULT now(),
  last_message_at timestamptz
);

-- Enable RLS
ALTER TABLE telegram_groups ENABLE ROW LEVEL SECURITY;

-- Admin read policy
CREATE POLICY "Admins can read telegram groups"
  ON telegram_groups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Admin insert policy
CREATE POLICY "Admins can insert telegram groups"
  ON telegram_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Admin update policy
CREATE POLICY "Admins can update telegram groups"
  ON telegram_groups
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

-- Admin delete policy
CREATE POLICY "Admins can delete telegram groups"
  ON telegram_groups
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Function to toggle group enabled status
CREATE OR REPLACE FUNCTION toggle_telegram_group(p_group_id uuid, p_enabled boolean)
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
  
  UPDATE telegram_groups
  SET is_enabled = p_enabled
  WHERE id = p_group_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to remove a telegram group
CREATE OR REPLACE FUNCTION remove_telegram_group(p_group_id uuid)
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
  
  DELETE FROM telegram_groups
  WHERE id = p_group_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;