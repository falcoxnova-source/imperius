const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();

  // Buscar usuario por email
  const u = await c.query(`
    SELECT p.id, p.username, p.is_bot, p.autopilot_active, p.autopilot_eligible, au.email
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE au.email = 'samaileal01@gmail.com'
  `);
  console.log('User:', u.rows[0]);
  if (!u.rows[0]) { await c.end(); return; }
  const ID = u.rows[0].id;

  // Planetas
  const p = await c.query(`
    SELECT pl.id, pl.name, pl.autopilot_role,
           pl.galaxy||':'||pl.solar_system||':'||pl.position AS coords,
           pr.metal::bigint, pr.crystal::bigint, pr.deuterium::bigint,
           COALESCE((SELECT quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id
                     WHERE ps.planet_id=pl.id AND st.code='small_cargo'),0) AS small,
           COALESCE((SELECT quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id
                     WHERE ps.planet_id=pl.id AND st.code='large_cargo'),0) AS large_,
           (SELECT count(*) FROM fleets f WHERE f.origin_planet_id=pl.id AND f.is_completed=false) AS active_fleets
    FROM planets pl
    LEFT JOIN planet_resources pr ON pr.planet_id=pl.id
    WHERE pl.user_id=$1 AND NOT pl.is_destroyed
    ORDER BY pl.is_main_planet DESC, pl.name
  `, [ID]);
  console.table(p.rows);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
