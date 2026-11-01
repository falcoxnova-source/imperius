const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

const MAIN_PLANET_ID = '3b75ec4b-95d0-49dd-bca4-626e25d6c888';

c.connect()
  .then(() => c.query(
    `INSERT INTO planet_buildings (planet_id, building_type_id, level)
     VALUES ($1, 14, 1)
     ON CONFLICT (planet_id, building_type_id)
     DO UPDATE SET level = planet_buildings.level + 1
     RETURNING *`,
    [MAIN_PLANET_ID]
  ))
  .then(r => {
    console.log('Terraformer actualizado a nivel:', r.rows[0].level);
    c.end();
  })
  .catch(e => { console.error(e.message); c.end(); });
