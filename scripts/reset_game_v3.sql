-- Reset VPS - with schema prefix
INSERT INTO public.game_settings (key, value) VALUES ('test_starting_fxu', '0') ON CONFLICT (key) DO UPDATE SET value = '0';
TRUNCATE public.building_queue, public.shipyard_queue, public.research_queue, public.points_update_queue CASCADE;
TRUNCATE public.fleet_ships, public.fleets, public.acs_fleets, public.acs_participants CASCADE;
TRUNCATE public.planet_buildings, public.planet_ships, public.planet_defenses, public.user_technologies CASCADE;
TRUNCATE public.market_listings, public.market_transactions, public.market_buy_offers CASCADE;
TRUNCATE public.p2p_offers, public.p2p_orders, public.p2p_messages, public.p2p_disputes CASCADE;
TRUNCATE public.messages, public.battle_reports, public.attack_log, public.debris_fields CASCADE;
TRUNCATE public.wallet_transactions CASCADE;
TRUNCATE public.login_sessions, public.public_chat_messages CASCADE;
TRUNCATE public.lottery_tickets, public.lottery_winners, public.lottery_draws CASCADE;
TRUNCATE public.monthly_ranking_rewards, public.referral_commissions CASCADE;
TRUNCATE public.internal_transfers CASCADE;
UPDATE public.planet_resources SET metal = 500, crystal = 500, deuterium = 0, energy_used = 0;
UPDATE public.planets SET fields_used = 0;
UPDATE public.profiles SET points_total = 0, points_buildings = 0, points_research = 0, points_fleet = 0, points_defense = 0, dark_matter = 0, fxu_balance = 0, tung_balance = 0;
UPDATE public.alliances SET points_total = 0;
