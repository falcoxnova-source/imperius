const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id,code,name FROM ship_types WHERE code IN ('deathstar','nova','destruccion_masiva','falco_x_clasica')`);
  console.table(r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
