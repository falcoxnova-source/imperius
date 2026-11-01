/**
 * Comprehensive verification of deploy_backup.sql
 * Checks all critical game systems, functions, tables, etc.
 */

const fs = require('fs');

const content = fs.readFileSync('deploy_backup.sql', 'utf8');
const lines = content.split('\n');
console.log('File: deploy_backup.sql');
console.log('Total lines: ' + lines.length);
console.log('File size: ' + (fs.statSync('deploy_backup.sql').size / 1024 / 1024).toFixed(2) + ' MB');
console.log('');

// Count migrations
const migrationMatches = content.match(/-- ===== (\d{14,}_.+?) =====/g);
console.log('Migrations included: ' + (migrationMatches ? migrationMatches.length : 0));

// =============================================
// 1. CRITICAL FUNCTIONS CHECK
// =============================================
console.log('=== 1. CRITICAL FUNCTIONS ===');

const criticalFunctions = [
  // Core game functions
  'secure_send_fleet', 'process_fleet_arrival', 'perform_combat',
  'fleet_calc_flight_time', 'cancel_fleet', 'recall_deployed_fleet',
  
  // Building / queue
  'add_to_building_queue', 'process_completed_building_queue', 'validate_building_queue',
  'process_next_building_unit', 'cancel_building_queue_item',
  'add_to_shipyard_queue', 'process_next_shipyard_unit', 'cancel_shipyard_queue_item',
  'process_shipyard_queue_internal', 'optimized_global_queue_processor',
  'start_research', 'complete_research', 'cancel_research',
  
  // Authentication & security
  'check_noob_protection', 'anti_bashing_check', 'can_user_build_ship', 'can_alliance_accept_member',
  'validate_building_requirements', 'validate_technology_requirements', 'validate_ship_requirements',
  
  // Combat
  'perform_combat', 'xnova_authentic_combat', 'calculate_combat_damage',
  'estimate_fleet_power', 'estimate_defense_power', 'estimate_profile_combat_power',
  
  // Fleet missions
  'deploy_mission', 'transport_mission', 'attack_mission', 'espionage_mission',
  'recycle_mission', 'colonize_mission', 'expedition_mission',
  
  // Expedition
  'process_expedition', 'execute_expedition',
  
  // Alliance
  'create_alliance', 'accept_alliance_application', 'join_open_alliance',
  'leave_alliance', 'kick_alliance_member', 'update_alliance',
  'create_alliance_war', 'alliance_war_tick',
  
  // Economy
  'calculate_and_sync_resources', 'update_user_points', 'calculate_points',
  'get_planet_resource_production',
  
  // FXU / economy
  'purchase_fxu', 'transfer_fxu', 'deposit_fxu', 'withdraw_fxu',
  'purchase_officer_with_fxu', 'purchase_plus_with_fxu',
  'instant_complete_building', 'instant_complete_research', 'instant_complete_shipyard',
  
  // Market
  'create_market_listing', 'purchase_market_listing', 'cancel_market_listing',
  'create_buy_offer', 'fulfill_buy_offer',
  
  // P2P
  'p2p_create_offer', 'p2p_accept_offer', 'p2p_mark_paid', 'p2p_start_dispute',
  
  // Daily missions
  'assign_daily_missions', 'complete_daily_mission', 'claim_daily_mission',
  
  // Bot / NPC
  'bot_ai_tick', 'npc_role_tick', 'log_autopilot_event',
  
  // VIP / Plus
  'is_user_plus', 'purchase_plus', 'grant_plus',
  
  // Hero ship
  'get_hero_ship', 'repair_hero_ship', 'equip_hero_item', 'hero_duel_resolve',
  
  // Blueprint
  'drop_ship_blueprint', 'purchase_blueprint', 'use_blueprint',
  
  // Misc
  'get_incoming_attacks', 'get_galaxy_data', 'check_bashing_rule',
  'process_all_user_shipyard_queues', 'maintenance_cleanup',
  'delete_user_account', 'setup_new_user',
  'admin_distribute_destruction_pool', 'admin_maintenance_unstick_queues',
  
  
  // Cosmetic
  'purchase_cosmetic_item', 'equip_cosmetic_item',
  
  // Forum
  'forum_post_notify_telegram',
  
  // Telegram
  'send_telegram_notification', 'send_telegram_dm',
  
  // Moon
  'create_moon', 'moon_destroy',
  
  // Hall of Fame
  'update_hall_of_fame', 'calculate_hall_of_fame',
  
  // Lottery
  'buy_lottery_ticket', 'draw_lottery',
  
  // ACS
  'create_acs_fleet', 'join_acs_with_fleet', 'leave_acs',
  
  // Jackpot
  'contribute_to_jackpot', 'distribute_jackpot',
  
  // Supply boxes
  'purchase_supply_box', 'open_supply_box',
];

