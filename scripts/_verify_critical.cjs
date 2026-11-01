const fs = require('fs');
const f = fs.readFileSync('deploy_backup.sql', 'utf8');
const s = f.indexOf('SET session_replication_role = replica');
const e = f.indexOf('SET session_replication_role = origin');
const sec = f.substring(s, e);

const checks = [
  'daily_missions',
  'user_daily_missions',
  'jackpot',
  'jackpot_pools',
  'hero_market_pool',
  'alliance_war_reserve_pool',
];

console.log('Critical table check:');
for (const t of checks) {
  const truncated = sec.includes('TRUNCATE TABLE "' + t + '"');
  console.log((truncated ? '  BUG - TRUNCADA  ' : '  OK - PROTEGIDA ') + ': ' + t);
}
