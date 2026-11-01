const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  console.log('=== 1) Ataques activos AHORA MISMO (bots/autopilot → cualquier objetivo) ===');
  const active = await c.query(`
    SELECT pr.username AS attacker,
           f.origin_planet_id,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position AS target,
           pr2.username AS target_user,
           f.departure_time,
           f.arrival_time,
           f.is_completed,
           f.is_returning
    FROM fleets f
    JOIN profiles pr ON pr.id = f.user_id
    LEFT JOIN planets tp ON tp.galaxy = f.target_galaxy AND tp.solar_system = f.target_system AND tp.position = f.target_position
    LEFT JOIN profiles pr2 ON pr2.id = tp.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND f.mission_type = 'attack'
      AND f.is_completed = false
    ORDER BY f.arrival_time ASC
    LIMIT 20
  `);
  console.table(active.rows);

  console.log('\n=== 2) Últimos 20 ataques de bots (24h, ordenados por salida) ===');
  const recent = await c.query(`
    SELECT pr.username AS attacker,
           pr2.username AS target_user,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position AS coords,
           f.departure_time,
           f.arrival_time,
           f.return_time,
           f.is_completed
    FROM fleets f
    JOIN profiles pr ON pr.id = f.user_id
    LEFT JOIN planets tp ON tp.galaxy = f.target_galaxy AND tp.solar_system = f.target_system AND tp.position = f.target_position
    LEFT JOIN profiles pr2 ON pr2.id = tp.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND f.mission_type = 'attack'
      AND f.departure_time > now() - interval '24 hours'
    ORDER BY f.departure_time DESC
    LIMIT 20
  `);
  console.table(recent.rows);

  console.log('\n=== 3) Reportes de combate recientes donde un bot atacó (24h) ===');
  const reports = await c.query(`
    SELECT r.created_at,
           r.subject,
           pra.username AS attacker,
           prd.username AS defender
    FROM messages r
    LEFT JOIN profiles pra ON pra.id = (r.body::jsonb->>'attacker_id')::uuid
    LEFT JOIN profiles prd ON prd.id = r.user_id
    WHERE r.category = 'combat'
      AND r.created_at > now() - interval '24 hours'
      AND (pra.is_bot = true OR pra.autopilot_active = true)
    ORDER BY r.created_at DESC
    LIMIT 15
  `);
  console.table(reports.rows);

  console.log('\n=== 4) Top 10 bots más atacantes (últimas 24h) ===');
  const topAttackers = await c.query(`
    SELECT pr.username, COUNT(*)::int AS attacks_sent
    FROM fleets f
    JOIN profiles pr ON pr.id = f.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND f.mission_type = 'attack'
      AND f.departure_time > now() - interval '24 hours'
    GROUP BY pr.username
    ORDER BY attacks_sent DESC
    LIMIT 10
  `);
  console.table(topAttackers.rows);

  console.log('\n=== 5) Ataques de bots a USUARIOS REALES (últimas 24h) ===');
  const againstReal = await c.query(`
    SELECT pra.username AS attacker,
           prd.username AS victim,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position AS coords,
           f.departure_time,
           f.is_completed
    FROM fleets f
    JOIN profiles pra ON pra.id = f.user_id
    JOIN planets tp ON tp.galaxy = f.target_galaxy AND tp.solar_system = f.target_system AND tp.position = f.target_position
    JOIN profiles prd ON prd.id = tp.user_id
    WHERE (pra.is_bot = true OR pra.autopilot_active = true)
      AND COALESCE(prd.is_bot, false) = false
      AND COALESCE(prd.autopilot_active, false) = false
      AND f.mission_type = 'attack'
      AND f.departure_time > now() - interval '24 hours'
    ORDER BY f.departure_time DESC
    LIMIT 20
  `);
  console.table(againstReal.rows);

  await c.end();
})();
