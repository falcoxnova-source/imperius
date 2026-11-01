const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const ID='9700c4e0-d0e4-4efa-baf7-e9cb97945b16';

  // Eventos de NOVA últimos 10 min
  const ev = await c.query(`SELECT created_at, planet_id, event_type, payload FROM autopilot_events WHERE user_id=$1 AND created_at > now() - interval '10 minutes' ORDER BY created_at DESC LIMIT 20`,[ID]);
  console.log('Eventos NOVA últimos 10min:');
  console.table(ev.rows);

  // Flotas NOVA
  const f = await c.query(`
    SELECT f.id, po.name AS origin, po.autopilot_role AS origin_role,
           f.target_galaxy||':'||f.target_system||':'||f.target_position AS target,
           f.mission_type, f.is_completed, f.departure_time
    FROM fleets f JOIN planets po ON po.id=f.origin_planet_id
    WHERE f.user_id=$1 AND f.is_completed=false
    ORDER BY f.departure_time DESC`,[ID]);
  console.log('Flotas activas NOVA:');
  console.table(f.rows);

  // Última manual action
  const pr = await c.query(`SELECT username, last_manual_action, NOW() - last_manual_action AS since FROM profiles WHERE id=$1`,[ID]);
  console.log('NOVA last_manual_action:', pr.rows[0]);

  // Dry-run desde Andrómeda (miner) hacia Destiny (military)
  await c.query('BEGIN');
  try {
    const r = await c.query(`
      SELECT secure_send_fleet(
        p_origin_planet_id := '7d506b35-745c-45c1-8722-26642245ede3'::uuid,
        p_target_galaxy := 2, p_target_system := 22, p_target_position := 5,
        p_mission_type := 'transport',
        p_fleet_ships := jsonb_build_array(
          jsonb_build_object('ship_type_id', 1, 'quantity', 99),
          jsonb_build_object('ship_type_id', 2, 'quantity', 100)
        ),
        p_cargo_metal := 100000, p_cargo_crystal := 100000, p_cargo_deuterium := 0,
        p_speed_percent := 100, p_target_type := 'planet',
        p_override_user_id := $1::uuid
      ) AS r`, [ID]);
    console.log('Andrómeda→Destiny (99+100):', JSON.stringify(r.rows[0].r));
  } catch(e) { console.log('ERR:', e.message); }
  await c.query('ROLLBACK');

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
