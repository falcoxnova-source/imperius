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
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260618350000_falco_x_requirements_final.sql'), 'utf8');
  await c.query(sql);
  const r = await c.query(`
    SELECT COALESCE(bt.name, tt.name) AS req, COALESCE(sr.required_building_level, sr.required_tech_level) AS lvl
    FROM ship_requirements sr
    LEFT JOIN building_types bt ON bt.id = sr.required_building_id
    LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
    WHERE sr.ship_type_id = (SELECT id FROM ship_types WHERE code='falco_x_clasica')
    ORDER BY req
  `);
  console.table(r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
