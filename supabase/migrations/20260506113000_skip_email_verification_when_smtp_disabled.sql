-- =====================================================================
-- Skip email verification requirement when custom SMTP is disabled
--
-- Behavior:
-- - If admin_smtp_settings.is_enabled = false, login won't be blocked by
--   email verification status (verified=true for existing users).
-- - If SMTP is enabled, keep current verification behavior.
-- =====================================================================

CREATE OR REPLACE FUNCTION check_email_verified_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_verified boolean;
  v_smtp_enabled boolean := false;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('exists', false, 'verified', false);
  END IF;

  SELECT COALESCE(is_enabled, false)
  INTO v_smtp_enabled
  FROM admin_smtp_settings
  WHERE id = 1;

  IF NOT COALESCE(v_smtp_enabled, false) THEN
    RETURN jsonb_build_object(
      'exists', true,
      'verified', true,
      'user_id', v_user_id,
      'smtp_enabled', false
    );
  END IF;

  SELECT email_verified
  INTO v_verified
  FROM profiles
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'exists', true,
    'verified', COALESCE(v_verified, false),
    'user_id', v_user_id,
    'smtp_enabled', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_email_verified_by_email(text) TO authenticated;
