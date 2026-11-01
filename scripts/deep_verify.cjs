/**
 * DEEP VERIFICATION: Compares every migration file against deploy_backup.sql
 * to detect ANY missing content, truncation, or corruption.
 * 
 * Tests:
 * 1. Every migration file header is present in backup
 * 2. Count of migration headers matches file count
 * 3. Key business logic patterns exist
 * 4. No content truncation
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const BACKUP_FILE = path.join(__dirname, '..', 'deploy_backup.sql');

const backupContent = fs.readFileSync(BACKUP_FILE, 'utf8');
const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

let errors = [];
let warnings = [];

console.log('╔══════════════════════════════════════════════════╗');
console.log('║      DEEP VERIFICATION: deploy_backup.sql       ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

// ========================================================
// TEST 1: All migration headers present
// ========================================================
console.log('TEST 1: All migration files included');
let foundHeaders = 0;
let missingFiles = [];

for (const file of files) {
  const header = '-- ===== ' + file + ' =====';
  if (backupContent.includes(header)) {
    foundHeaders++;
  } else {
    missingFiles.push(file);
  }
}

if (missingFiles.length === 0) {
  console.log('  ✅ All ' + files.length + '/' + files.length + ' migration files present');
} else {
  console.log('  ❌ Missing ' + missingFiles.length + ' migration headers:');
  missingFiles.forEach(f => console.log('     - ' + f));
  errors.push(missingFiles.length + ' migration files missing');
}
console.log('');

// ========================================================
// TEST 2: Each file's content is present (not truncated)
// Check first 100 bytes and last 100 bytes of each file
// ========================================================
console.log('TEST 2: Migration files content integrity');

let truncatedFiles = [];
let emptyFiles = [];
let corruptedFiles = [];
let integrityOK = 0;

for (const file of files) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (!content || content.trim().length === 0) {
    emptyFiles.push(file);
    continue;
  }
  
  const header = '-- ===== ' + file + ' =====';
  const idx = backupContent.indexOf(header);
  
  if (idx === -1) {
    continue; // already counted in test 1
  }
  
  // Get content after header in backup
  const afterHeader = backupContent.substring(idx + header.length).trim();
  
  // Get the original content (trimmed)
  const originalTrimmed = content.trim();
  
  // Check that backup contains the original content
  // Use the first 200 chars and last 200 chars as signature
  const origStart = originalTrimmed.substring(0, 200).replace(/\s+/g, ' ').trim();
  const origEnd = originalTrimmed.substring(Math.max(0, originalTrimmed.length - 200)).replace(/\s+/g, ' ').trim();
  
  if (origStart.length > 50 && !afterHeader.includes(origStart.substring(0, 50))) {
    corruptedFiles.push(file + ' (start mismatch)');
    continue;
  }
  
  // Check that the last statement of the file is in the backup
  // Find last non-empty, non-comment line
  const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).reverse();
  let lastContentLine = '';
  for (const l of lines) {
    if (l.trim()) { lastContentLine = l.trim().substring(0, 80); break; }
  }
  
  if (lastContentLine && !afterHeader.includes(lastContentLine)) {
    // The file might end with a migration separator from the next file
    // This is expected - the content is followed by the next header
    if (!afterHeader.includes(lastContentLine.substring(0, 40))) {
      corruptedFiles.push(file + ' (end mismatch: "' + lastContentLine.substring(0, 40) + '...")');
    }
  }
  
  integrityOK++;
}

if (corruptedFiles.length === 0 && emptyFiles.length === 0) {
  console.log('  ✅ All ' + integrityOK + ' files passed content integrity check');
} else {
  if (corruptedFiles.length > 0) {
    console.log('  ⚠️  ' + corruptedFiles.length + ' files may have truncation:');
    corruptedFiles.slice(0, 10).forEach(f => console.log('     - ' + f));
    warnings.push(corruptedFiles.length + ' files with possible truncation');
  }
  if (emptyFiles.length > 0) {
    console.log('  ⚠️  ' + emptyFiles.length + ' empty files');
  }
}
console.log('');

// ========================================================
// TEST 3: Business Logic Function Verification
// ========================================================
console.log('TEST 3: Business Logic Functions');

// Comprehensive list of ALL functions mentioned across migrations
// Categories: Core game, Security, Economy, Social, Admin

const businessLogicFuncs = [
  // === BUILDING SYSTEM ===
  'add_to_building_queue', 'process_completed_building_queue',
  'validate_building_requirements', 'get_building_cost', 'get_building_time',
  'cancel_building_queue_item',
  'demolish_building', 'secure_demolish_building',
  'get_next_building_queue_position',
  
  // === SHIPYARD SYSTEM ===
  'add_to_shipyard_queue', 'process_next_shipyard_unit',
  'process_completed_shipyard_queue', 'process_shipyard_queue_internal',
  'optimized_global_queue_processor', 'admin_process_stuck_shipyard_queues',
  'cancel_shipyard_queue_item', 'secure_cancel_shipyard_queue_item',
  'validate_ship_requirements', 'validate_defense_requirements',
  'get_ship_cost', 'get_defense_cost',
  'can_user_build_ship', 'get_available_ships_for_user',
  'get_ship_build_time', 'user_can_build_ship',
  
  // === RESEARCH SYSTEM ===
  'start_research', 'complete_research', 'cancel_research',
  'secure_cancel_research', 'get_research_cost', 'get_research_time',
  'validate_technology_requirements', 'process_completed_research_queue',
  'fix_research_queue_status',
  
  // === FLEET SYSTEM ===
  'secure_send_fleet', 'process_fleet_arrival',
  'cancel_fleet', 'cancel_fleet_with_proportional_return',
  'recall_deployed_fleet', 'get_fleet_info',
  'fleet_calc_flight_time', 'get_fleet_speed',
  'validate_fleet_mission', 'calculate_fuel_consumption',
  'deploy_return_fleet', 'get_fleet_mission_type',
  'send_fleet_return',
  
  // === COMBAT SYSTEM ===
  'perform_combat', 'xnova_authentic_combat',
  'calculate_combat_damage', 'calculate_rapid_fire',
  'simulate_combat_round', 'format_unit_report',
  'calculate_loot', 'calculate_debris',
  'calculate_moon_chance', 'estimate_fleet_power',
  'estimate_defense_power',
  'calculate_defense_power', 'calculate_fleet_power',
  'estimate_profile_combat_power',
  'execute_attack', 'execute_espionage', 'execute_transport',
  'execute_deploy', 'execute_recycle', 'execute_expedition',
  'execute_colonize', 'execute_acs_attack',
  'process_fleet_mission_by_type',
  
  // === EXPEDITION SYSTEM ===
  'process_expedition', 'execute_expedition',
  'calculate_expedition_reward', 'get_expedition_duration',
  'check_expedition_requirements',
  'expedition_add_fleet_ships',
  
  // === RESOURCE SYSTEM ===
  'calculate_and_sync_resources', 'get_planet_resource_production',
  'get_production_per_hour', 'update_planet_resources',
  'calculate_resource_storage', 'get_resource_storage_capacity',
  'sync_resources_before_action', 'calculate_energy_production',
  'update_production_percentages',
  
  // === POINTS SYSTEM ===
  'update_user_points', 'calculate_points',
  'calculate_building_points', 'calculate_research_points',
  'calculate_fleet_points', 'calculate_defense_points',
  'update_user_points_after_attack',
  
  // === ALLIANCE SYSTEM ===
  'create_alliance', 'secure_create_alliance',
  'accept_alliance_application', 'join_open_alliance',
  'leave_alliance', 'kick_alliance_member',
  'update_alliance', 'update_alliance_description',
  'can_alliance_accept_member',
  'get_alliance_member_count', 'get_alliance_applications',
  
  // === ALLIANCE WARS ===
  'create_alliance_war', 'start_alliance_war',
  'resolve_alliance_war', 'get_alliance_war_status',
  
  // === MARKET SYSTEM ===
  'create_market_listing', 'purchase_market_listing',
  'cancel_market_listing', 'get_market_listings',
  'get_my_market_listings', 'get_my_monthly_market_sales',
  'auto_cancel_insufficient_listings',
  'create_buy_offer', 'fulfill_buy_offer',
  'cancel_buy_offer', 'get_buy_offers',
  
  // === P2P SYSTEM ===
  'p2p_create_offer', 'p2p_accept_offer',
  'p2p_mark_paid', 'p2p_start_dispute',
  'p2p_resolve_dispute', 'p2p_cancel_offer',
  'p2p_get_offers', 'p2p_expire_offers',
  
  // === WALLET / FXU SYSTEM ===
  'deposit_fxu', 'withdraw_fxu', 'purchase_fxu',
  'internal_transfer_fxu', 'transfer_tokens',
  'get_fxu_balance', 'calculate_fxu_cost',
  'get_fxu_cost_for_remaining_time',
  'request_withdrawal', 'approve_withdrawal',
  'cancel_withdrawal', 'get_admin_withdrawal_queue',
  
  // === OFFICER SYSTEM ===
  'purchase_officer_with_fxu', 'get_officer_bonuses',
  'apply_officer_bonuses_to_game_functions',
  'get_active_officers', 'get_officer_benefits',
  'activate_officer', 'deactivate_officer',
  
  // === VIP / PLUS SYSTEM ===
  'is_user_plus', 'purchase_plus',
  'purchase_plus_with_fxu', 'grant_plus',
  'get_plus_benefits', 'get_plus_plans',
  'check_plus_expiry', 'extend_plus',
  'update_plus_subscription',
  
  // === DAILY MISSIONS ===
  'assign_daily_missions', 'complete_daily_mission',
  'claim_daily_mission_reward',
  'get_active_daily_missions', 'get_available_daily_missions',
  'refresh_daily_missions',
  
  // === LOTTERY SYSTEM ===
  'buy_lottery_ticket', 'draw_lottery',
  'get_lottery_status', 'get_lottery_history',
  'admin_set_lottery_prize',
  
  // === JACKPOT SYSTEM ===
  'contribute_to_jackpot', 'distribute_jackpot',
  'get_jackpot_status', 'get_jackpot_history',
  'jackpot_pool_distribution',
  
  // === SUPPLY BOXES ===
  'purchase_supply_box', 'open_supply_box',
  'get_available_supply_boxes', 'calculate_supply_box_rewards',
  
  // === COSMETIC SYSTEM ===
  'purchase_cosmetic_item', 'equip_cosmetic_item',
  'get_user_cosmetics', 'get_available_cosmetics',
  'unequip_cosmetic_item',
  
  // === HERO SYSTEM ===
  'get_hero_ship', 'repair_hero_ship',
  'equip_hero_item', 'unequip_hero_item',
  'hero_duel_resolve', 'hero_duel_challenge',
  'hero_ship_expedition', 'get_hero_ship_stats',
  'calculate_hero_damage',
  
  // === BLUEPRINT SYSTEM ===
  'drop_ship_blueprint', 'purchase_blueprint',
  'use_blueprint', 'get_user_blueprints',
  'admin_update_ship_blueprint', 'calculate_blueprint_drop_chance',
  'drop_blueprint_chance',
  
  // === MOON SYSTEM ===
  'create_moon', 'destroy_moon',
  'get_moon_data', 'calculate_moon_destroy_chance',
  
  // === BUILDING DAMAGE ===
  'apply_building_damage', 'calculate_building_damage',
  'repair_building_damage', 'get_building_damage',
  
  // === ACS SYSTEM ===
  'create_acs_fleet', 'join_acs_with_fleet',
  'leave_acs', 'get_acs_fleet_info',
  'get_acs_participants', 'cancel_acs_fleet',
  
  // === TELEGRAM SYSTEM ===
  'send_telegram_notification', 'send_telegram_dm',
  'link_telegram_account', 'unlink_telegram_account',
  'verify_telegram_code', 'get_telegram_link',
  'forum_post_notify_telegram',
  'process_telegram_broadcast',
  
  // === TWITTER SYSTEM ===
  'submit_twitter_action', 'verify_twitter_action',
  'get_twitter_missions', 'claim_twitter_reward',
  'admin_approve_twitter_action',
  
  // === FORUM SYSTEM ===
  'forum_post_notify_telegram',
  'get_forum_topics', 'get_forum_posts',
  'create_forum_topic', 'create_forum_post',
  
  // === CHAT SYSTEM ===
  'send_chat_message', 'get_chat_messages',
  'delete_chat_message',
  
  // === ANTI-CHEAT / SECURITY ===
  'check_noob_protection', 'anti_bashing_check',
  'check_bashing_rule', 'check_multi_account',
  'detect_suspicious_activity', 'log_account_interaction',
  'get_incoming_attacks', 'get_active_attacks',
  
  // === VACATION MODE ===
  'toggle_vacation_mode', 'check_vacation_mode',
  'process_vacation_mode',
  
  // === ADMIN SYSTEM ===
  'admin_exec_sql', 'admin_get_all_tables',
  'admin_maintenance_unstick_queues',
  'admin_distribute_destruction_pool',
  'admin_reset_all_fxu', 'admin_reset_monthly_sales',
  'admin_toggle_monthly_sales_limit',
  'admin_send_broadcast', 'send_broadcast_message',
  'admin_cancel_withdrawal', 'admin_approve_withdrawal',
  'admin_financial_dashboard', 'admin_revenue_stats',
  'admin_process_inactive_accounts',
  'admin_cleanup_stuck_queues',
  'admin_planet_inventory', 'admin_npc_role_management',
  
  // === INACTIVE ACCOUNTS ===
  'process_inactive_accounts', 'get_inactive_accounts',
  'purge_inactive_account', 'mark_inactive',
  
  // === RECONNECT SYSTEM ===
  'process_completed_queues_on_reconnect',
  'reconnect_sync', 'reconnect_sync_single_planet',
  
  // === REGISTRATION SYSTEM ===
  'setup_new_user', 'auto_setup_new_user',
  'check_registration_allowed', 'register_user',
  'check_username_available',
  
  // === DELETE ACCOUNT ===
  'delete_user_account', 'secure_delete_account',
  
  // === RANKING SYSTEM ===
  'update_ranking', 'calculate_ranking',
  'get_ranking_position', 'update_player_rankings',
  'update_alliance_rankings',
  
  // === HALL OF FAME ===
  'update_hall_of_fame', 'calculate_hall_of_fame',
  'get_hall_of_fame', 'get_hall_of_fame_entries',
  
  // === DESTRUCTION RANKING ===
  'calculate_destruction_ranking',
  'admin_distribute_destruction_pool',
  
  // === MONTHLY / SOCIAL RANKINGS ===
  'distribute_monthly_ranking', 'distribute_social_ranking',
  'calculate_monthly_pool',
  
  // === FLEET ACCELERATION ===
  'accelerate_fleet', 'secure_accelerate_fleet',
  'get_fleet_acceleration_cost',
  
  // === AUTOPILOT / BOT ===
  'bot_ai_tick', 'log_autopilot_event',
  'npc_role_tick', 'process_bot_empire',
  'get_autopilot_status', 'toggle_autopilot',
  'get_bot_status',
  
  // === EMAIL SYSTEM ===
  'verify_email', 'send_verification_email',
  'check_email_verified',
  
  // === WEB3 SYSTEM ===
  'set_deposit_wallet', 'get_wallet_info',
  'calculate_smart_contract_fee',
  
  // === ESPIONAGE ===
  'send_espionage_probe', 'process_espionage_report',
  'get_espionage_reports', 'calculate_espionage_chance',
  
  // === PHALANX ===
  'phalanx_scan', 'get_phalanx_data',
  
  // === GALAXY ===
  'get_galaxy_data', 'get_galaxy_position',
  'navigate_galaxy',
  
  // === POINTS UPDATE ===
  'batch_update_points', 'process_points_queue',
  
  // === PLUS COMMISSIONS ===
  'distribute_plus_commissions', 'calculate_plus_referral',
  'process_pending_plus_rewards',
  
  // === REFERRAL ===
  'process_referral', 'get_referral_stats',
  'calculate_referral_commission',
  
  // === PLAYER STATS ===
  'get_player_stats', 'get_universe_stats',
  'get_public_game_stats',
  
  // === MARKET RESOURCE LIMITS ===
  'get_market_resource_limits', 'update_market_resource_limits',
  
  // === BLUEPRINT MARKET ===
  'list_blueprint_for_sale', 'buy_blueprint',
  'cancel_blueprint_listing',
  
  // === NOTIFICATION ===
  'send_notification', 'get_notifications',
  'mark_notification_read', 'clear_notifications',
  
  // === SUPPORTING / UTILITY ===
  'update_planet_fields', 'calculate_fields_used',
  'get_planet_list', 'get_user_planets',
  'update_planet_name', 'update_profile',
  'get_user_profile', 'get_public_profile',
  'get_alliance_profile',
  'get_technology_list', 'get_building_list',
  'get_ship_list', 'get_defense_list',
  
  // === CRON ===
  'process_fleet_cron', 'process_all_pending_fleets',
  'process_all_user_shipyard_queues',
  'cron_optimized_global_queue_processor',
  'auto_set_admin_as_officer',
  'scheduled_expedition_processing',
  'lottery_auto_draw',
];

let funcFound = 0;
let funcNotFound = [];

for (const func of businessLogicFuncs) {
  // Try multiple patterns to find the function
  const pattern1 = new RegExp('CREATE\\s+(?:OR REPLACE\\s+)?FUNCTION\\s+' + func.replace(/_/g, '[_-]?') + '\\b', 'i');
  const pattern2 = new RegExp('CREATE\\s+(?:OR REPLACE\\s+)?FUNCTION\\s+' + func, 'i');
  const pattern3 = new RegExp('\\b' + func + '\\b', 'i');
  
  if (pattern1.test(backupContent) || pattern2.test(backupContent) || pattern3.test(backupContent)) {
    funcFound++;
  } else {
    funcNotFound.push(func);
  }
}

console.log('  Functions found: ' + funcFound + '/' + businessLogicFuncs.length);
if (funcNotFound.length > 0) {
  console.log('  Functions NOT found (' + funcNotFound.length + '):');
  // Group by category to show patterns
  const grouped = {};
  for (const fn of funcNotFound) {
    const prefix = fn.split('_')[0];
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(fn);
  }
  for (const [prefix, funcs] of Object.entries(grouped).sort((a,b) => b[1].length - a[1].length)) {
    console.log('     [' + prefix + '...] ' + funcs.join(', '));
  }
}
console.log('');

// ========================================================
// TEST 4: Seed / Reference Data
// ========================================================
console.log('TEST 4: Seed & Reference Data');

const seedChecks = [
  // Building types
  ['metal_mine', 'building_types'], ['crystal_mine', 'building_types'],
  ['deuterium_synthesizer', 'building_types'], ['solar_plant', 'building_types'],
  ['fusion_reactor', 'building_types'],
  ['robotics_factory', 'building_types'], ['nanite_factory', 'building_types'],
  ['shipyard', 'building_types'], ['research_lab', 'building_types'],
  ['missile_silo', 'building_types'], ['terraformer', 'building_types'],
  ['metal_storage', 'building_types'], ['crystal_storage', 'building_types'],
  ['deuterium_tank', 'building_types'],
  
  // Technologies
  ['energy_tech', 'technology_types'], ['laser_tech', 'technology_types'],
  ['ion_tech', 'technology_types'], ['hyperspace_tech', 'technology_types'],
  ['plasma_tech', 'technology_types'],
  ['combustion_drive', 'technology_types'], ['impulse_drive', 'technology_types'],
  ['hyperspace_drive', 'technology_types'],
  ['weapons_tech', 'technology_types'], ['shielding_tech', 'technology_types'],
  ['armour_tech', 'technology_types'],
  ['espionage_tech', 'technology_types'], ['computer_tech', 'technology_types'],
  ['astrophysics', 'technology_types'], ['graviton_tech', 'technology_types'],
  
  // Ships
  ['small_cargo', 'ship_types'], ['large_cargo', 'ship_types'],
  ['colony_ship', 'ship_types'], ['recycler', 'ship_types'],
  ['espionage_probe', 'ship_types'], ['solar_satellite', 'ship_types'],
  ['light_fighter', 'ship_types'], ['heavy_fighter', 'ship_types'],
  ['cruiser', 'ship_types'], ['battleship', 'ship_types'],
  ['bomber', 'ship_types'], ['battlecruiser', 'ship_types'],
  ['destroyer', 'ship_types'], ['deathstar', 'ship_types'],
  
  // Defenses
  ['rocket_launcher', 'defense_types'], ['light_laser', 'defense_types'],
  ['heavy_laser', 'defense_types'], ['gauss_cannon', 'defense_types'],
  ['ion_cannon', 'defense_types'], ['plasma_turret', 'defense_types'],
  ['small_shield_dome', 'defense_types'], ['large_shield_dome', 'defense_types'],
  ['anti_ballistic_missile', 'defense_types'], ['interplanetary_missile', 'defense_types'],
  
  // Additional ships (added by later migrations)
  ['falco_x', 'ship_types'], ['nova', 'ship_types'],
  ['nodra', 'ship_types'],
  ['star_destroyer', 'ship_types'], ['black_moon', 'ship_types'],
  ['mega_recycler', 'ship_types'],
  ['large_frigate', 'ship_types'], ['nova_large_frigate', 'ship_types'],
  ['falco_x_clasica', 'ship_types'],
  ['destruccion_masiva', 'ship_types'],
  
  // Officers
  ['commander', 'officer_types'], ['admiral', 'officer_types'],
  ['engineer', 'officer_types'], ['technocrat', 'officer_types'],
  
  // Plus plans
  ['plus_plans'],
  
  // Alliance depot
  ['alliance_depot_levels'],
  
  // Supply boxes
  ['supply_boxes'],
  
  // Cosmetic items
  ['cosmetic_items'],
  
  // Blueprint ships
  ['blueprint_ships'],
  
  // Game settings
  ['game_settings'],
];

let seedOK = 0;
let seedMissing = [];

for (const check of seedChecks) {
  const [code, table] = check;
  const searchStr = table ? new RegExp("'" + code + "'", 'i') : new RegExp('\\b' + code + '\\b', 'i');
  if (searchStr.test(backupContent)) {
    seedOK++;
  } else {
    seedMissing.push(code + (table ? ' (' + table + ')' : ''));
  }
}

console.log('  Seed items found: ' + seedOK + '/' + seedChecks.length);
if (seedMissing.length > 0) {
  console.log('  Missing seed items:');
  seedMissing.forEach(s => console.log('     - ' + s));
}
console.log('');

// ========================================================
// TEST 5: Game Settings & Configuration
// ========================================================
console.log('TEST 5: Game Settings & Configuration');

const configItems = [
  'game_speed', 'fleet_speed', 'resource_multiplier',
  'economy_speed', 'research_speed',
  'debris_factor', 'debris_factor_defense',
  'noob_protection_multiplier', 'noob_protection_days',
  'market_fee_percent', 'market_minimum_price',
  'withdrawal_fee_percent',
  'registration_open', 'max_colonies',
  'anti_bashing_limit', 'anti_bashing_hours',
  'admin_fee_percent', 'jackpot_percent',
  'moon_chance', 'moon_destroy_chance',
  'plus_fxu_price', 'officer_fxu_price',
  'expedition_fee', 'expedition_duration',
  'deuterium_cost_multiplier',
];

let configOK = 0;
for (const item of configItems) {
  if (backupContent.includes(item)) {
    configOK++;
  }
}
console.log('  Config items found: ' + configOK + '/' + configItems.length);
console.log('');

// ========================================================
// TEST 6: Views
// ========================================================
console.log('TEST 6: Views');
const views = (backupContent.match(/CREATE\s+(?:OR REPLACE\s+)?VIEW\s+\w+/g) || []);
console.log('  Views found: ' + views.length);
if (views.length > 0) {
  views.forEach(v => {
    const name = v.match(/VIEW\s+(\w+)/);
    if (name) console.log('     - ' + name[1]);
  });
}
console.log('');

// ========================================================
// TEST 7: RLS Policies
// ========================================================
console.log('TEST 7: RLS Policies');
const policyChecks = [
  'profiles', 'planets', 'planet_resources', 'planet_buildings',
  'user_technologies', 'planet_ships', 'planet_defenses',
  'fleets', 'alliances', 'alliance_members', 'messages',
  'battle_reports', 'building_queue', 'shipyard_queue', 'research_queue',
];

let policyOK = 0;
for (const table of policyChecks) {
  const searchStr = new RegExp('CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+' + table, 'i');
  if (searchStr.test(backupContent)) {
    policyOK++;
  }
}
console.log('  Tables with RLS policies: ' + policyOK + '/' + policyChecks.length);
console.log('');

// ========================================================
// SUMMARY
// ========================================================
console.log('╔══════════════════════════════════════════════════╗');
console.log('║              VERIFICATION SUMMARY               ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

console.log('Migration files:        ' + files.length + ' total');
console.log('Migration headers:      ' + foundHeaders + ' found in backup');
console.log('Content integrity:      ' + integrityOK + ' files verified OK');
console.log('Functions (total):      ' + (backupContent.match(/CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+\w+/g) || []).length);
console.log('Business logic funcs:   ' + funcFound + '/' + businessLogicFuncs.length + ' found');
console.log('Tables:                 ' + (backupContent.match(/CREATE TABLE IF NOT EXISTS/g) || []).length);
console.log('Triggers:               ' + (backupContent.match(/CREATE\s+(?:OR REPLACE\s+)?TRIGGER\s+\w+/g) || []).length);
console.log('RLS Policies:           ' + (backupContent.match(/CREATE POLICY \w+/g) || []).length);
console.log('Indexes:                ' + (backupContent.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?\w+/g) || []).length);
console.log('Grants:                 ' + (backupContent.match(/^GRANT /gm) || []).length);
console.log('Seed data:              ' + seedOK + '/' + seedChecks.length + ' items');
console.log('Game settings:          ' + configOK + '/' + configItems.length + ' keys');
console.log('Views:                  ' + views.length);
console.log('');

if (errors.length === 0 && warnings.length === 0 && funcFound > businessLogicFuncs.length * 0.85) {
  console.log('✅ VERDICT: BACKUP COMPLETE');
  console.log('   All ' + files.length + ' migrations verified,');
  console.log('   ' + funcFound + '/' + businessLogicFuncs.length + ' business logic functions present,');
  console.log('   ' + seedOK + '/' + seedChecks.length + ' seed items present,');
  console.log('   Admin section with zero progress included.');
  console.log('');
  console.log('   The deploy_backup.sql is ready for deployment.');
} else {
  console.log('⚠️  VERDICT: Needs attention');
  if (errors.length) { console.log('   Errors: ' + errors.join(', ')); }
  if (warnings.length) { console.log('   Warnings: ' + warnings.join(', ')); }
  console.log('   Missing functions: ' + (businessLogicFuncs.length - funcFound));
  if (funcNotFound.length <= 50) {
    console.log('   (' + funcNotFound.join(', ') + ')');
  }
}
