/*
  # Add supply_box to admin_revenue allowed types

  1. Changes
    - Drop and recreate constraint with supply_box included
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
  'other'::text
]));