const funcPatterns = criticalFunctions.map(fn => {
  const re = new RegExp('CREATE\\s+(?:OR REPLACE\\s+)?FUNCTION\\s+' + fn.replace(/_/g, '[_]?'), 'i');
  return { name: fn, re };
});

let foundCount = 0;
let missingCount = 0;
for (const fp of funcPatterns) {
  if (fp.re.test(content)) {
    foundCount++;
  } else {
    console.log('  MISSING: ' + fp.name);
    missingCount++;
  }
}
console.log('Found: ' + foundCount + '/' + criticalFunctions.length + ' critical functions');
if (missingCount > 0) console.log('Missing: ' + missingCount);
console.log('');

// =============================================
// 2. TABLE SCHEMAS CHECK
// =============================================
console.log('=== 2. TABLE SCHEMAS ===');

const criticalTables = [
  // Core game
  'profiles', 'planets', 'planet_resources', 'planet_buildings',
  'user_technologies', 'planet_ships', 'planet_defenses',
  
  // Queues
  'building_queue', 'shipyard_queue', 'research_queue',
  
  // Fleet
  'fleets', 'fleet_ships',
  
  // Reference / config
  'building_types', 'technology_types', 'ship_types', 'defense_types',
  'officer_types', 'game_settings',
  
  // Alliance
  'alliances', 'alliance_members', 'alliance_applications', 'alliance_diplomacy',
  'alliance_wars', 'alliance_war_contributors',
  
  // Messages & notifications
  'messages', 'battle_reports', 'espionage_reports',
  'forum_topics', 'forum_posts', 'forum_categories',
  'public_chat_messages',
  
  // Market
  'market_listings', 'market_purchases', 'buy_offers',
  
  // P2P
  'p2p_offers', 'p2p_transactions', 'p2p_disputes', 'p2p_chat_messages',
  'p2p_evidence', 'p2p_payment_methods', 'p2p_fee_settings',
  
  // Economy
  'admin_revenue', 'admin_expenses', 'admin_withdrawals',
  'wallet_transactions', 'user_wallets',
  
  // FXU
  'fxu_config', 'fxu_ratios',
  
  // Daily missions
  'daily_missions', 'daily_mission_types',
  
  // Bot / NPC
  'bot_profiles', 'bot_config', 'autopilot_events', 'npc_empire_assignments',
  
  // VIP & Plus
  'plus_plans', 'plus_purchases', 'user_plus_status',
  
  // Hero
  'hero_ships', 'hero_ship_items', 'hero_ship_equipment', 'hero_duels',
  
  // Blueprints
  'ship_blueprints', 'user_blueprints', 'blueprint_ships',
  
  // Cosmetic
  'cosmetic_items', 'cosmetic_purchases', 'user_cosmetics',
  
  // Lottery
  'lottery_config', 'lottery_tickets', 'lottery_draws',
  
  // Hall of Fame
  'hall_of_fame', 'hall_of_fame_entries',
  
  // Supply boxes
  'supply_boxes', 'supply_box_purchases', 'supply_box_rewards',
  
  // Security
  'account_interaction_log', 'anti_multiaccount_log',
  
  // Telegram
  'telegram_links', 'telegram_groups', 'telegram_broadcast_config',
  
  // Twitter
  'twitter_tasks', 'twitter_missions',
  
  // ACS
  'acs_fleets', 'acs_participants',
  
  // Jackpot
  'jackpot_pools', 'jackpot_contributions',
  
  // Admin
  'admin_config', 'admin_speed_settings', 'admin_smtp_settings',
  
  // Moon
  'moons', 'moon_buildings',
  
  // Referrals
  'referral_links', 'referral_commissions',
  
  // Notifications
  'notifications', 'notification_preferences',
  
  // Fleet acceleration
  'fleet_acceleration_log',
  
  // P2P currencies
  'p2p_currencies',
];

