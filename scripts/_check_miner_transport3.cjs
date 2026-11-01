const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();

  // Diagnóstico: para cada bot con miner+military, ver recursos y cargueros en el miner
  const q = await c.query(`
    WITH mm AS (
      SELECT p.user_id
      FROM planets p
      JOIN profiles pr ON pr.id = p.user_id AND pr.is_bot
      WHERE p.planet_type='planet' AND NOT p.is_destroyed
      GROUP BY p.user_id
      HAVING count(*) FILTER (WHERE p.autopilot_role='miner') >= 1
         AND count(*) FILTER (WHERE p.autopilot_role='military') >= 1
    )
    SELECT pr.username,
           pl.id AS planet_id,
           pl.autopilot_role,
           pl.galaxy || ':' || pl.solar_system || ':' || pl.position AS coords,
           pr2.metal::bigint AS metal, pr2.crystal::bigint AS crystal, pr2.deuterium::bigint AS deut,
           COALESCE((SELECT quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id
                     WHERE ps.planet_id=pl.id AND lower(st.name) LIKE '%carga pequ%'), 0) AS small_cargo,
           COALESCE((SELECT quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id
                     WHERE ps.planet_id=pl.id AND lower(st.name) LIKE '%carga grande%'), 0) AS large_cargo,
           (SELECT count(*) FROM fleets f WHERE f.origin_planet_id=pl.id AND f.is_completed=false) AS active_fleets
    FROM planets pl
    JOIN mm ON mm.user_id = pl.user_id
    JOIN profiles pr ON pr.id = pl.user_id
    JOIN planet_resources pr2 ON pr2.planet_id = pl.id
    WHERE pl.autopilot_role IN ('miner','military')
      AND pl.planet_type='planet' AND NOT pl.is_destroyed
    ORDER BY pr.username, pl.autopilot_role
  `);
  console.table(q.rows);

  // Verificar si la función bot_ai_tick aún contiene Phase H
  const fn = await c.query(`
    SELECT
      POSITION('Phase H: Transport resources' IN p.prosrc) > 0 AS has_phaseH,
      POSITION('transport_sent' IN p.prosrc) > 0 AS emits_transport_sent,
      POSITION($$v_planet_role = 'miner'$$ IN p.prosrc) > 0 AS checks_miner_role
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'
  `);
  console.log('bot_ai_tick state:', fn.rows[0]);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
