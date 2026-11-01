const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260618320000_mega_recycler_cargo_20m.sql'), 'utf8');
  await c.query(sql);
  const r = await c.query(`SELECT code, cargo_capacity FROM ship_types WHERE code='mega_recycler'`);
  console.table(r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
