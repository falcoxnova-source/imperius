const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%stat%' OR table_name ILIKE '%rank%' OR table_name ILIKE '%score%' OR table_name ILIKE '%point%')
    ORDER BY table_name
  `);
  console.log(r.rows);
  await c.end();
})();
