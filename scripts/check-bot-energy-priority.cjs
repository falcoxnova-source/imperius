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
  const q = await c.query(`
    SELECT bt.code,
           COUNT(*)::int AS total,
           SUM(CASE WHEN pres.energy_max - pres.energy_used < 0 THEN 1 ELSE 0 END)::int AS from_deficit_planet
    FROM building_queue bq
    JOIN planets p ON p.id = bq.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    JOIN planet_resources pres ON pres.planet_id = p.id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND bq.start_time > now() - interval '3 minutes'
    GROUP BY bt.code
    ORDER BY total DESC
  `);
  console.log('=== Edificios encolados a bots/autopilot en últimos 3 min ===');
  console.table(q.rows);

  // Cuenta total de planetas de bots en déficit ahora
  const def = await c.query(`
    SELECT
      SUM(CASE WHEN pres.energy_max - pres.energy_used < 0 THEN 1 ELSE 0 END)::int AS deficit_planets,
      COUNT(*)::int AS total_bot_planets
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    JOIN planet_resources pres ON pres.planet_id = p.id
    WHERE pr.is_bot = true OR pr.autopilot_active = true
  `);
  console.log('Planetas bot/autopilot:', def.rows[0]);
  await c.end();
})();
