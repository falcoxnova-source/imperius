/*
  # Fix Expedition Fee Revenue Type
  
  ## Summary
  Adds 'expedition_fee' to the allowed revenue types in admin_revenue table.
  
  ## Problem
  The charge_expedition_fee function tries to insert with revenue_type='expedition_fee'
  but this type was not in the constraint.
  
  ## Solution
  Drop and recreate the constraint with the new type included.
*/

ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;

ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check 
  CHECK (revenue_type IN (
    'market_fee', 
    'withdrawal_fee', 
    'instant_build', 
    'instant_research', 
    'instant_ship', 
    'referral_bonus', 
    'officer_fxu', 
    'expedition_fee',
    'other'
  ));