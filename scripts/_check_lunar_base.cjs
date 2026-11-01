const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // 1. Find diablo user
  const u = await c.query(`SELECT id, email, username FROM profiles WHERE email ILIKE '%diablo%' OR username ILIKE '%diablo%' LIMIT 10`);
  console.log('=== diablo candidates ===');
  for (const r of u.rows) console.log(r.id, r.email, r.username);

  // 2. All moons with lunar_base, showing fields and discrepancy
  const r = await c.query(`
    SELECT p.id, p.name, p.fields_used, p.fields_max, COALESCE(pb.level, 0) AS lb_level,
           pr.email, pr.username,
           1 + COALESCE(pb.level, 0) * 3 AS expected_max
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id
      AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type = 'moon' AND NOT p.is_destroyed
    ORDER BY COALESCE(pb.level, 0) DESC, p.fields_max DESC
    LIMIT 30`);
  console.log('\n=== Top moons by lunar_base level ===');
  console.log('name | fields_used/fields_max | LB_lvl | expected | OK? | user');
  for (const row of r.rows) {
    const ok = row.fields_max === row.expected_max ? '✅' : '❌';
    console.log(`${row.name} | ${row.fields_used}/${row.fields_max} | LB=${row.lb_level} | exp=${row.expected_max} | ${ok} | ${row.email}`);
  }

  // 3. Check live optimized_global_queue_processor source for lunar_base formula
  const f = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor'`);
  const src = f.rows[0].prosrc;
  const idx = src.indexOf('lunar_base');
  console.log('\n=== optimized_global_queue_processor lunar_base block ===');
  if (idx > 0) console.log(src.substring(Math.max(0, idx - 200), idx + 1500));
  else console.log('NO lunar_base string found in function!');

  await c.end();
})();
