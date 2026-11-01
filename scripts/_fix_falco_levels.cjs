const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const sid = (await c.query("SELECT id FROM ship_types WHERE code='falco_x_clasica'")).rows[0].id;
  const reqs = [
    ['hyperspace_tech', 9],
    ['hyperspace_drive', 11],
    ['impulse_drive', 10],
    ['laser_tech', 12],
    ['ion_tech', 8],
    ['plasma_tech', 8],
    ['armour_tech', 12],
    ['weapons_tech', 12],
    ['graviton_tech', 2],
  ];
  for (const [code, lvl] of reqs) {
    await c.query(
      `UPDATE ship_requirements
       SET required_tech_level = $1
       WHERE ship_type_id = $2
         AND required_tech_id = (SELECT id FROM technology_types WHERE code = $3)`,
      [lvl, sid, code]
    );
  }
  const r = await c.query(
    `SELECT COALESCE(bt.name, tt.name) AS req,
            COALESCE(sr.required_building_level, sr.required_tech_level) AS lvl
     FROM ship_requirements sr
     LEFT JOIN building_types bt ON bt.id = sr.required_building_id
     LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
     WHERE sr.ship_type_id = $1
     ORDER BY req`,
    [sid]
  );
  console.table(r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