const tablePatterns = criticalTables.map(t => {
  const re = new RegExp('CREATE\\s+TABLE\\s+(?:IF NOT EXISTS\\s+)?(?:")?' + t.replace(/_/g, '[_]?') + '(?:")?', 'i');
  return { name: t, re };
});

let tableFound = 0;
let tableMissing = 0;
for (const tp of tablePatterns) {
  if (tp.re.test(content)) {
    tableFound++;
  } else {
    console.log('  MISSING TABLE: ' + tp.name);
    tableMissing++;
  }
}
console.log('Tables found: ' + tableFound + '/' + criticalTables.length);
if (tableMissing > 0) console.log('Missing tables: ' + tableMissing);
console.log('');

// =============================================
// 3. TRIGGERS CHECK
// =============================================
console.log('=== 3. TRIGGERS ===');

const criticalTriggers = [
  'trg_enforce_shield_dome_per_account',
  'trg_update_profiles_updated_at',
  'trg_update_planets_last_update',
  'update_user_points_after_insert',
  'update_user_points_after_update',
  'trg_process_building_queue',
  'trg_process_shipyard_queue',
  'trg_process_research_queue',
  'forum_post_notify_telegram',
];

for (const trig of criticalTriggers) {
  const re = new RegExp('CREATE\\s+(?:OR REPLACE\\s+)?TRIGGER\\s+' + trig, 'i');
  if (!re.test(content)) {
    console.log('  MISSING TRIGGER: ' + trig);
  }
}
console.log('');

// =============================================
// 4. GAME SYSTEMS CHECK
// =============================================
console.log('=== 4. GAME SYSTEMS ===');

