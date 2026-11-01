const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  try {
    const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%building%' OR table_name ILIKE '%mine%' OR table_name ILIKE '%structure%') ORDER BY 1");
    console.log(t.rows);
    const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name ILIKE '%building%' ORDER BY table_name, ordinal_position");
    console.log(cols.rows);
  } finally { await c.end(); }
})();
