process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Encontrar la tabla donde se guardan las naves
  console.log('=== Tablas con "ship" ===');
  console.log((await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%ship%' ORDER BY table_name")).rows.map(r=>r.table_name).join('\n'));

  console.log('\n=== Falco-X Clasica en posesion de Guga73 y Tagua (planet_ships) ===');
  try {
    const r = await c.query(`
      SELECT p.username, pl.name AS planeta, ps.quantity
      FROM planet_ships ps
      JOIN planets pl ON pl.id = ps.planet_id
      JOIN profiles p ON p.id = pl.user_id
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE st.code = 'falco_x_clasica' AND p.username IN ('Guga73','Tagua')
      ORDER BY p.username
    `);
    console.table(r.rows);
  } catch (e) { console.log('err planet_ships:', e.message); }

  console.log('\n=== Falco-X en flotas en transito ===');
  try {
    const r2 = await c.query(`
      SELECT p.username, f.id AS fleet_id, f.mission_type, f.is_completed, fs.quantity
      FROM fleet_ships fs
      JOIN fleets f ON f.id = fs.fleet_id
      JOIN ship_types st ON st.id = fs.ship_type_id
      JOIN profiles p ON p.id = f.user_id
      WHERE st.code='falco_x_clasica' AND p.username IN ('Guga73','Tagua')
    `);
    console.table(r2.rows);
  } catch (e) { console.log('err fleet_ships:', e.message); }

  console.log('\n=== Total Falco-X global por jugador (todas las fuentes) ===');
  try {
    const r3 = await c.query(`
      WITH planeta AS (
        SELECT pl.user_id, SUM(ps.quantity) AS en_planeta
        FROM planet_ships ps
        JOIN planets pl ON pl.id = ps.planet_id
        JOIN ship_types st ON st.id = ps.ship_type_id
        WHERE st.code='falco_x_clasica'
        GROUP BY pl.user_id
      ),
      flota AS (
        SELECT f.user_id, SUM(fs.quantity) AS en_flota
        FROM fleet_ships fs
        JOIN fleets f ON f.id=fs.fleet_id
        JOIN ship_types st ON st.id=fs.ship_type_id
        WHERE st.code='falco_x_clasica'
        GROUP BY f.user_id
      )
      SELECT pr.username,
             COALESCE(pl.en_planeta, 0) AS en_planeta,
             COALESCE(fl.en_flota, 0) AS en_flota,
             COALESCE(pl.en_planeta,0) + COALESCE(fl.en_flota,0) AS total
      FROM profiles pr
      LEFT JOIN planeta pl ON pl.user_id=pr.id
      LEFT JOIN flota fl ON fl.user_id=pr.id
      WHERE COALESCE(pl.en_planeta,0)+COALESCE(fl.en_flota,0) > 0
      ORDER BY total DESC
    `);
    console.table(r3.rows);
  } catch (e) { console.log('err global:', e.message); }

  await c.end();
})().catch(e=>{console.error(e);process.exit(1);});
