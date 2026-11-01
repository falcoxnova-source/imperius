const { Client } = require('pg');
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
  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const src = r.rows[0].prosrc;
  // all occurrences of v_cargo_ship_capacity
  const lines = src.split('\n');
  console.log('=== occurrences of v_cargo_ship_capacity ===');
  lines.forEach((l, i) => { if (l.includes('v_cargo_ship_capacity')) console.log(i, ':', l.trim().substring(0, 200)); });
  await c.end();
})();