const systems = [
  { name: 'Building system', check: ['add_to_building_queue', 'process_completed_building_queue', 'building_types', 'planet_buildings', 'building_queue'] },
  { name: 'Research system', check: ['start_research', 'complete_research', 'technology_types', 'user_technologies', 'research_queue'] },
  { name: 'Shipyard (ships + defenses)', check: ['process_next_shipyard_unit', 'shipyard_queue', 'ship_types', 'defense_types', 'planet_ships', 'planet_defenses'] },
  { name: 'Fleet / ACS system', check: ['secure_send_fleet', 'process_fleet_arrival', 'fleets', 'fleet_ships', 'acs_fleets', 'acs_participants'] },
  { name: 'Combat system', check: ['perform_combat', 'xnova_authentic_combat', 'battle_reports'] },
  { name: 'Expedition system', check: ['expedition_mission', 'process_expedition', 'expedition_log'] },
  { name: 'Resources / economy', check: ['calculate_and_sync_resources', 'planet_resources', 'get_planet_resource_production'] },
  { name: 'Moon system', check: ['create_moon', 'moon_buildings', 'lunar_base'] },
  { name: 'Alliance system', check: ['create_alliance', 'alliances', 'alliance_members', 'alliance_applications', 'alliance_diplomacy'] },
  { name: 'Alliance wars', check: ['create_alliance_war', 'alliance_wars', 'alliance_war_contributors', 'alliance_war_tick'] },
  { name: 'Market system', check: ['create_market_listing', 'purchase_market_listing', 'market_listings', 'market_purchases'] },
  { name: 'Buy offers system', check: ['create_buy_offer', 'fulfill_buy_offer', 'buy_offers'] },
  { name: 'P2P marketplace', check: ['p2p_create_offer', 'p2p_offers', 'p2p_transactions', 'p2p_disputes'] },
  { name: 'Daily missions', check: ['assign_daily_missions', 'complete_daily_mission', 'daily_missions', 'daily_mission_types'] },
  { name: 'FXU / wallet', check: ['purchase_fxu', 'transfer_fxu', 'wallet_transactions', 'user_wallets', 'fxu_config'] },
  { name: 'VIP / Plus system', check: ['is_user_plus', 'purchase_plus', 'plus_plans', 'plus_purchases'] },
  { name: 'Officer system', check: ['purchase_officer_with_fxu', 'officer_types', 'officer_purchases'] },
  { name: 'Bot / NPC system', check: ['bot_ai_tick', 'npc_role_tick', 'bot_profiles', 'npc_empire_assignments', 'autopilot_events'] },
  { name: 'Hero ship system', check: ['get_hero_ship', 'repair_hero_ship', 'equip_hero_item', 'hero_ships', 'hero_ship_items', 'hero_duels'] },
  { name: 'Blueprint system', check: ['drop_ship_blueprint', 'ship_blueprints', 'user_blueprints', 'blueprint_ships'] },
  { name: 'Cosmetic system', check: ['purchase_cosmetic_item', 'cosmetic_items', 'cosmetic_purchases', 'user_cosmetics'] },
  { name: 'Supply boxes', check: ['purchase_supply_box', 'supply_boxes', 'supply_box_purchases'] },
  { name: 'Lottery system', check: ['buy_lottery_ticket', 'draw_lottery', 'lottery_config', 'lottery_tickets'] },
  { name: 'Hall of Fame', check: ['update_hall_of_fame', 'hall_of_fame', 'hall_of_fame_entries'] },
  { name: 'Jackpot system', check: ['contribute_to_jackpot', 'distribute_jackpot', 'jackpot_pools', 'jackpot_contributions'] },
  { name: 'Referral system', check: ['referral_links', 'referral_commissions', 'referral_stats'] },
  { name: 'Telegram integration', check: ['telegram_links', 'telegram_groups', 'send_telegram_notification'] },
  { name: 'Forum system', check: ['forum_post_notify_telegram', 'forum_topics', 'forum_posts', 'forum_categories'] },
  { name: 'Chat / messages', check: ['messages', 'public_chat_messages', 'chat_messages'] },
  { name: 'Twitter social tasks', check: ['twitter_tasks', 'twitter_missions'] },
  { name: 'Anti-multiaccount', check: ['account_interaction_log', 'anti_multiaccount_log'] },
  { name: 'Fleet acceleration', check: ['accelerate_fleet', 'fleet_acceleration_log'] },
  { name: 'Missile system', check: ['missile_silo', 'launch_missiles'] },
  { name: 'Building damage', check: ['building_damage_on_attack'] },
  { name: 'Noob protection', check: ['check_noob_protection'] },
  { name: 'Bashing rule', check: ['check_bashing_rule', 'anti_bashing_check'] },
  { name: 'Vacation mode', check: ['vacation_mode'] },
  { name: 'Registration control', check: ['registration_control'] },
  { name: 'Admin system', check: ['admin_config', 'admin_speed_settings', 'admin_exec_sql'] },
  { name: 'Broadcast system', check: ['send_broadcast_message', 'broadcast_messages'] },
  { name: 'Email verification', check: ['email_verification', 'auth_helper'] },
  { name: 'Reconnect sync', check: ['reconnect_sync'] },
  { name: 'Inactive accounts cleanup', check: ['inactive_accounts_cleanup', 'inactive_account_log'] },
  { name: 'Destruction ranking', check: ['destruction_ranking', 'admin_distribute_destruction_pool'] },
  { name: 'Weekly revenue snapshots', check: ['weekly_revenue_snapshots', 'revenue_time_series'] },
  { name: 'Server reset helpers', check: ['server_reset'] },
  { name: 'Hall of Fame ranking', check: ['hall_of_fame', 'update_hall_of_fame'] },
  { name: 'Autopilot', check: ['autopilot_eligible', 'autopilot_active'] },
  { name: 'Galaxy navigation', check: ['galaxy_navigation', 'get_galaxy_data'] },
  { name: 'Phalanx scan', check: ['phalanx_scan'] },
];

let systemsMissing = 0;
for (const sys of systems) {
  let foundAny = false;
  for (const keyword of sys.check) {
    const re = new RegExp(keyword.replace(/_/g, '[_]?'), 'i');
    if (re.test(content)) {
      foundAny = true;
      break;
    }
  }
  if (!foundAny) {
    console.log('  WARNING: System "' + sys.name + '" has NO keywords found in backup!');
    systemsMissing++;
  }
}
if (systemsMissing === 0) {
  console.log('  All ' + systems.length + ' game systems verified OK');
}
console.log('');

// =============================================
// 5. SEED DATA CHECK
// =============================================
console.log('=== 5. SEED DATA ===');

