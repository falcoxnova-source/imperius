const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Get current function source
  const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'accelerate_fleet'`);
  console.log('=== CURRENT accelerate_fleet SOURCE ===');
  console.log(r.rows[0]?.prosrc || 'NOT FOUND');

  // Get fleet acceleration settings
  const r2 = await c.query(`SELECT key, value FROM game_settings WHERE key LIKE '%fleet_accel%' OR key LIKE '%fxu_per%'`);
  console.log('\n=== FLEET ACCELERATION SETTINGS ===');
  r2.rows.forEach(r => console.log(`  ${r.key} = ${r.value}`));

  // Also check calculate_fxu_cost or similar
  const r3 = await c.query(`SELECT proname FROM pg_proc WHERE proname LIKE '%fxu%cost%' OR proname LIKE '%calculate%fxu%' OR proname LIKE '%fleet%cost%'`);
  console.log('\n=== FXU COST FUNCTIONS ===');
  r3.rows.forEach(r => console.log(`  ${r.proname}`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
