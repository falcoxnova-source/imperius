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
  
  // Check planets (not moons) for fields_used mismatch
  const { rows: planetStats } = await c.query(`
    SELECT 
      COUNT(*) as total_planets,
      COUNT(*) FILTER (WHERE p.fields_used != COALESCE(bldg.total_levels, 0)) as used_mismatch,
      COUNT(*) FILTER (WHERE p.fields_used > COALESCE(bldg.total_levels, 0)) as overcounted,
      COUNT(*) FILTER (WHERE p.fields_used < COALESCE(bldg.total_levels, 0)) as undercounted
    FROM planets p
    LEFT JOIN (
      SELECT planet_id, SUM(level) as total_levels
      FROM planet_buildings
      GROUP BY planet_id
    ) bldg ON bldg.planet_id = p.id
    WHERE p.planet_type = 'planet'
  `);
  console.log('=== PLANETS (non-moon) ===');
  console.log(planetStats[0]);
  
  // Show some examples of planet overcounting
  const { rows: examples } = await c.query(`
    SELECT p.name, p.galaxy, p.solar_system, p.position,
           p.fields_used, COALESCE(bldg.total_levels, 0)::int as actual_bldg_levels,
           p.fields_used - COALESCE(bldg.total_levels, 0)::int as diff,
           pr.username
    FROM planets p
    LEFT JOIN (
      SELECT planet_id, SUM(level) as total_levels
      FROM planet_buildings
      GROUP BY planet_id
    ) bldg ON bldg.planet_id = p.id
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type = 'planet'
      AND p.fields_used != COALESCE(bldg.total_levels, 0)
    ORDER BY (p.fields_used - COALESCE(bldg.total_levels, 0)::int) DESC
    LIMIT 20
  `);
  console.log('\nTop 20 planet overcounting examples:');
  for (const e of examples) {
    console.log(`  [${e.galaxy}:${e.solar_system}:${e.position}] ${e.name} (${e.username}) | fields_used=${e.fields_used} actual=${e.actual_bldg_levels} diff=+${e.diff}`);
  }
  
  // Moon summary
  const { rows: moonStats } = await c.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE p.fields_used > COALESCE(bldg.total_levels, 0)) as overcounted,
      COUNT(*) FILTER (WHERE p.fields_used = COALESCE(bldg.total_levels, 0)) as correct,
      COUNT(*) FILTER (WHERE p.fields_used < COALESCE(bldg.total_levels, 0)) as undercounted
    FROM planets p
    LEFT JOIN (
      SELECT planet_id, SUM(level) as total_levels
      FROM planet_buildings
      GROUP BY planet_id
    ) bldg ON bldg.planet_id = p.id
    WHERE p.planet_type = 'moon'
  `);
  console.log('\n=== MOON SUMMARY ===');
  console.log(moonStats[0]);
  
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
