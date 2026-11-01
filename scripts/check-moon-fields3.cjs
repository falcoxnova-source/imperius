const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();
  
  // 1) Check if the trigger exists
  const { rows: triggers } = await c.query(`
    SELECT trigger_name, event_manipulation, action_timing, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'planet_buildings'
    ORDER BY trigger_name
  `);
  console.log('=== TRIGGERS ON planet_buildings ===');
  for (const t of triggers) {
    console.log(`  ${t.trigger_name}: ${t.action_timing} ${t.event_manipulation} → ${t.action_statement}`);
  }
  
  // 2) Check the sync_planet_fields function source
  const { rows: fnSrc } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'sync_planet_fields'
  `);
  if (fnSrc.length) {
    console.log('\n=== sync_planet_fields function ===');
    console.log(fnSrc[0].prosrc);
  } else {
    console.log('\n=== sync_planet_fields: NOT FOUND ===');
  }
  
  // 3) Trace the flow for a specific example
  // Luciffer's moon [5:276:15]
  const { rows: lucMoon } = await c.query(`
    SELECT p.id, p.name, p.fields_used, p.fields_max, p.galaxy, p.solar_system, p.position
    FROM planets p
    WHERE p.galaxy = 5 AND p.solar_system = 276 AND p.position = 15 AND p.planet_type = 'moon'
  `);
  console.log('\n=== Luciffer Moon [5:276:15] ===');
  console.log(lucMoon[0]);
  
  const { rows: lucBldgs } = await c.query(`
    SELECT bt.code, pb.level
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = $1
    ORDER BY bt.code
  `, [lucMoon[0].id]);
  console.log('Buildings:', lucBldgs);
  console.log('Sum of levels:', lucBldgs.reduce((s, b) => s + b.level, 0));
  
  // 4) Count moons where fields_used != sum(building_levels)
  const { rows: stats } = await c.query(`
    SELECT 
      COUNT(*) as total_moons,
      COUNT(*) FILTER (WHERE p.fields_used != COALESCE(bldg.total_levels, 0)) as used_mismatch,
      COUNT(*) FILTER (WHERE p.fields_max != 1 + COALESCE(lb.level, 0) * 3) as max_mismatch
    FROM planets p
    LEFT JOIN (
      SELECT planet_id, SUM(level) as total_levels
      FROM planet_buildings
      GROUP BY planet_id
    ) bldg ON bldg.planet_id = p.id
    LEFT JOIN (
      SELECT pb.planet_id, pb.level
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE bt.code = 'lunar_base'
    ) lb ON lb.planet_id = p.id
    WHERE p.planet_type = 'moon'
  `);
  console.log('\n=== SUMMARY ===');
  console.log(stats[0]);
  
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
