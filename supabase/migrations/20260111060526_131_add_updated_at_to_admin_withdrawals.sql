/*
  # Add updated_at column to admin_withdrawals
  
  ## Problem
  The admin_cancel_withdrawal function references updated_at column which doesn't exist.
  
  ## Solution
  Add the missing updated_at column to admin_withdrawals table.
*/

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_withdrawals' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE admin_withdrawals ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;
