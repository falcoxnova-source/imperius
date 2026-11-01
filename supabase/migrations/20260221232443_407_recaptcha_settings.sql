/*
  # reCAPTCHA Configuration System

  1. New Settings
    - `recaptcha_site_key` - The public site key from Google reCAPTCHA console
    - `recaptcha_secret_key` - The secret key for server-side verification
    - `recaptcha_enabled` - Toggle to enable/disable reCAPTCHA on auth forms
    - `recaptcha_min_score` - Minimum score threshold for reCAPTCHA v3 (0.0 to 1.0)

  2. New Functions
    - `admin_get_recaptcha_settings` - Admin-only function to retrieve reCAPTCHA config
    - `admin_update_recaptcha_settings` - Admin-only function to update reCAPTCHA config
    - `public_get_recaptcha_public_config` - Public function that returns only site_key and enabled status

  3. Security
    - Secret key is only accessible to admin via server-side functions
    - Public endpoint only exposes site_key and enabled flag
*/

-- Insert reCAPTCHA settings into game_settings
INSERT INTO game_settings (key, value)
VALUES
  ('recaptcha_site_key', '""')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value)
VALUES
  ('recaptcha_secret_key', '""')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value)
VALUES
  ('recaptcha_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value)
VALUES
  ('recaptcha_min_score', '0.5')
ON CONFLICT (key) DO NOTHING;

-- Admin function to get reCAPTCHA settings (includes secret key)
CREATE OR REPLACE FUNCTION admin_get_recaptcha_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_key text;
  v_secret_key text;
  v_enabled boolean;
  v_min_score numeric;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT value::text INTO v_site_key FROM game_settings WHERE key = 'recaptcha_site_key';
  SELECT value::text INTO v_secret_key FROM game_settings WHERE key = 'recaptcha_secret_key';
  SELECT value::boolean INTO v_enabled FROM game_settings WHERE key = 'recaptcha_enabled';
  SELECT value::numeric INTO v_min_score FROM game_settings WHERE key = 'recaptcha_min_score';

  -- Remove surrounding quotes if present
  v_site_key := trim(both '"' from v_site_key);
  v_secret_key := trim(both '"' from v_secret_key);

  RETURN jsonb_build_object(
    'success', true,
    'site_key', COALESCE(v_site_key, ''),
    'secret_key', COALESCE(v_secret_key, ''),
    'enabled', COALESCE(v_enabled, false),
    'min_score', COALESCE(v_min_score, 0.5)
  );
END;
$$;

-- Admin function to update reCAPTCHA settings
CREATE OR REPLACE FUNCTION admin_update_recaptcha_settings(
  p_site_key text DEFAULT NULL,
  p_secret_key text DEFAULT NULL,
  p_enabled boolean DEFAULT NULL,
  p_min_score numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_site_key IS NOT NULL THEN
    UPDATE game_settings SET value = to_jsonb(p_site_key) WHERE key = 'recaptcha_site_key';
  END IF;

  IF p_secret_key IS NOT NULL THEN
    UPDATE game_settings SET value = to_jsonb(p_secret_key) WHERE key = 'recaptcha_secret_key';
  END IF;

  IF p_enabled IS NOT NULL THEN
    UPDATE game_settings SET value = to_jsonb(p_enabled) WHERE key = 'recaptcha_enabled';
  END IF;

  IF p_min_score IS NOT NULL THEN
    IF p_min_score < 0 OR p_min_score > 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'min_score must be between 0 and 1');
    END IF;
    UPDATE game_settings SET value = to_jsonb(p_min_score) WHERE key = 'recaptcha_min_score';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Public function to get only the site key and enabled status (no secret)
CREATE OR REPLACE FUNCTION public_get_recaptcha_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_key text;
  v_enabled boolean;
BEGIN
  SELECT value::text INTO v_site_key FROM game_settings WHERE key = 'recaptcha_site_key';
  SELECT value::boolean INTO v_enabled FROM game_settings WHERE key = 'recaptcha_enabled';

  v_site_key := trim(both '"' from v_site_key);

  RETURN jsonb_build_object(
    'site_key', COALESCE(v_site_key, ''),
    'enabled', COALESCE(v_enabled, false)
  );
END;
$$;
