/*
  # Admin Access to Wallet Transactions

  1. Security
    - Add policy for admins to view all wallet transactions
    - This is needed for the admin panel to show pending withdrawals
*/

-- Allow admins to view all wallet transactions
CREATE POLICY "Admins can view all transactions"
  ON wallet_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
