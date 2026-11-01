/*
  # Add officer_fxu to admin_revenue revenue types

  1. Problem
    - The revenue_type check constraint doesn't include 'officer_fxu'
    - Officer purchases with FXU cannot be tracked

  2. Solution
    - Drop and recreate the constraint with the new value
*/

ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;

ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check 
CHECK (revenue_type = ANY (ARRAY[
  'market_fee'::text, 
  'withdrawal_fee'::text, 
  'instant_build'::text, 
  'instant_research'::text, 
  'instant_ship'::text, 
  'referral_bonus'::text,
  'officer_fxu'::text,
  'other'::text
]));
