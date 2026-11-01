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

  // Get calculate_fxu_cost_fleet
  const r1 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'calculate_fxu_cost_fleet'`);
  console.log('=== calculate_fxu_cost_fleet SOURCE ===');
  console.log(r1.rows[0]?.prosrc || 'NOT FOUND');

  // Also get calculate_fxu_cost (base)
  const r2 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'calculate_fxu_cost'`);
  console.log('\n=== calculate_fxu_cost SOURCE ===');
  console.log(r2.rows[0]?.prosrc || 'NOT FOUND');

  // Get FXU cost ratios
  const r3 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'get_fxu_cost_ratios'`);
  console.log('\n=== get_fxu_cost_ratios SOURCE ===');
  console.log(r3.rows[0]?.prosrc || 'NOT FOUND');

  // Check game_settings for fxu related
  const r4 = await c.query(`SELECT key, value FROM game_settings WHERE key LIKE '%fxu%' ORDER BY key`);
  console.log('\n=== FXU GAME SETTINGS ===');
  r4.rows.forEach(r => console.log(`  ${r.key} = ${r.value}`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
