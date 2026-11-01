-- ===================================================================
-- RESET GAME PROGRESS - All accounts back to 0
-- ===================================================================
BEGIN;

-- 1. Set starting TUNG to 0 for new accounts
INSERT INTO game_settings (key, value) VALUES ('test_starting_fxu', '0')
ON CONFLICT (key) DO UPDATE SET value = '0';

-- 2. Clear all queues
DELETE FROM building_queue;
DELETE FROM shipyard_queue;
DELETE FROM research_queue;
DELETE FROM points_update_queue;

-- 3. Remove all buildings, ships, defenses, research
DELETE FROM planet_buildings;
DELETE FROM planet_ships;
DELETE FROM planet_defenses;
DELETE FROM user_technologies;
DELETE FROM user_ship_blueprints;
DELETE FROM user_officers;
DELETE FROM user_cosmetics;

-- 4. Reset planet resources to starting values (500 metal, 500 crystal, 0 deuterium)
UPDATE planet_resources SET metal = 500, crystal = 500, deuterium = 0, dark_matter = 0, energy_used = 0;

-- 5. Reset fleets
DELETE FROM fleet_ships;
DELETE FROM fleets;
DELETE FROM acs_fleets;
DELETE FROM acs_participants;

-- 6. Clear market
DELETE FROM market_listings;
DELETE FROM market_transactions;
DELETE FROM market_buy_offers;
DELETE FROM market_monthly_sales;

-- 7. Clear P2P
DELETE FROM p2p_offers;
DELETE FROM p2p_orders;
DELETE FROM p2p_messages;
DELETE FROM p2p_disputes;
DELETE FROM p2p_audit_log;
DELETE FROM p2p_ratings;
DELETE FROM p2p_user_payment_methods;

-- 8. Clear messages and reports
DELETE FROM messages;
DELETE FROM battle_reports;
DELETE FROM attack_log;
DELETE FROM debris_fields;
DELETE FROM login_sessions;
DELETE FROM public_chat_messages;

-- 9. Clear forums
DELETE FROM forum_posts;
DELETE FROM forum_topics;

-- 10. Reset wallet balances to 0
DELETE FROM wallet_transactions;
UPDATE user_wallets SET tung_balance = 0, bnb_balance = 0, usdt_balance = 0;

-- 11. Reset profiles to 0 points
UPDATE profiles SET 
  points_total = 0,
  points_buildings = 0,
  points_research = 0,
  points_fleet = 0,
  points_defense = 0,
  points_ranking = 0,
  dark_matter = 0,
  fxu_balance = 0;

-- 12. Reset planets fields_used and destroy fields
UPDATE planets SET fields_used = 0;

-- 13. Reset jackpot
UPDATE jackpot SET amount = 0;
DELETE FROM jackpot_history;
DELETE FROM lottery_tickets;
DELETE FROM lottery_winners;
DELETE FROM lottery_draws;

-- 14. Clear expeditions
DELETE FROM supply_boxes;
DELETE FROM supply_box_purchases;

-- 15. Reset ranking rewards (already distributed)
DELETE FROM monthly_ranking_rewards;
DELETE FROM destruction_ranking_rewards;
DELETE FROM social_ranking_rewards;
DELETE FROM plus_commission_rewards;
DELETE FROM referral_commissions;

-- 16. Clear alliance stuff (keep alliances but remove members)
DELETE FROM alliance_applications;
DELETE FROM alliance_diplomacy;
DELETE FROM alliance_war_entries;
DELETE FROM alliance_war_battle_log;
DELETE FROM alliance_war_scores;
DELETE FROM alliance_war_reserve_pool;
DELETE FROM alliance_war_hall_of_fame;
DELETE FROM alliance_wars;
-- Keep alliance_members so alliances exist, but reset points
UPDATE alliances SET points_total = 0;

-- 17. Clear internal transfers
DELETE FROM internal_transfers;

-- 18. Clear weekly snapshots
DELETE FROM weekly_revenue_snapshots;

COMMIT;
