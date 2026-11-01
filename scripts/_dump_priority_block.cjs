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
  const lines = src.split('\n');
  // print lines 1110..1310
  for (let i = 1100; i < 1320; i++) {
    console.log(i, ':', (lines[i] || '').substring(0, 240));
  }
  await c.end();
})();
