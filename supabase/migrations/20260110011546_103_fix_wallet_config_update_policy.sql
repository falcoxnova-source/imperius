/*
  # Fix wallet_config update policy

  ## Problem
  The wallet_config table has RLS enabled but only has a SELECT policy.
  There is no UPDATE policy, so admins cannot save changes to the config.

  ## Solution
  Add an UPDATE policy that allows admins to modify the wallet_config.
*/

-- Add UPDATE policy for admins
CREATE POLICY "Admins can update wallet config"
  ON wallet_config
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
