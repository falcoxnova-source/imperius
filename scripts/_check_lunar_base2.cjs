const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Check lunar_base id
  const bt = await c.query(`SELECT id, code, name FROM building_types WHERE code='lunar_base'`);
  console.log('lunar_base building_type:', bt.rows);

  // Get more context from function
  const f = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor'`);
  const src = f.rows[0].prosrc;
  const idx = src.indexOf('Lunar Base on a moon');
  console.log('--- Lunar Base block ---');
  if (idx > 0) console.log(src.substring(idx - 100, idx + 2500));

  // Check diablo's moon
  const m = await c.query(`
    SELECT p.id, p.name, p.planet_type, p.fields_used, p.fields_max,
           COALESCE(pb.level, 0) AS lb_level
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id
      AND pb.building_type_id = (SELECT id FROM building_types WHERE code='lunar_base')
    WHERE p.user_id = 'be36cab6-0582-4ce2-bf24-6512abe62d9d'
      AND p.planet_type = 'moon'`);
  console.log('\n=== diablo moons ===');
  for (const row of m.rows) console.log(row);

  await c.end();
})();
