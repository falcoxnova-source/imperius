-68const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='secure_send_fleet' AND n.nspname='public'`);
  const src = r.rows[0].prosrc;
  // find "capacity" or "Cargo exceeds"
  const idx = src.indexOf('Cargo exceeds');
  console.log('=== secure_send_fleet around capacity check ===');
  console.log(src.substring(Math.max(0, idx - 3000), idx + 500));
  await c.end();
})();
