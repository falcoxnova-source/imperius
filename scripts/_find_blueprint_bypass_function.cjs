const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT n.nspname AS schema, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prokind = 'f'
      AND n.nspname = 'public'
      AND pg_get_functiondef(p.oid) ILIKE '%user_ship_blueprints%'
  `);
  console.table(r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
