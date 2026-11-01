-- Reset economy and fortresses
-- Fortresses: remove ownership
UPDATE public.alliance_fortresses SET owner_alliance_id = NULL, captured_at = NULL;

-- Fortress ships
TRUNCATE public.fortress_ships CASCADE;

-- Fortress pools
TRUNCATE public.fortress_pool_distributions CASCADE;
TRUNCATE public.fortress_pool_rewards CASCADE;

-- Economy / Financial
TRUNCATE public.admin_revenue CASCADE;
TRUNCATE public.admin_expenses CASCADE;
TRUNCATE public.weekly_revenue_snapshots CASCADE;

-- Jackpot / Lottery
TRUNCATE public.jackpot_history CASCADE;
TRUNCATE public.jackpot_pools CASCADE;
TRUNCATE public.lottery_draws CASCADE;
TRUNCATE public.lottery_tickets CASCADE;
TRUNCATE public.lottery_winners CASCADE;
UPDATE public.jackpot SET amount = 0;
UPDATE public.jackpot_config SET value = '0' WHERE key IN ('jackpot_admin_balance','jackpot_treasury_balance');

-- Expedition / Hero pools
TRUNCATE public.hero_market_pool CASCADE;

-- Alliance war pools
TRUNCATE public.alliance_war_reserve_pool CASCADE;

-- Reset game economy settings
UPDATE public.game_settings SET value = '0' WHERE key IN (
  'monthly_pool_fxu',
  'expedition_pool_fxu', 
  'trading_pool_fxu',
  'jackpot_pool_fxu',
  'alliance_war_pool_fxu',
  'fortress_pool_fxu',
  'total_jackpot_fxu',
  'market_volume_usdt',
  'market_transactions_count'
);

-- Reset alliance economy
UPDATE public.alliances SET 
  resources_metal = 0,
  resources_crystal = 0,
  resources_deuterium = 0;
