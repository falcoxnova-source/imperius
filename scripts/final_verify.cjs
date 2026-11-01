const fs = require('fs');
const f = fs.readFileSync('deploy_backup.sql', 'utf8');

const tables = (f.match(/CREATE TABLE(?: IF NOT EXISTS)? (?:public\.)?\w+/g) || []).length;
const funcs = (f.match(/CREATE OR REPLACE FUNCTION (public\.)?\w+/g) || []).length;
const triggers = (f.match(/CREATE TRIGGER \w+/g) || []).length;
const policies = (f.match(/CREATE POLICY /g) || []).length;
const indexes = (f.match(/CREATE INDEX /g) || []).length;
const grants = (f.match(/GRANT (?:EXECUTE|ALL|SELECT|INSERT|UPDATE|DELETE) ON /g) || []).length;
const views = (f.match(/CREATE (?:OR REPLACE )?VIEW /g) || []).length;
const lines = f.split('\n').length;
const sizeMB = (fs.statSync('deploy_backup.sql').size / 1024 / 1024).toFixed(2);

console.log('==================================');
console.log('  DEPLOY BACKUP VERIFICATION');
console.log('==================================');
console.log('File:         deploy_backup.sql');
console.log('Size:         ' + sizeMB + ' MB');
console.log('Lines:        ' + lines);
console.log('');
console.log('Tables:       ' + tables);
console.log('Functions:    ' + funcs);
console.log('Triggers:     ' + triggers);
console.log('Policies:     ' + policies);
console.log('Indexes:      ' + indexes);
console.log('Grants:       ' + grants);
console.log('Views:        ' + views);
console.log('');

// Verify admin section
const adminIdx = f.indexOf('-- ADMIN ACCOUNT');
const adminSection = f.substring(adminIdx, f.indexOf('-- DEPLOY BACKUP COMPLETE', adminIdx));

const checks = [
  ['Zero points', adminSection.includes('0, 0, 0, 0, 0, 0, true')],
  ['Admin email', adminSection.includes('falcoxcorp@admin.com')],
  ['Admin planet', adminSection.includes('Planeta Admin')],
  ['Planet fields_used=0', adminSection.includes('0, 163')],
  ['Start resources 10k', adminSection.includes('10000, 10000, 10000')],
  ['Idempotent WHERE NOT EXISTS', adminSection.includes('WHERE NOT EXISTS')],
];

console.log('--- ADMIN VERIFICATION ---');
let allOK = true;
for (const [name, ok] of checks) {
  console.log((ok ? '  OK' : '  FAIL') + ': ' + name);
  if (!ok) allOK = false;
}

// Verify key reference tables are NOT truncated
const truncateSection = f.substring(f.indexOf('SET session_replication_role = replica'), f.indexOf('SET session_replication_role = origin'));
const refTables = ['building_types', 'technology_types', 'ship_types', 'defense_types', 'officer_types', 'game_settings', 'plus_plans', 'supply_boxes'];
console.log('');
console.log('--- REFERENCE TABLE PROTECTION ---');
for (const t of refTables) {
  const truncated = truncateSection.includes('TRUNCATE TABLE \"' + t + '\"');
  console.log((truncated ? '  BUG!' : '  OK') + ': ' + t + (truncated ? ' (WRONGLY truncated!)' : ''));
  if (truncated) allOK = false;
}

// Verify key systems present
const systems = [
  ['Combat', /xnova_authentic_combat/],
  ['Fleet missions', /secure_send_fleet|send_fleet/],
  ['Market', /market_listing|buy_offer|market_purchase/],
  ['Officers', /activate_officer|officer_bonus/],
  ['Daily missions', /assign_daily_missions|complete_daily_mission/],
  ['Alliances', /accept_alliance_application|join_open_alliance/],
  ['Alliance wars', /create_alliance_war|resolve_alliance_war/],
  ['Lottery', /lottery_auto_draw|draw_lottery/],
  ['Jackpot', /distribute_jackpot|jackpot_pool/],
  ['Supply boxes', /purchase_supply_box|open_supply_box/],
  ['Cosmetics', /purchase_cosmetic/],
  ['Hero system', /hero_duel|hero_ship_expedition/],
  ['Blueprints', /drop_ship_blueprint|buy_blueprint/],
  ['P2P', /p2p_start_dispute|p2p_resolve_dispute/],
  ['Bots/AI', /bot_ai_tick|cron_optimized_global_queue_processor/],
  ['Admin tools', /admin_exec_sql|admin_send_broadcast/],
  ['Telegram', /forum_post_notify_telegram|telegram_notif/],
  ['Research', /start_research|process_completed_research/],
  ['Shipyard', /add_to_shipyard_queue|process_next_shipyard/],
  ['Building queue', /add_to_building_queue|process_completed_building/],
];

console.log('');
console.log('--- GAME SYSTEMS VERIFICATION ---');
for (const [name, regex] of systems) {
  const found = regex.test(f);
  console.log((found ? '  OK' : '  FAIL') + ': ' + name);
  if (!found) allOK = false;
}

// Check sequence fix is correct (MAX id, not 1)
console.log('');
console.log('--- SEQUENCE FIX VERIFICATION ---');
const setvalSection = f.substring(f.indexOf('-- Reset reference table sequences'), f.indexOf('-- ADMIN ACCOUNT'));
const correctSeq = setvalSection.includes('COALESCE((SELECT MAX(id)');
const wrongSeq = setvalSection.includes("setval('building_types_id_seq', 1");
console.log('  Sequences use MAX(id): ' + (correctSeq ? 'OK' : 'FAIL'));
console.log('  No setval to 1:       ' + (!wrongSeq ? 'OK' : 'FAIL'));

// Truncate count
const truncateCount = (f.match(/TRUNCATE TABLE \"/g) || []).length;
console.log('');
console.log('--- TRUNCATE SUMMARY ---');
console.log('  Tables truncated: ' + truncateCount);

console.log('');
console.log('==================================');
console.log(allOK ? '  VEREDICT: BACKUP 100% READY' : '  VEREDICT: NEEDS FIXES');
console.log('==================================');
