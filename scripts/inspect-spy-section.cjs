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
  const lines = r.rows[0].prosrc.split(/\r?\n/);
  // Find espionage section context
  lines.forEach((l, i) => {
    if (/espionage|mission_type\s*:?=\s*'espionage'/i.test(l) || /v_phase_rand/i.test(l)) {
      console.log(String(i+1).padStart(4), l);
    }
  });
  await c.end();
})();
