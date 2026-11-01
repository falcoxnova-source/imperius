/*
  # Email Verification Tokens Table
  
  1. New Tables
    - `email_verification_tokens`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `email` (text)
      - `token` (text, unique)
      - `type` (text) - 'verification' or 'password_reset'
      - `expires_at` (timestamptz)
      - `used_at` (timestamptz, nullable)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS
    - Service role only access (via edge functions)
*/

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('verification', 'password_reset')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_email ON email_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);

CREATE OR REPLACE FUNCTION public.verify_email_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record email_verification_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token_record
  FROM email_verification_tokens
  WHERE token = p_token
    AND type = 'verification'
    AND used_at IS NULL
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token invalido o expirado');
  END IF;
  
  UPDATE email_verification_tokens
  SET used_at = now()
  WHERE id = v_token_record.id;
  
  UPDATE auth.users
  SET email_confirmed_at = now(),
      updated_at = now()
  WHERE id = v_token_record.user_id;
  
  RETURN jsonb_build_object('success', true, 'user_id', v_token_record.user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_password_reset_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record email_verification_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token_record
  FROM email_verification_tokens
  WHERE token = p_token
    AND type = 'password_reset'
    AND used_at IS NULL
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token invalido o expirado');
  END IF;
  
  UPDATE email_verification_tokens
  SET used_at = now()
  WHERE id = v_token_record.id;
  
  RETURN jsonb_build_object('success', true, 'user_id', v_token_record.user_id, 'email', v_token_record.email);
END;
$$;