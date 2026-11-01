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

  // 1. Get secure_abandon_colony function source
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='secure_abandon_colony' AND pronamespace='public'::regnamespace`);
  console.log('=== secure_abandon_colony SOURCE ===');
  console.log(fn.rows[0]?.prosrc || 'NOT FOUND');

  // 2. Check phalanx_scan function
  const phalanx = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='phalanx_scan' AND pronamespace='public'::regnamespace`);
  console.log('\n=== phalanx_scan SOURCE ===');
  console.log(phalanx.rows[0]?.prosrc || 'NOT FOUND');

  // 3. Check Lucifrer's VIP status
  const lucifrer = await c.query(`SELECT id, username, is_vip, vip_until, fxu_balance FROM profiles WHERE username ILIKE '%lucif%'`);
  console.log('\n=== Lucifrer profile ===');
  console.log(lucifrer.rows);

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
