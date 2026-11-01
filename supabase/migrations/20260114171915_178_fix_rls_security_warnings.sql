/*
  # Fix RLS Security Warnings

  1. Security Fixes
    - Fix `suspicious_accounts` INSERT policy to not allow unrestricted access
    - Add proper policies for `email_verification_tokens` table
    
  2. Changes
    - Remove insecure "always true" INSERT policy on suspicious_accounts
    - Add restrictive INSERT policy that only allows system functions to insert
    - Add policies for email_verification_tokens for system-level operations
    
  Note: These tables are managed by SECURITY DEFINER functions, so direct user 
  access should be blocked. The functions will bypass RLS.
*/

-- Fix suspicious_accounts: Remove the insecure INSERT policy
DROP POLICY IF EXISTS "System can insert suspicious accounts" ON public.suspicious_accounts;

-- Create a restrictive INSERT policy - no direct inserts allowed
-- Inserts happen through SECURITY DEFINER functions which bypass RLS
CREATE POLICY "No direct inserts to suspicious accounts"
  ON public.suspicious_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Add policies for email_verification_tokens
-- These tokens are managed by edge functions with service role, so block direct access

-- No one can select tokens directly (edge functions use service role)
CREATE POLICY "No direct select on verification tokens"
  ON public.email_verification_tokens
  FOR SELECT
  TO authenticated
  USING (false);

-- No one can insert tokens directly (edge functions use service role)
CREATE POLICY "No direct insert on verification tokens"
  ON public.email_verification_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- No one can update tokens directly (edge functions use service role)
CREATE POLICY "No direct update on verification tokens"
  ON public.email_verification_tokens
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- No one can delete tokens directly
CREATE POLICY "No direct delete on verification tokens"
  ON public.email_verification_tokens
  FOR DELETE
  TO authenticated
  USING (false);
