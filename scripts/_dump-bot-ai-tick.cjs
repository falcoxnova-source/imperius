const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query("SELECT pg_get_functiondef(oid) AS src FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1");
  fs.writeFileSync('scripts/_bot_ai_tick_current.sql', r.rows[0].src);
  console.log('bytes:', r.rows[0].src.length);
  await c.end();
})();
