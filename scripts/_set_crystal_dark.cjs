const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  try {
    const uid = '50da268b-d729-4f06-b8af-e03aa0437c1f';
    // main planet
    const pl = await c.query("SELECT id, name, is_main_planet FROM planets WHERE user_id=$1 AND is_main_planet=true LIMIT 1", [uid]);
    console.log('main planet:', pl.rows[0]);
    const pid = pl.rows[0].id;

    // crystal building type
    const bt = await c.query("SELECT id, code, name FROM building_types WHERE code ILIKE '%crystal%' OR name ILIKE '%cristal%' OR name ILIKE '%crystal%'");
    console.log('crystal types:', bt.rows);
    const crystalTypeId = bt.rows[0].id;

    // current level
    const cur = await c.query("SELECT * FROM planet_buildings WHERE planet_id=$1 AND building_type_id=$2", [pid, crystalTypeId]);
    console.log('current crystal building:', cur.rows[0]);

    if (cur.rows.length) {
      const upd = await c.query(
        "UPDATE planet_buildings SET level=25, is_upgrading=false, upgrade_end_time=NULL WHERE planet_id=$1 AND building_type_id=$2 RETURNING *",
        [pid, crystalTypeId]
      );
      console.log('Updated:', upd.rows[0]);
    } else {
      const ins = await c.query(
        "INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading) VALUES ($1,$2,25,false) RETURNING *",
        [pid, crystalTypeId]
      );
      console.log('Inserted:', ins.rows[0]);
    }
  } catch(e){ console.error('ERR:',e.message);} finally { await c.end(); }
})();
