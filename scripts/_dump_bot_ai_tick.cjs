const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'bot_ai_tick'`);
  fs.writeFileSync('/tmp/bot_ai_tick_current.sql', r.rows[0].def);
  console.log('Lines:', r.rows[0].def.split('\n').length);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