const seedChecks = [
  { name: 'Building types', table: 'building_types', codes: ['metal_mine', 'crystal_mine', 'deuterium_synthesizer', 'solar_plant', 'fusion_reactor', 'shipyard', 'research_lab', 'robotics_factory', 'nanite_factory', 'missile_silo', 'terraformer', 'metal_storage', 'crystal_storage', 'deuterium_tank'] },
  { name: 'Technology types', table: 'technology_types', codes: ['energy_tech', 'laser_tech', 'ion_tech', 'hyperspace_tech', 'plasma_tech', 'combustion_drive', 'impulse_drive', 'hyperspace_drive', 'weapons_tech', 'shielding_tech', 'armour_tech', 'espionage_tech', 'computer_tech', 'astrophysics', 'graviton_tech'] },
  { name: 'Ship types', table: 'ship_types', codes: ['small_cargo', 'large_cargo', 'colony_ship', 'recycler', 'espionage_probe', 'solar_satellite', 'light_fighter', 'heavy_fighter', 'cruiser', 'battleship', 'bomber', 'battlecruiser', 'destroyer', 'deathstar'] },
  { name: 'Defense types', table: 'defense_types', codes: ['rocket_launcher', 'light_laser', 'heavy_laser', 'gauss_cannon', 'ion_cannon', 'plasma_turret', 'small_shield_dome', 'large_shield_dome', 'anti_ballistic_missile', 'interplanetary_missile'] },
];

for (const seed of seedChecks) {
  const foundCodes = seed.codes.filter(code => {
    const re = new RegExp("'" + code + "'", 'i');
    return re.test(content);
  });
  if (foundCodes.length === seed.codes.length) {
    console.log('  ' + seed.name + ': OK (' + foundCodes.length + '/' + seed.codes.length + ' codes)');
  } else {
    const missingCodes = seed.codes.filter(c => !foundCodes.includes(c));
    console.log('  ' + seed.name + ': PARTIAL (' + foundCodes.length + '/' + seed.codes.length + ') - Missing: ' + missingCodes.join(', '));
  }
}
console.log('');

// =============================================
// 6. CLEANUP SECTION CHECK
// =============================================
console.log('=== 6. CLEANUP & ADMIN SECTION ===');
const hasCleanup = content.includes('CLEANUP - Remove all user data');
const hasTruncate = /TRUNCATE TABLE "profiles"/.test(content);
const hasAdminAuth = /INSERT INTO auth\.users/.test(content);
const hasAdminProfile = /INSERT INTO profiles.*falcoxcorp/.test(content);
const hasAdminPlanet = /INSERT INTO planets.*Planeta Admin/.test(content);
const hasResetResources = /INSERT INTO planet_resources.*10000/.test(content);

console.log('  Cleanup section present: ' + (hasCleanup ? 'YES' : 'NO'));
console.log('  TRUNCATE profiles: ' + (hasTruncate ? 'YES' : 'NO'));
console.log('  Admin auth.users: ' + (hasAdminAuth ? 'YES' : 'NO'));
console.log('  Admin profile: ' + (hasAdminProfile ? 'YES' : 'NO'));
console.log('  Admin planet: ' + (hasAdminPlanet ? 'YES' : 'NO'));
console.log('  Admin resources: ' + (hasResetResources ? 'YES' : 'NO'));
console.log('');

// =============================================
// SUMMARY
// =============================================
console.log('=== VERIFICATION SUMMARY ===');
const funcTotal = (content.match(/CREATE\s+(?:OR REPLACE\s+)?FUNCTION/g) || []).length;
const tableTotal = (content.match(/CREATE\s+TABLE\s+IF NOT EXISTS/g) || []).length;
const triggerTotal = (content.match(/CREATE\s+(?:OR REPLACE\s+)?TRIGGER/g) || []).length;
const policyTotal = (content.match(/CREATE\s+POLICY/g) || []).length;
const indexTotal = (content.match(/CREATE\s+(?:UNIQUE\s+)?INDEX/g) || []).length;
const grantTotal = (content.match(/^GRANT /gm) || []).length;

console.log('  Total functions: ' + funcTotal);
console.log('  Total tables (CREATE TABLE IF NOT EXISTS): ' + tableTotal);
console.log('  Total triggers: ' + triggerTotal);
console.log('  Total policies: ' + policyTotal);
console.log('  Total indexes: ' + indexTotal);
console.log('  Total grants: ' + grantTotal);
console.log('  Critical functions found: ' + foundCount + '/' + criticalFunctions.length);
console.log('  Critical tables found: ' + tableFound + '/' + criticalTables.length);
console.log('  Game systems verified: ' + systems.length);
console.log('  Systems missing: ' + systemsMissing);

if (missingCount === 0 && tableMissing === 0 && systemsMissing === 0 && hasAdminProfile && hasAdminPlanet) {
  console.log('\n  ✅ BACKUP COMPLETE - All business logic verified');
} else {
  console.log('\n  ⚠️  Some items need attention (see above)');
}
