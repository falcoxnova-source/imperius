const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Check if there are other lunar_base-related codes or moon-related checks
  // Also show Roberto's moons to understand fields_max=21 at LB=5
  const r = await c.query(`
    SELECT p.id, p.name, p.planet_type, p.fields_used, p.fields_max, p.diameter,
           COALESCE(pb.level, 0) AS lb_level,
           1 + COALESCE(pb.level, 0)*3 AS expected_max,
           p.created_at
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id
      AND pb.building_type_id = 15
    WHERE p.user_id = (SELECT id FROM profiles WHERE email='robertoramirez961105@gmail.com')
      AND p.planet_type = 'moon'`);
  console.log('=== Roberto moons ===');
  for (const row of r.rows) console.log(row);

  // Diablo moon 2 history
  const q = await c.query(`
    SELECT id, planet_id, building_type_id, target_level, queue_position, start_time, end_time
    FROM building_queue WHERE planet_id = '13f7c222-9e97-48ea-9abf-0e56d1272214'`);
  console.log('\n=== diablo moon 2 pending queue ===');
  for (const row of q.rows) console.log(row);

  // All buildings on that moon
  const pb = await c.query(`
    SELECT pb.level, bt.code, bt.name
    FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = '13f7c222-9e97-48ea-9abf-0e56d1272214' ORDER BY bt.code`);
  console.log('\n=== diablo moon 2 buildings ===');
  for (const row of pb.rows) console.log(row);

  // Count buildings with level > 0
  const cnt = await c.query(`
    SELECT COUNT(*) FROM planet_buildings
    WHERE planet_id='13f7c222-9e97-48ea-9abf-0e56d1272214' AND level > 0`);
  console.log('distinct buildings >0 level:', cnt.rows[0].count);

  await c.end();
})();
