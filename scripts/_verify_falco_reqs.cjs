const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query('UPDATE ship_requirements SET required_tech_level=9 WHERE id=194');
  const sid = (await c.query("SELECT id FROM ship_types WHERE code='falco_x_clasica'")).rows[0].id;
  const tech = await c.query(
    `SELECT tt.name, sr.required_tech_level AS lvl
     FROM ship_requirements sr
     JOIN technology_types tt ON tt.id = sr.required_tech_id
     WHERE sr.ship_type_id = $1
     ORDER BY lvl DESC, tt.name`, [sid]);
  const bld = await c.query(
    `SELECT bt.name, sr.required_building_level AS lvl
     FROM ship_requirements sr
     JOIN building_types bt ON bt.id = sr.required_building_id
     WHERE sr.ship_type_id = $1`, [sid]);
  console.log('-- Edificio --'); console.table(bld.rows);
  console.log('-- Tecnologias --'); console.table(tech.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
