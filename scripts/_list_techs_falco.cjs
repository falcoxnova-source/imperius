const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const tt = await c.query(`SELECT id, code, name FROM technology_types ORDER BY id`);
  console.log('--- tech ---'); console.table(tt.rows);
  const bt = await c.query(`SELECT id, code, name FROM building_types WHERE code IN ('shipyard') ORDER BY id`);
  console.log('--- bldg ---'); console.table(bt.rows);
  const sr = await c.query(`SELECT sr.*, bt.code AS b_code, tt.code AS t_code FROM ship_requirements sr LEFT JOIN building_types bt ON bt.id=sr.required_building_id LEFT JOIN technology_types tt ON tt.id=sr.required_tech_id WHERE sr.ship_type_id=(SELECT id FROM ship_types WHERE code='falco_x_clasica')`);
  console.log('--- current reqs ---'); console.table(sr.rows);
  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
