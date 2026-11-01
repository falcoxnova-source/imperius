const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const sql = fs.readFileSync('supabase/migrations/20260422_lunar_base_fields_trigger.sql', 'utf8');
  try {
    await c.query(sql);
    console.log('✅ trigger + backfill applied');
  } catch (e) {
    console.error('❌', e.message); process.exit(1);
  }

  // Verify: re-check all moons
  const r = await c.query(`
    SELECT p.id, p.name, p.fields_used, p.fields_max, COALESCE(pb.level, 0) AS lb_level,
           pr.email,
           1 + COALESCE(pb.level, 0)*3 AS expected_min
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id
      AND pb.building_type_id = (SELECT id FROM building_types WHERE code='lunar_base')
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type='moon' AND NOT p.is_destroyed
      AND p.fields_max < 1 + COALESCE(pb.level,0)*3
    ORDER BY 1 + COALESCE(pb.level, 0)*3 - p.fields_max DESC`);
  console.log('\nMoons STILL with fields_max < expected (should be 0):', r.rows.length);
  for (const row of r.rows.slice(0, 10)) console.log(row);

  // Confirm diablo moon 2 specifically
  const d = await c.query(`
    SELECT p.name, p.fields_used, p.fields_max, COALESCE(pb.level,0) AS lb_level
      FROM planets p
      LEFT JOIN planet_buildings pb ON pb.planet_id=p.id AND pb.building_type_id=15
     WHERE p.id='13f7c222-9e97-48ea-9abf-0e56d1272214'`);
  console.log('\ndiablo moon 2 after fix:', d.rows[0]);

  // Confirm trigger exists
  const t = await c.query(`
    SELECT trigger_name FROM information_schema.triggers
     WHERE event_object_table='planet_buildings'
       AND trigger_name='trigger_enforce_lunar_base_fields_max'`);
  console.log('trigger present:', t.rows.length === 1 ? '✅' : '❌');

  await c.end();
})();
