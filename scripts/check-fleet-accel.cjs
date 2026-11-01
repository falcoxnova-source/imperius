const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  
  // Check calculate_fxu_cost_fleet
  const r1 = await c.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'calculate_fxu_cost_fleet'");
  console.log('=== calculate_fxu_cost_fleet ===');
  console.log(r1.rows[0]?.def || 'NOT FOUND');
  
  // Check accelerate_fleet
  const r2 = await c.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'accelerate_fleet'");
  console.log('\n=== accelerate_fleet ===');
  console.log(r2.rows[0]?.def || 'NOT FOUND');
  
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
