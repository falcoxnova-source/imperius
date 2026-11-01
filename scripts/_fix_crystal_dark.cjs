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
    const pid = 'bbdc3248-7707-4bfc-a576-47ecc3669cd1';

    // 1) Revertir el almacen (id=7) a 10 (su valor original)
    const rev = await c.query(
      "UPDATE planet_buildings SET level=10 WHERE planet_id=$1 AND building_type_id=7 RETURNING building_type_id, level",
      [pid]
    );
    console.log('almacen revertido:', rev.rows[0]);

    // 2) Subir Mina de Cristal (id=2) a 25
    const cur = await c.query("SELECT * FROM planet_buildings WHERE planet_id=$1 AND building_type_id=2", [pid]);
    console.log('mina actual:', cur.rows[0] || null);

    if (cur.rows.length) {
      const upd = await c.query(
        "UPDATE planet_buildings SET level=25, is_upgrading=false, upgrade_end_time=NULL WHERE planet_id=$1 AND building_type_id=2 RETURNING *",
        [pid]
      );
      console.log('Mina actualizada:', upd.rows[0]);
    } else {
      const ins = await c.query(
        "INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading) VALUES ($1,2,25,false) RETURNING *",
        [pid]
      );
      console.log('Mina insertada:', ins.rows[0]);
    }
  } catch(e){ console.error('ERR:',e.message);} finally { await c.end(); }
})();
