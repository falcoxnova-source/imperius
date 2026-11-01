/*
  # Fix reCAPTCHA Settings Storage

  1. Changes
    - Fix `admin_update_recaptcha_settings` to store plain text values instead of JSONB-encoded values
    - `to_jsonb(text)` wraps strings in extra quotes, causing double-quoting when stored in a text column
    - Now stores values directly as text: "true"/"false" for booleans, plain text for keys
    - Fix `public_get_recaptcha_config` to handle text-based boolean comparison
    - Clean up existing double-quoted values in game_settings

  2. Security
    - No changes to security policies
    - Functions remain SECURITY DEFINER with search_path set
*/

-- Clean up existing double-quoted values
UPDATE game_settings
SET value = trim(both '"' from value)
WHERE key IN ('recaptcha_site_key', 'recaptcha_secret_key')
  AND value LIKE '"%"';

-- Fix the update function to store plain text instead of to_jsonb()
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
    UPDATE game_settings SET value = p_site_key WHERE key = 'recaptcha_site_key';
  END IF;

  IF p_secret_key IS NOT NULL THEN
    UPDATE game_settings SET value = p_secret_key WHERE key = 'recaptcha_secret_key';
  END IF;

  IF p_enabled IS NOT NULL THEN
    UPDATE game_settings SET value = p_enabled::text WHERE key = 'recaptcha_enabled';
  END IF;

  IF p_min_score IS NOT NULL THEN
    IF p_min_score < 0 OR p_min_score > 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'min_score must be between 0 and 1');
    END IF;
    UPDATE game_settings SET value = p_min_score::text WHERE key = 'recaptcha_min_score';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Fix the admin get function to not need quote trimming for keys anymore
CREATE OR REPLACE FUNCTION admin_get_recaptcha_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_key text;
  v_secret_key text;
  v_enabled text;
  v_min_score numeric;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT value INTO v_site_key FROM game_settings WHERE key = 'recaptcha_site_key';
  SELECT value INTO v_secret_key FROM game_settings WHERE key = 'recaptcha_secret_key';
  SELECT value INTO v_enabled FROM game_settings WHERE key = 'recaptcha_enabled';
  SELECT value::numeric INTO v_min_score FROM game_settings WHERE key = 'recaptcha_min_score';

  v_site_key := trim(both '"' from COALESCE(v_site_key, ''));
  v_secret_key := trim(both '"' from COALESCE(v_secret_key, ''));

  RETURN jsonb_build_object(
    'success', true,
    'site_key', v_site_key,
    'secret_key', v_secret_key,
    'enabled', (COALESCE(v_enabled, 'false') = 'true'),
    'min_score', COALESCE(v_min_score, 0.5)
  );
END;
$$;

-- Fix the public config function for consistent boolean handling
CREATE OR REPLACE FUNCTION public_get_recaptcha_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_key text;
  v_enabled text;
BEGIN
  SELECT value INTO v_site_key FROM game_settings WHERE key = 'recaptcha_site_key';
  SELECT value INTO v_enabled FROM game_settings WHERE key = 'recaptcha_enabled';

  v_site_key := trim(both '"' from COALESCE(v_site_key, ''));

  RETURN jsonb_build_object(
    'site_key', v_site_key,
    'enabled', (COALESCE(v_enabled, 'false') = 'true')
  );
END;
$$;
