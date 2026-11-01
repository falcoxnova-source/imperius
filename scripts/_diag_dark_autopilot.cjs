const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();

  // Estado actual
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
    WHERE pl.user_id='50da268b-d729-4f06-b8af-e03aa0437c1f' AND NOT pl.is_destroyed
    ORDER BY pl.autopilot_role, pl.name
  `);
  console.log('Planetas PIPI:');
  console.table(p.rows);

  // Last manual action
  const pr = await c.query(`SELECT last_manual_action, NOW() - last_manual_action AS since, autopilot_vip_boost, autopilot_vip_boost_expires_at FROM profiles WHERE id='50da268b-d729-4f06-b8af-e03aa0437c1f'`);
  console.log('PIPI autopilot:', pr.rows[0]);

  // Ver el IF que decide procesar humanos:
  const fn = await c.query(`SELECT substring(prosrc FROM position('last_manual_action' IN prosrc) FOR 500) AS snippet FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  console.log('--- condición last_manual_action ---');
  console.log(fn.rows[0].snippet);

  // Eventos de las últimas 2 horas para este user
  const ev = await c.query(`SELECT created_at, planet_id, event_type, payload FROM autopilot_events WHERE user_id='50da268b-d729-4f06-b8af-e03aa0437c1f' AND created_at > now() - interval '2 hours' ORDER BY created_at DESC LIMIT 20`);
  console.log('Eventos autopilot PIPI últimas 2h:');
  console.table(ev.rows);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
