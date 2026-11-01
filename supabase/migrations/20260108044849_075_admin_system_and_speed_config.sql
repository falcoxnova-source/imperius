/*
  # Admin System and Game Speed Configuration

  1. New Tables
    - `admin_speed_settings` - Game speed multipliers
      - `id` (int, primary key)
      - `game_speed` (decimal) - Building/research time multiplier
      - `fleet_speed` (decimal) - Fleet travel multiplier
      - `resource_speed` (decimal) - Resource production multiplier
    
    - `admin_smtp_settings` - Email configuration
      - `id` (int, primary key)
      - SMTP configuration fields
      - `is_enabled` (boolean)

  2. Profile Changes
    - `is_admin` - Admin flag (hidden from regular users)
    - `is_hidden` - Exclude from rankings

  3. Security
    - Admin-only access to settings
    - Hidden users excluded from rankings
*/

-- Add admin and hidden flags to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_admin boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_hidden boolean DEFAULT false;
  END IF;
END $$;

-- Create admin speed settings table
CREATE TABLE IF NOT EXISTS admin_speed_settings (
  id int PRIMARY KEY DEFAULT 1,
  game_speed decimal(10,2) NOT NULL DEFAULT 10,
  fleet_speed decimal(10,2) NOT NULL DEFAULT 10,
  resource_speed decimal(10,2) NOT NULL DEFAULT 10,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id),
  CONSTRAINT single_speed_row CHECK (id = 1)
);

-- Create admin smtp settings table
CREATE TABLE IF NOT EXISTS admin_smtp_settings (
  id int PRIMARY KEY DEFAULT 1,
  smtp_host text DEFAULT '',
  smtp_port int DEFAULT 587,
  smtp_user text DEFAULT '',
  smtp_password text DEFAULT '',
  smtp_from_email text DEFAULT '',
  smtp_from_name text DEFAULT 'Falco-X Universo',
  is_enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_smtp_row CHECK (id = 1)
);

-- Insert default settings
INSERT INTO admin_speed_settings (id, game_speed, fleet_speed, resource_speed)
VALUES (1, 10, 10, 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_smtp_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE admin_speed_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_smtp_settings ENABLE ROW LEVEL SECURITY;

-- Speed settings policies (anyone can read, only admin can update)
CREATE POLICY "Anyone can read speed settings"
  ON admin_speed_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can update speed settings"
  ON admin_speed_settings FOR UPDATE
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

-- SMTP settings policies (only admin)
CREATE POLICY "Only admins can read smtp settings"
  ON admin_smtp_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can update smtp settings"
  ON admin_smtp_settings FOR UPDATE
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

-- Function to get game speeds (public)
CREATE OR REPLACE FUNCTION get_game_speeds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
BEGIN
  SELECT game_speed, fleet_speed, resource_speed
  INTO v_settings
  FROM admin_speed_settings
  WHERE id = 1;
  
  RETURN jsonb_build_object(
    'game_speed', COALESCE(v_settings.game_speed, 10),
    'fleet_speed', COALESCE(v_settings.fleet_speed, 10),
    'resource_speed', COALESCE(v_settings.resource_speed, 10)
  );
END;
$$;

-- Function to update game speeds (admin only)
CREATE OR REPLACE FUNCTION update_game_speeds(
  p_game_speed decimal,
  p_fleet_speed decimal,
  p_resource_speed decimal
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
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  IF p_game_speed < 1 OR p_game_speed > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game speed must be between 1 and 100');
  END IF;
  
  IF p_fleet_speed < 1 OR p_fleet_speed > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fleet speed must be between 1 and 100');
  END IF;
  
  IF p_resource_speed < 1 OR p_resource_speed > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resource speed must be between 1 and 100');
  END IF;
  
  UPDATE admin_speed_settings
  SET 
    game_speed = p_game_speed,
    fleet_speed = p_fleet_speed,
    resource_speed = p_resource_speed,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = 1;
  
  RETURN jsonb_build_object(
    'success', true,
    'game_speed', p_game_speed,
    'fleet_speed', p_fleet_speed,
    'resource_speed', p_resource_speed
  );
END;
$$;

-- Function to update SMTP settings (admin only)
CREATE OR REPLACE FUNCTION update_smtp_settings(
  p_host text,
  p_port int,
  p_user text,
  p_password text,
  p_from_email text,
  p_from_name text,
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
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  UPDATE admin_smtp_settings
  SET 
    smtp_host = p_host,
    smtp_port = p_port,
    smtp_user = p_user,
    smtp_password = p_password,
    smtp_from_email = p_from_email,
    smtp_from_name = p_from_name,
    is_enabled = p_is_enabled,
    updated_at = now()
  WHERE id = 1;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to get SMTP settings (admin only)
CREATE OR REPLACE FUNCTION get_smtp_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_settings record;
BEGIN
  SELECT is_admin INTO v_is_admin
  FROM profiles
  WHERE id = auth.uid();
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  SELECT * INTO v_settings FROM admin_smtp_settings WHERE id = 1;
  
  RETURN jsonb_build_object(
    'success', true,
    'smtp_host', v_settings.smtp_host,
    'smtp_port', v_settings.smtp_port,
    'smtp_user', v_settings.smtp_user,
    'smtp_password', v_settings.smtp_password,
    'smtp_from_email', v_settings.smtp_from_email,
    'smtp_from_name', v_settings.smtp_from_name,
    'is_enabled', v_settings.is_enabled
  );
END;
$$;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS boolean
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
  
  RETURN COALESCE(v_is_admin, false);
END;
$$;

-- Update rankings to exclude hidden users
CREATE OR REPLACE FUNCTION get_rankings(p_limit int DEFAULT 100, p_offset int DEFAULT 0)
RETURNS TABLE(
  rank bigint,
  user_id uuid,
  username text,
  alliance_tag text,
  total_points bigint,
  economy_points bigint,
  research_points bigint,
  military_points bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY p.total_points DESC) as rank,
    p.id as user_id,
    p.username,
    a.tag as alliance_tag,
    p.total_points,
    p.economy_points,
    p.research_points,
    p.military_points
  FROM profiles p
  LEFT JOIN alliance_members am ON am.user_id = p.id
  LEFT JOIN alliances a ON a.id = am.alliance_id
  WHERE (p.is_hidden = false OR p.is_hidden IS NULL)
    AND (p.is_admin = false OR p.is_admin IS NULL)
  ORDER BY p.total_points DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_game_speeds() TO authenticated;
GRANT EXECUTE ON FUNCTION update_game_speeds(decimal, decimal, decimal) TO authenticated;
GRANT EXECUTE ON FUNCTION update_smtp_settings(text, int, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_smtp_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION is_current_user_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_rankings(int, int) TO authenticated;