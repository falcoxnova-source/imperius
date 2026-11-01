/*
  # Unify Speed Settings System

  This migration fixes the speed settings to use a single source of truth.
  
  ## Problem
  - Admin panel updates `admin_speed_settings` table
  - Server-side functions were reading from old `game_settings` table
  - This caused speed changes to only apply to admin (frontend) but not other users (server calculations)

  ## Solution
  - Update `get_game_speed()` function to read from `admin_speed_settings`
  - Create `get_fleet_speed()` function to read from `admin_speed_settings`
  - Create `get_resource_speed()` function to read from `admin_speed_settings`
  - Sync current `admin_speed_settings` values to `game_settings` for backwards compatibility
*/

-- Update get_game_speed to read from admin_speed_settings
CREATE OR REPLACE FUNCTION get_game_speed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speed decimal;
BEGIN
  SELECT game_speed INTO v_speed 
  FROM admin_speed_settings 
  WHERE id = 1;

  RETURN COALESCE(v_speed::integer, 10);
END;
$$;

-- Create get_fleet_speed function
CREATE OR REPLACE FUNCTION get_fleet_speed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speed decimal;
BEGIN
  SELECT fleet_speed INTO v_speed 
  FROM admin_speed_settings 
  WHERE id = 1;

  RETURN COALESCE(v_speed::integer, 10);
END;
$$;

-- Create get_resource_speed function
CREATE OR REPLACE FUNCTION get_resource_speed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speed decimal;
BEGIN
  SELECT resource_speed INTO v_speed 
  FROM admin_speed_settings 
  WHERE id = 1;

  RETURN COALESCE(v_speed::integer, 10);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_game_speed() TO authenticated;
GRANT EXECUTE ON FUNCTION get_fleet_speed() TO authenticated;
GRANT EXECUTE ON FUNCTION get_resource_speed() TO authenticated;

-- Sync admin_speed_settings to game_settings for backwards compatibility
UPDATE game_settings 
SET value = (SELECT game_speed::text FROM admin_speed_settings WHERE id = 1),
    updated_at = now()
WHERE key = 'game_speed';

UPDATE game_settings 
SET value = (SELECT fleet_speed::text FROM admin_speed_settings WHERE id = 1),
    updated_at = now()
WHERE key = 'fleet_speed';

UPDATE game_settings 
SET value = (SELECT resource_speed::text FROM admin_speed_settings WHERE id = 1),
    updated_at = now()
WHERE key = 'resource_speed';

-- Create trigger to keep game_settings in sync when admin_speed_settings changes
CREATE OR REPLACE FUNCTION sync_speed_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE game_settings SET value = NEW.game_speed::text, updated_at = now() WHERE key = 'game_speed';
  UPDATE game_settings SET value = NEW.fleet_speed::text, updated_at = now() WHERE key = 'fleet_speed';
  UPDATE game_settings SET value = NEW.resource_speed::text, updated_at = now() WHERE key = 'resource_speed';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_speed_settings_trigger ON admin_speed_settings;
CREATE TRIGGER sync_speed_settings_trigger
  AFTER UPDATE ON admin_speed_settings
  FOR EACH ROW
  EXECUTE FUNCTION sync_speed_settings();
