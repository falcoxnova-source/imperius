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
  const src = r.rows[0].prosrc;
  const lines = src.split(/\r?\n/);
  console.log('--- Phase C ships (lines 430-512) ---');
  console.log(lines.slice(429, 512).join('\n'));
  console.log('\n--- Phase D defenses (lines 513-570) ---');
  console.log(lines.slice(512, 575).join('\n'));
  await c.end();
})();
