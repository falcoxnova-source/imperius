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
  const r = await c.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name ILIKE '%vip%' OR column_name ILIKE '%plus%' OR column_name ILIKE '%premium%' OR column_name ILIKE '%subscription%') ORDER BY 1,2"
  );
  console.log(r.rows);
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%vip%' OR table_name ILIKE '%plus%' OR table_name ILIKE '%premium%' OR table_name ILIKE '%subscription%') ORDER BY 1");
  console.log('tables:', t.rows);
  await c.end();
})();
