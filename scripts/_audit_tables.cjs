const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// Extract all CREATE TABLE statements
const allTables = new Set();
const allTriggers = new Set();
const allFunctions = new Set();

const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

for (const file of files) {
  const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  
  // Tables
  const tableMatches = content.match(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?\"?(\w+)\"?/gi);
  if (tableMatches) {
    tableMatches.forEach(m => {
      const name = m.replace(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?\"?/i, '').replace(/\"?$/, '');
      allTables.add(name);
    });
  }
}

// Reference vs user data classification
// Reference tables: seed data, configuration, lookups
const REFERENCE_TABLES = new Set([
  'building_types', 'technology_types', 'ship_types', 'defense_types',
  'officer_types', 'game_settings', 'building_requirements', 
  'technology_requirements', 'ship_requirements', 'defense_requirements',
  'galaxy_positions', 'plus_plans', 'supply_boxes', 'cosmetic_items',
  'wallet_config', 'admin_config', 'game_rounds', 'jackpot_config',
  'admin_speed_settings', 'admin_smtp_settings', 'admin_telegram_config',
  'telegram_groups', 'telegram_task_rewards', 'telegram_dm_config',
  'market_notification_config', 'market_resource_limits',
  'admin_account_deletions', 'wallet_transactions', 'user_wallets',
  'p2p_payment_methods', 'p2p_notification_config',
  'twitter_social_config', 'ship_blueprints',
  'expedition_blueprint_drop_config', 'blueprint_market_escrow',
  'hero_ship_items', 'hero_market_pool', 'alliance_war_reserve_pool',
  'debris_fields',
]);

console.log('=== ALL TABLES (' + allTables.size + ') ===');
console.log('');

let refTables = [];
let userTables = [];

for (const t of [...allTables].sort()) {
  const isRef = REFERENCE_TABLES.has(t);
  if (isRef) {
    refTables.push(t);
    console.log('  [REFERENCE] ' + t);
  } else {
    userTables.push(t);
    console.log('  [USER DATA] ' + t);
  }
}

console.log('');
console.log('=== SUMMARY ===');
console.log('Reference tables: ' + refTables.length);
console.log('User data tables: ' + userTables.length);

// Output user tables JSON for the gen script
console.log('');
console.log('=== USER TABLES FOR TRUNCATION ===');
console.log(JSON.stringify(userTables, null, 2));
