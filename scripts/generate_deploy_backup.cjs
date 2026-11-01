/**
 * Generates a deployable backup by concatenating ALL migration files in order,
 * then adding cleanup SQL to remove ALL user data and set up the admin account.
 * This preserves 100% of the original migration logic.
 * 
 * REFERENCE/SEED TABLES (NEVER truncated):
 * - building_types, technology_types, ship_types, defense_types, officer_types
 * - game_settings, plus_plans, supply_boxes, cosmetic_items
 * - building/tech/ship/defense_requirements
 * - galaxy_positions, wallet_config, admin_config, admin_*_settings
 * - game_rounds, telegram_*, twitter_social_config
 * - market_notification_config, market_resource_limits
 * - p2p_payment_methods, p2p_notification_config
 * - expedition_blueprint_drop_config
 * - ship_blueprints (catalog), hero_ship_items (catalog)
 * - hero_market_pool (shared pool, resets to 0)
 * - alliance_war_reserve_pool (shared pool, resets to 0)
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const OUTPUT_FILE = path.join(__dirname, '..', 'deploy_backup.sql');

// ALL user data / game state / history tables (to be TRUNCATED)
// Ordered by dependency: children first, parents last
const USER_TABLES_TRUNCATE_ORDER = [
  // --- Fleet/Mission children ---
  'fleet_acceleration_log',
  'fleet_restoration_log',
  'fleet_ships',
  'fleets',
  
  // --- Battle/Espionage ---
  'battle_reports',
  'espionage_reports',
  'attack_log',
  
  // --- Queue children ---
  'building_queue',
  'shipyard_queue',
  'research_queue',
  
  // --- Planet children ---
  'planet_ships',
  'planet_defenses',
  'planet_buildings',
  'planet_resources',
  'planet_inventory',
  'planets',
  
  // --- User profile children ---
  'user_technologies',
  'user_officers',
  'user_wallets',
  'user_settings',
  'user_sessions',
  'user_cosmetics',
  'user_daily_missions',
  'user_active_bonuses',
  'user_blueprints',
  'user_ship_blueprints',
  'user_hero_ship_inventory',
  'user_hero_ships',
  'user_hero_ship_equipment',
  'hero_ship_equipment',
  'hero_ship_active_expedition',
  'hero_ship_expeditions',
  'hero_duels',
  'hero_item_market_listings',
  'profiles',
  
  // --- Alliance children ---
  'alliance_members',
  'alliance_applications',
  'alliance_diplomacy',
  'alliance_wars',
  'alliance_war_entries',
  'alliance_war_scores',
  'alliance_war_battle_log',
  'alliance_war_hall_of_fame',
  'alliances',
  
  // --- ACS ---
  'acs_fleets',
  'acs_participants',
  
  // --- Messages/Chat ---
  'messages',
  'chat_messages',
  'public_chat_messages',
  'forum_posts',
  'forum_topics',
  'broadcast_messages',
  'notifications',
  'notification_preferences',
  
  // --- Market ---
  'market_listings',
  'market_transactions',
  'market_purchases',
  'buy_offers',
  'market_buy_offers',
  'market_monthly_sales',
  'market_sales_weekly',
  
  // --- P2P ---
  'p2p_offers',
  'p2p_orders',
  'p2p_transactions',
  'p2p_disputes',
  'p2p_messages',
  'p2p_chat_messages',
  'p2p_evidence',
  'p2p_ratings',
  'p2p_reputation',
  'p2p_audit_log',
  'p2p_user_payment_methods',
  
  // --- Admin/Revenue ---
  'admin_revenue',
  'admin_expenses',
  'admin_withdrawals',
  'wallet_transactions',
  'internal_transfers',
  'revenue_time_series',
  'weekly_revenue_snapshots',
  'admin_account_deletions',
  
  // --- Daily Missions ---
  'user_daily_missions',
  
  // --- Referrals ---
  'referral_commissions',
  'referral_links',
  'referral_stats',
  
  // --- Lottery ---
  'lottery_tickets',
  'lottery_entries',
  'lottery_draws',
  'lottery_winners',
  
  // --- Jackpot ---
  'jackpot_contributions',
  'jackpot_history',
  
  // --- Ranking/Distributions ---
  'hall_of_fame',
  'hall_of_fame_entries',
  'hall_of_fame_players',
  'hall_of_fame_alliances',
  'hall_of_fame_records',
  'monthly_pool_distributions',
  'monthly_ranking_distributions',
  'monthly_ranking_rewards',
  'plus_commission_distributions',
  'plus_commission_rewards',
  'plus_pending_rewards',
  'plus_subscriptions',
  'plus_purchases',
  'social_ranking_distributions',
  'social_ranking_rewards',
  'destruction_ranking_distributions',
  'destruction_ranking_rewards',
  'points_update_queue',
  
  // --- Logs/Audit ---
  'account_interaction_log',
  'anti_multiaccount_log',
  'multiaccounting_reports',
  'autopilot_events',
  'bot_activity_log',
  'expedition_log',
  'expedition_results',
  'expedition_blueprint_drops',
  'inactive_account_log',
  'login_sessions',
  'email_verification_tokens',
  'suspicious_accounts',
  
  // --- Telegram ---
  'telegram_links',
  'telegram_notifications',
  
  // --- Twitter ---
  'twitter_links',
  'twitter_missions',
  'twitter_actions',
  'twitter_tasks',
  
  // --- Purchases/Cosmetics ---
  'officer_purchases',
  'cosmetic_purchases',
  'supply_box_purchases',
  
  // --- Misc ---
  'blueprint_market_escrow',
  'debris_fields',
  'statements',
  'points_update_queue',
];

function main() {
  console.log('Reading migration files...');
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  console.log('Found ' + files.length + ' migration files');
  
  const out = [];
  out.push('-- ============================================');
  out.push('-- DEPLOY BACKUP - Falco-Xnova Universe');
  out.push('-- Generated: ' + new Date().toISOString());
  out.push('-- All migrations in order + cleanup + admin');
  out.push('-- Preserves 100% of game logic, functions, triggers');
  out.push('-- Removes ALL user data, game state, logs');
  out.push('-- Only admin account (falcoxcorp) remains with zero progress');
  out.push('-- ============================================');
  out.push('');
  
  // Step 1: Insert all migration files in order
  console.log('Concatenating migrations...');
  for (const file of files) {
    out.push('-- ===== ' + file + ' =====');
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    out.push(content);
    out.push('');
  }
  
  // Step 2: Cleanup section - truncate ALL user data
  console.log('Adding cleanup section...');
  out.push('-- ============================================');
  out.push('-- CLEANUP - Remove ALL user data and game state');
  out.push('-- ALL progress reset to zero');
  out.push('-- Reference/seed tables preserved intact');
  out.push('-- ============================================');
  out.push('');
  
  // Disable triggers and RLS during cleanup
  out.push('SET session_replication_role = replica;');
  out.push('');
  
  let truncateCount = 0;
  const alreadyTruncated = new Set();
  
  for (const t of USER_TABLES_TRUNCATE_ORDER) {
    if (!alreadyTruncated.has(t)) {
      alreadyTruncated.add(t);
      out.push('DO $$ BEGIN TRUNCATE TABLE "' + t + '" CASCADE; EXCEPTION WHEN undefined_table THEN NULL; END $$;');
      truncateCount++;
    }
  }
  
  out.push('');
  out.push('SET session_replication_role = origin;');
  out.push('');
  
  // Step 3: Reset sequences for reference tables to their MAX(id) 
  // (safe because seed data was already inserted during migrations)
  console.log('Adding sequence fixes...');
  out.push('-- Reset reference table sequences to MAX(id)');
  out.push("SELECT setval('building_types_id_seq', COALESCE((SELECT MAX(id) FROM building_types), 1));");
  out.push("SELECT setval('technology_types_id_seq', COALESCE((SELECT MAX(id) FROM technology_types), 1));");
  out.push("SELECT setval('ship_types_id_seq', COALESCE((SELECT MAX(id) FROM ship_types), 1));");
  out.push("SELECT setval('defense_types_id_seq', COALESCE((SELECT MAX(id) FROM defense_types), 1));");
  out.push("SELECT setval('officer_types_id_seq', COALESCE((SELECT MAX(id) FROM officer_types), 1));");
  out.push('');
  
  // Step 3b: Reset pool/state tables to zero (don't truncate — they need their init rows)
  console.log('Resetting pool balances to 0...');
  out.push('-- Reset pool tables to zero (preserve init rows)');
  out.push("UPDATE hero_market_pool SET balance = 0, total_contributed = 0;");
  out.push("UPDATE alliance_war_reserve_pool SET amount_fxu = 0;");
  out.push("UPDATE jackpot SET balance = 0;");
  out.push("UPDATE jackpot_pools SET expedition_balance = 0, expedition_total = 0, monthly_balance = 0, monthly_total = 0, plus_balance = 0, plus_total = 0;");
  out.push('');
  
  // Step 4: Admin account setup - ZERO PROGRESS
  console.log('Adding admin account setup...');
  out.push('-- ============================================');
  out.push('-- ADMIN ACCOUNT - ZERO PROGRESS');
  out.push('-- ============================================');
  out.push('');
  out.push('-- Create admin user in auth.users if not exists');
  out.push('INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)');
  out.push("SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',");
  out.push("'falcoxcorp@admin.com', '', now(), '{\"provider\":\"email\",\"providers\":[\"email\"]}',");
  out.push("'{\"username\":\"falcoxcorp\"}', now(), now()");
  out.push("WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'falcoxcorp@admin.com');");
  out.push('');
  out.push('-- Create admin profile with ZERO stats');
  out.push('INSERT INTO profiles (id, username, email, dark_matter, points_total, points_buildings, points_research, points_fleet, points_defense, is_admin, is_banned, vacation_mode, last_activity, created_at, updated_at)');
  out.push("SELECT id, 'falcoxcorp', 'falcoxcorp@admin.com', 0, 0, 0, 0, 0, 0, true, false, false, now(), now(), now()");
  out.push("FROM auth.users WHERE email = 'falcoxcorp@admin.com'");
  out.push("AND NOT EXISTS (SELECT 1 FROM profiles WHERE username = 'falcoxcorp');");
  out.push('');
  out.push('-- Create admin main planet (galaxy 1, system 1, position 1)');
  out.push('INSERT INTO planets (user_id, name, galaxy, solar_system, position, planet_type, diameter, fields_used, fields_max, temp_min, temp_max, is_main_planet)');
  out.push("SELECT id, 'Planeta Admin', 1, 1, 1, 'planet', 16300, 0, 163, -40, 30, true");
  out.push("FROM profiles WHERE username = 'falcoxcorp'");
  out.push("AND NOT EXISTS (SELECT 1 FROM planets WHERE user_id = (SELECT id FROM profiles WHERE username = 'falcoxcorp') AND is_main_planet = true);");
  out.push('');
  out.push('-- Give 10k starting resources to admin planet');
  out.push('INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, energy, last_update)');
  out.push("SELECT id, 10000, 10000, 10000, 0, now()");
  out.push("FROM planets WHERE user_id = (SELECT id FROM profiles WHERE username = 'falcoxcorp') AND is_main_planet = true");
  out.push("AND NOT EXISTS (SELECT 1 FROM planet_resources WHERE planet_id = planets.id);");
  out.push('');
  
  out.push('-- ============================================');
  out.push('-- DEPLOY BACKUP COMPLETE');
  out.push('-- ============================================');
  out.push('');
  
  // Write output
  fs.writeFileSync(OUTPUT_FILE, out.join('\n'), 'utf8');
  
  const stats = fs.statSync(OUTPUT_FILE);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const lines = out.join('\n').split('\n').length;
  console.log('');
  console.log('=== GENERATION COMPLETE ===');
  console.log('File:        ' + OUTPUT_FILE);
  console.log('Size:        ' + sizeMB + ' MB');
  console.log('Lines:       ' + lines);
  console.log('Migrations:  ' + files.length);
  console.log('Tables truncated: ' + truncateCount);
  console.log('');
}

main();
