const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id, code, name, cargo_capacity FROM ship_types WHERE LOWER(code) LIKE '%recyc%' OR LOWER(name) LIKE '%recic%' OR LOWER(name) LIKE '%mega%'`);
  console.table(r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
