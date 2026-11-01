const fs = require('fs');
const f = fs.readFileSync('deploy_backup.sql', 'utf8');

// Tables to check for seed data
const checkTables = [
  'hero_market_pool',
  'alliance_war_reserve_pool',
  'daily_missions',
  'jackpot',
  'jackpot_pools',
  'market_sales_weekly',
  'blueprint_market_escrow',
  'expedition_blueprint_drop_config',
  'debris_fields',
  'statements',
  'user_wallets',
  'wallet_transactions',
];

for (const table of checkTables) {
  // Find CREATE TABLE for this table
  const createRegex = new RegExp('CREATE TABLE(?: IF NOT EXISTS)? (?:public\\.)?\\\\?' + table, 'i');
  const createFound = createRegex.test(f);
  
  // Find INSERT INTO for this table (seed data)
  const insertRegex = new RegExp('INSERT INTO ' + table, 'gi');
  const inserts = (f.match(insertRegex) || []).length;
  
  // Find ON CONFLICT DO NOTHING (strong indicator of seed data)
  const seedRegex = new RegExp('INSERT INTO ' + table + '.*ON CONFLICT', 'is');
  const hasSeed = seedRegex.test(f);
  
  // Check if table name appears in truncate list
  const truncIdx = f.indexOf('SET session_replication_role = replica');
  const truncEnd = f.indexOf('SET session_replication_role = origin');
  const truncSection = f.substring(truncIdx, truncEnd);
  const isTruncated = new RegExp('TRUNCATE TABLE' + '\\\\s*"' + table + '"', 'i').test(truncSection);
  
  console.log(table + ':');
  console.log('  Exists:   ' + createFound);
  console.log('  INSERTs:  ' + inserts + (hasSeed ? ' (seed data!)' : ''));
  console.log('  Truncated: ' + (isTruncated ? 'YES' : 'NO'));
  
  if (isTruncated && hasSeed) {
    console.log('  *** BUG: Has seed data but is being truncated! ***');
  }
  console.log('');
}
