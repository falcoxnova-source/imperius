const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const u = await c.query(`SELECT id, username, is_bot FROM profiles WHERE id='50da268b-d729-4f06-b8af-e03aa0437c1f'`);
  console.log('User:', u.rows[0]);

  const p = await c.query(`
    SELECT pl.id, pl.name, pl.planet_type, pl.is_main_planet, pl.autopilot_role,
           pl.galaxy||':'||pl.solar_system||':'||pl.position AS coords,
           pr.metal::bigint, pr.crystal::bigint, pr.deuterium::bigint,
           COALESCE((SELECT quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id
                     WHERE ps.planet_id=pl.id AND st.code='small_cargo'),0) AS small,
           COALESCE((SELECT quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id
                     WHERE ps.planet_id=pl.id AND st.code='large_cargo'),0) AS large_
    FROM planets pl
    LEFT JOIN planet_resources pr ON pr.planet_id=pl.id
    WHERE pl.user_id='50da268b-d729-4f06-b8af-e03aa0437c1f' AND NOT pl.is_destroyed
    ORDER BY pl.planet_type, pl.is_main_planet DESC
  `);
  console.table(p.rows);

  // ¿Existe ya un autopilot para humanos?
  const fn = await c.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname ILIKE '%autopilot%' OR p.proname ILIKE '%auto_transport%' OR p.proname ILIKE '%human_tick%')
    ORDER BY proname
  `);
  console.log('Funciones autopilot/auto_transport:');
  console.table(fn.rows);

  // Cron jobs existentes
  try {
    const cron = await c.query(`SELECT jobname, schedule, command FROM cron.job ORDER BY jobname`);
    console.log('Cron jobs:');
    console.table(cron.rows);
  } catch(e) { console.log('cron.job no accesible:', e.message); }

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
