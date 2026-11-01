-- Reset VPS game - individual statements
INSERT INTO game_settings (key, value) VALUES ('test_starting_fxu', '0') ON CONFLICT (key) DO UPDATE SET value = '0';
TRUNCATE building_queue, shipyard_queue, research_queue, points_update_queue CASCADE;
TRUNCATE fleet_ships, fleets, acs_fleets, acs_participants CASCADE;
TRUNCATE planet_buildings, planet_ships, planet_defenses, user_technologies CASCADE;
TRUNCATE market_listings, market_transactions, market_buy_offers CASCADE;
TRUNCATE p2p_offers, p2p_orders, p2p_messages, p2p_disputes CASCADE;
TRUNCATE messages, battle_reports, attack_log, debris_fields CASCADE;
TRUNCATE wallet_transactions CASCADE;
TRUNCATE login_sessions, public_chat_messages CASCADE;
TRUNCATE lottery_tickets, lottery_winners, lottery_draws CASCADE;
TRUNCATE monthly_ranking_rewards, referral_commissions CASCADE;
TRUNCATE internal_transfers CASCADE;
UPDATE planet_resources SET metal = 500, crystal = 500, deuterium = 0, energy_used = 0;
UPDATE planets SET fields_used = 0;
UPDATE profiles SET points_total = 0, points_buildings = 0, points_research = 0, points_fleet = 0, points_defense = 0, dark_matter = 0, fxu_balance = 0, tung_balance = 0;
UPDATE alliances SET points_total = 0;
