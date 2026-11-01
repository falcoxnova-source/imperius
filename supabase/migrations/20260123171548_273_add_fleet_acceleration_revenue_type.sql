/*
  # Add Fleet Acceleration Revenue Type

  ## Problem
  The accelerate_fleet function tries to insert 'fleet_acceleration' as revenue_type,
  but this value is not in the allowed check constraint.

  ## Solution
  Update the check constraint to include 'fleet_acceleration' as a valid revenue type.
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
  'expedition_fee'::text, 
  'supply_box'::text,
  'fleet_acceleration'::text,
  'other'::text
]));
