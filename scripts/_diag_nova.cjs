const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const ID='9700c4e0-d0e4-4efa-baf7-e9cb97945b16';

  // 1. Estado elegibilidad
  const e = await c.query(`
    SELECT username, is_bot, autopilot_active, autopilot_eligible,
           has_autopilot_access(id) AS access,
           last_manual_action, NOW() - last_manual_action AS since,
           (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id)
             AND ((autopilot_vip_boost = true AND (autopilot_vip_boost_expires_at IS NULL OR autopilot_vip_boost_expires_at > NOW()))
                  OR last_manual_action IS NULL
                  OR last_manual_action < NOW() - INTERVAL '5 minutes'))) AS processed_by_tick
    FROM profiles WHERE id=$1`,[ID]);
  console.log('Eligibilidad NOVA:', e.rows[0]);

  // 2. Planetas NOVA
  const p = await c.query(`
    SELECT pl.id, pl.name, pl.autopilot_role,
           pl.galaxy||':'||pl.solar_system||':'||pl.position AS coords,
           pr.metal::bigint AS metal, pr.crystal::bigint AS crystal, pr.deuterium::bigint AS deut,
           COALESCE((SELECT quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id
                     WHERE ps.planet_id=pl.id AND st.code='small_cargo'),0) AS small,
           COALESCE((SELECT quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id
                     WHERE ps.planet_id=pl.id AND st.code='large_cargo'),0) AS large_,
           (SELECT count(*) FROM fleets f WHERE f.origin_planet_id=pl.id AND f.is_completed=false) AS active_fleets,
           (SELECT count(*) FROM fleets f
              JOIN planets op ON op.galaxy=f.target_galaxy AND op.solar_system=f.target_system AND op.position=f.target_position
              WHERE f.user_id=pl.user_id AND f.mission_type='transport' AND f.is_completed=false
                AND op.autopilot_role='military' AND op.user_id=pl.user_id) AS transports_to_military
    FROM planets pl LEFT JOIN planet_resources pr ON pr.planet_id=pl.id
    WHERE pl.user_id=$1 AND NOT pl.is_destroyed
    ORDER BY pl.is_main_planet DESC, pl.name`,[ID]);
  console.log('Planetas NOVA:');
  console.table(p.rows);

  // 3. Ejecutar tick y capturar eventos de NOVA
  const before = new Date();
  console.log('\n🚀 Ejecutando bot_ai_tick...');
  const t = await c.query(`SELECT bot_ai_tick() AS r`);
  console.log('Stats tick:', JSON.stringify(t.rows[0].r));

  // 4. Eventos NOVA tras tick
  const ev = await c.query(`SELECT created_at, planet_id, event_type, payload FROM autopilot_events WHERE user_id=$1 AND created_at >= $2 ORDER BY created_at DESC`,[ID,before]);
  console.log('Eventos NOVA en este tick:');
  console.table(ev.rows);

  // 5. Flotas NOVA activas
  const f = await c.query(`
    SELECT f.id, po.name AS origin, po.autopilot_role AS origin_role,
           f.target_galaxy||':'||f.target_system||':'||f.target_position AS target,
           f.mission_type, f.departure_time
    FROM fleets f JOIN planets po ON po.id=f.origin_planet_id
    WHERE f.user_id=$1 AND f.is_completed=false
    ORDER BY f.departure_time DESC`,[ID]);
  console.log('Flotas NOVA activas:');
  console.table(f.rows);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
