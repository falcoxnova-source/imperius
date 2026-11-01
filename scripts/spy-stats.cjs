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

  const s = await c.query(`
    SELECT SUM(CASE WHEN f.departure_time > now() - interval '5 minutes' THEN 1 ELSE 0 END)::int AS last5m,
           SUM(CASE WHEN f.departure_time > now() - interval '1 hour' THEN 1 ELSE 0 END)::int AS last1h,
           SUM(CASE WHEN f.departure_time > now() - interval '24 hours' THEN 1 ELSE 0 END)::int AS last24h
    FROM fleets f
    JOIN profiles pr ON pr.id = f.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND f.mission_type = 'espionage'
  `);
  console.log('Espionajes de bots (totales):');
  console.table(s.rows);

  const v = await c.query(`
    SELECT COALESCE(prd.username, '??') AS victim, COUNT(*)::int AS spies
    FROM fleets f
    JOIN profiles pra ON pra.id = f.user_id
    LEFT JOIN planets tp ON tp.galaxy=f.target_galaxy AND tp.solar_system=f.target_system AND tp.position=f.target_position
    LEFT JOIN profiles prd ON prd.id = tp.user_id
    WHERE (pra.is_bot = true OR pra.autopilot_active = true)
      AND f.mission_type = 'espionage'
      AND f.departure_time > now() - interval '24 hours'
    GROUP BY prd.username
    ORDER BY spies DESC
    LIMIT 10
  `);
  console.log('Top víctimas de espionaje (24h):');
  console.table(v.rows);
  await c.end();
})();
