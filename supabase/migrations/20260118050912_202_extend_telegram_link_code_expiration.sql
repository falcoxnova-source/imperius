/*
  # Extend Telegram Link Code Expiration

  Extends the link code expiration from 10 minutes to 24 hours to give users
  more time to complete the linking process.
*/

CREATE OR REPLACE FUNCTION complete_telegram_link(
  p_link_code text,
  p_telegram_id bigint,
  p_telegram_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link telegram_links%ROWTYPE;
  v_existing_telegram telegram_links%ROWTYPE;
BEGIN
  -- Check if this Telegram ID is already linked to another account
  SELECT * INTO v_existing_telegram 
  FROM telegram_links 
  WHERE telegram_id = p_telegram_id;

  IF v_existing_telegram IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'This Telegram account is already linked to another game account'
    );
  END IF;

  -- Find the link code (extended to 24 hours)
  SELECT * INTO v_link 
  FROM telegram_links 
  WHERE link_code = upper(p_link_code)
    AND telegram_id IS NULL
    AND created_at > now() - interval '24 hours';

  IF v_link IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Invalid or expired link code'
    );
  END IF;

  -- Update the link
  UPDATE telegram_links
  SET telegram_id = p_telegram_id,
      telegram_username = p_telegram_username,
      linked_at = now(),
      link_code = NULL
  WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_link.user_id,
    'message', 'Account linked successfully'
  );
END;
$$;
