-- Add premium_mission to admin_revenue revenue_type check constraint

ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee', 'withdrawal_fee', 'instant_build', 'instant_research',
    'instant_ship', 'referral_bonus', 'officer_fxu', 'expedition_fee',
    'supply_box', 'fleet_acceleration', 'swap_fee', 'transfer_fee',
    'plus_subscription', 'colony_abandon', 'planet_rename',
    'alliance_rename', 'alliance_creation', 'lottery_fee',
    'p2p_fee', 'blueprint_sale', 'hero_respec', 'other',
    'premium_mission'
  ]));
