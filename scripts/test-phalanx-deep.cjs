const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // 1. Get full function source
  const funcRes = await client.query(`
    SELECT prosrc, proargnames, proargtypes, prorettype::regtype as rettype
    FROM pg_proc WHERE proname = 'phalanx_scan'
  `);
  console.log('=== PHALANX_SCAN FUNCTION SOURCE ===');
  console.log('Return type:', funcRes.rows[0].rettype);
  console.log('Arg names:', funcRes.rows[0].proargnames);
  console.log('\n--- SOURCE CODE ---');
  console.log(funcRes.rows[0].prosrc);
  console.log('--- END SOURCE ---\n');

  // 2. Check recent migrations that might affect phalanx
  const migrations = await client.query(`
    SELECT name FROM supabase_migrations.schema_migrations 
    WHERE name ILIKE '%phalanx%' 
    ORDER BY name
  `);
  console.log('=== Migrations mentioning phalanx ===');
  migrations.rows.forEach(r => console.log('  ', r.name));

  // 3. Check if there's any issue with the function finding the moon's planet_buildings
  // Simulate a scan: find a moon with phalanx and check if querying works
  const moonCheck = await client.query(`
    SELECT p.id as moon_id, p.user_id, p.galaxy, p.solar_system, p.position,
      pb.level as phalanx_level,
      bt.code as building_code,
      res.deuterium
    FROM planets p
    JOIN planet_buildings pb ON pb.planet_id = p.id
    JOIN building_types bt ON bt.id = pb.building_type_id
    JOIN planet_resources res ON res.planet_id = p.id
    WHERE p.planet_type = 'moon'
    AND bt.code = 'sensor_phalanx'
    AND pb.level > 0
    AND res.deuterium >= 5000
    ORDER BY pb.level DESC
    LIMIT 5
  `);
  console.log('\n=== Moons with phalanx AND enough deuterium ===');
  moonCheck.rows.forEach(r => {
    console.log(`  Moon ${r.moon_id} | User ${r.user_id} | [${r.galaxy}:${r.solar_system}:${r.position}] | PH Lvl ${r.phalanx_level} | Deut: ${Math.floor(r.deuterium)}`);
  });

  // 4. For a moon with enough deuterium, simulate what the function does step by step
  if (moonCheck.rows.length > 0) {
    const moon = moonCheck.rows[0];
    const range = (moon.phalanx_level * moon.phalanx_level) - 1;
    console.log(`\n=== Simulating scan for moon [${moon.galaxy}:${moon.solar_system}:${moon.position}] (range: ${range} systems) ===`);

    // Find a target planet in range with active fleets
    const targetFleets = await client.query(`
      SELECT f.id, f.user_id, f.mission_type, f.arrival_time, f.return_time,
        f.origin_galaxy, f.origin_system, f.origin_position,
        f.target_galaxy, f.target_system, f.target_position,
        f.is_returning, f.fleet_composition,
        p_origin.name as origin_name,
        pr.username as fleet_owner
      FROM fleets f
      JOIN planets p_origin ON p_origin.id = f.origin_planet_id
      JOIN profiles pr ON pr.id = f.user_id
      WHERE f.is_completed = false
      AND (
        (f.target_galaxy = $1 AND f.target_system BETWEEN $2 AND $3)
        OR (f.origin_galaxy = $1 AND f.origin_system BETWEEN $2 AND $3 AND f.is_returning = true)
      )
      LIMIT 10
    `, [moon.galaxy, moon.solar_system - range, moon.solar_system + range]);

    console.log(`Found ${targetFleets.rows.length} fleets in range:`);
    targetFleets.rows.forEach(f => {
      console.log(`  Fleet ${f.id.substring(0,8)} | ${f.fleet_owner} | ${f.mission_type} | [${f.origin_galaxy}:${f.origin_system}:${f.origin_position}] -> [${f.target_galaxy}:${f.target_system}:${f.target_position}] | returning: ${f.is_returning}`);
    });

    // Now check what the phalanx function ACTUALLY queries
    // The function looks for fleets going to/from a SPECIFIC planet position
    // Let's find a specific target planet that has fleet activity
    const planetWithFleets = await client.query(`
      SELECT DISTINCT f.target_galaxy as g, f.target_system as s, f.target_position as pos, COUNT(*) as cnt
      FROM fleets f
      WHERE f.is_completed = false
      AND f.target_galaxy = $1
      AND f.target_system BETWEEN $2 AND $3
      GROUP BY f.target_galaxy, f.target_system, f.target_position
      ORDER BY cnt DESC
      LIMIT 5
    `, [moon.galaxy, moon.solar_system - range, moon.solar_system + range]);

    console.log('\nPlanets in range with incoming fleets:');
    planetWithFleets.rows.forEach(p => {
      console.log(`  [${p.g}:${p.s}:${p.pos}] - ${p.cnt} fleets`);
    });
  }

  // 5. Check if the function's fleet query matches what we expect
  // Parse the function source for the fleet query
  const src = funcRes.rows[0].prosrc;
  
  // Check if function returns destination or target coordinates
  const hasDestination = src.includes('destination');
  const hasTarget = src.includes('target_galaxy');
  console.log('\n=== Function query analysis ===');
  console.log('Uses "destination" key:', hasDestination);
  console.log('Uses "target_galaxy" column:', hasTarget);
  
  // Check what JSON keys the function returns
  const jsonKeys = src.match(/json_build_object\(([\s\S]*?)\)/g);
  if (jsonKeys) {
    console.log('\nJSON build patterns found:');
    jsonKeys.forEach((k, i) => console.log(`  Pattern ${i+1}: ${k.substring(0, 200)}...`));
  }

  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
