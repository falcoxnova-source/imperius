const { Client } = require('pg');
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
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'");
  r.rows[0].prosrc.split(/\r?\n/).forEach((l, i) => {
    if (/colon/i.test(l)) console.log(`${i + 1}: ${l}`);
  });
  await c.end();
})();
