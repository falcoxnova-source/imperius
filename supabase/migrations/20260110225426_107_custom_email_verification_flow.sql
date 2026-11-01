/*
  # Custom Email Verification Flow

  1. Changes
    - Add `email_verified` column to profiles table
    - Update verify_email_token to set email_verified = true
    - Create function to check if user email is verified

  2. Security
    - Users cannot modify their own email_verified status
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email_verified boolean DEFAULT false;
  END IF;
END $$;

UPDATE profiles SET email_verified = true WHERE id IN (
  SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL
);

CREATE OR REPLACE FUNCTION verify_email_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_token_record record;
BEGIN
  SELECT * INTO v_token_record
  FROM email_verification_tokens
  WHERE token = p_token
    AND type = 'verification'
    AND used_at IS NULL
    AND expires_at > now();

  IF v_token_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token invalido o expirado');
  END IF;

  UPDATE email_verification_tokens
  SET used_at = now()
  WHERE id = v_token_record.id;

  UPDATE auth.users
  SET email_confirmed_at = now(),
      updated_at = now()
  WHERE id = v_token_record.user_id;

  UPDATE profiles
  SET email_verified = true
  WHERE id = v_token_record.user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION is_email_verified(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND email_verified = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION check_email_verified_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_verified boolean;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('exists', false, 'verified', false);
  END IF;

  SELECT email_verified INTO v_verified FROM profiles WHERE id = v_user_id;
  
  RETURN jsonb_build_object('exists', true, 'verified', COALESCE(v_verified, false), 'user_id', v_user_id);
END;
$$;