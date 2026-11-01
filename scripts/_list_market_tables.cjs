process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%blueprint%' OR table_name ILIKE '%listing%' OR table_name ILIKE '%market%') ORDER BY table_name");
  console.log(r.rows.map(x => x.table_name).join('\n'));
  await c.end();
})();
