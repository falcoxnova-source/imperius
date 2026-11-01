/*
  # Add swap_fee to admin_revenue types

  1. Changes
    - Adds 'swap_fee' to the admin_revenue_revenue_type_check constraint
    - This allows swap commission fees to be tracked in admin_revenue

  2. Notes
    - Required for the 1% swap fee system to work properly
*/

-- Drop and recreate the constraint with swap_fee included
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
    'expedition_fee'::text, 
    'supply_box'::text, 
    'fleet_acceleration'::text,
    'swap_fee'::text,
    'other'::text
  ]));
