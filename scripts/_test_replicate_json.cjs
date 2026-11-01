const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();

  // Replicar EXACTO el SELECT...UNION ALL del autopilot
  const r = await c.query(`
    WITH vars AS (
      SELECT 1 AS v_small_cargo_type_id, 2 AS v_large_cargo_type_id,
             100::int AS v_small_cargo_count, 102::int AS v_large_cargo_count,
             'miner'::text AS v_planet_role
    )
    SELECT jsonb_agg(x) AS fleet
    FROM (
      SELECT jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', LEAST(GREATEST(v_small_cargo_count - 1, 0), 100)) AS x
      FROM vars
      WHERE (SELECT v_small_cargo_count FROM vars) > 1
      UNION ALL
      SELECT jsonb_build_object('ship_type_id', v_large_cargo_type_id, 'quantity', LEAST(v_large_cargo_count, 100)) AS x
      FROM vars
      WHERE (SELECT v_planet_role FROM vars) = 'miner' AND (SELECT v_large_cargo_count FROM vars) > 0
    ) s
  `);
  console.log('jsonb produced:', JSON.stringify(r.rows[0].fleet));

  // Ahora probarla con esa jsonb exacta
  const fleet = r.rows[0].fleet;
  await c.query('BEGIN');
  try {
    const r2 = await c.query(`
      SELECT secure_send_fleet(
        p_origin_planet_id := '7d506b35-745c-45c1-8722-26642245ede3'::uuid,
        p_target_galaxy := 2, p_target_system := 22, p_target_position := 5,
        p_mission_type := 'transport',
        p_fleet_ships := $1::jsonb,
        p_cargo_metal := 315682, p_cargo_crystal := 431720, p_cargo_deuterium := 0,
        p_speed_percent := 100, p_target_type := 'planet',
        p_override_user_id := '9700c4e0-d0e4-4efa-baf7-e9cb97945b16'::uuid
      ) AS r
    `, [JSON.stringify(fleet)]);
    console.log('Result con fleet replicado:', JSON.stringify(r2.rows[0].r));
  } catch(e) { console.log('ERR:', e.message); }
  await c.query('ROLLBACK');

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
