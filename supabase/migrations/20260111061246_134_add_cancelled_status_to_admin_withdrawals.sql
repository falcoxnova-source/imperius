/*
  # Add cancelled status to admin_withdrawals constraint
  
  ## Problem
  The admin_withdrawals_status_check constraint does not include 'cancelled' as a valid status.
  
  ## Solution
  Update the constraint to include 'cancelled' status.
*/

ALTER TABLE admin_withdrawals 
DROP CONSTRAINT admin_withdrawals_status_check;

ALTER TABLE admin_withdrawals 
ADD CONSTRAINT admin_withdrawals_status_check 
CHECK (status = ANY (ARRAY['pending', 'processing', 'confirmed', 'failed', 'cancelled']));
