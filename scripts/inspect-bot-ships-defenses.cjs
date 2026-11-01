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
  // find Phase C ships and Phase D defenses sections
  const lines = src.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/phase c|phase d|ship|defense|astillero|defensa/i.test(l)) {
      console.log(String(i+1).padStart(4), l);
    }
  });
  await c.end();
})();
