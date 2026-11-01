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

  // 1. Full secure_send_fleet source - mission type check
  console.log('=== secure_send_fleet - mission type validation ===');
  const { rows: sendFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (sendFn.length > 0) {
    const src = sendFn[0].prosrc;
    // Find mission type validation
    const idx = src.indexOf('NOT IN');
    if (idx >= 0) {
      console.log(src.substring(Math.max(0, idx - 50), Math.min(src.length, idx + 300)));
    }
  }

  // 2. Full validate_fleet_mission - destroy specific validation
  console.log('\n=== validate_fleet_mission - FULL destroy handling ===');
  const { rows: valFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'validate_fleet_mission'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (valFn.length > 0) {
    const src = valFn[0].prosrc;
    // Find destroy-specific validation
    const destroySection = src.indexOf("'destroy' THEN");
    if (destroySection >= 0) {
      console.log('=== DESTROY specific section ===');
      console.log(src.substring(destroySection, destroySection + 800));
    } else {
      console.log('No specific destroy THEN section found');
      // Check if destroy is validated with other missions
      const destroyIdx = src.indexOf("p_mission_type = 'destroy'");
      if (destroyIdx >= 0) {
        console.log('Found destroy check:');
        console.log(src.substring(Math.max(0, destroyIdx - 100), destroyIdx + 400));
      }
    }
  }

  // 3. Check process_moon_destruction function
  console.log('\n=== process_moon_destruction ===');
  const { rows: moonFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'process_moon_destruction'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (moonFn.length > 0) {
    console.log(moonFn[0].prosrc);
  } else {
    console.log('Function not found!');
  }

  // 4. Check if any fleet ever used destroy mission
  console.log('\n=== Historical destroy missions ===');
  const { rows: destroyFleets } = await c.query(`
    SELECT id, user_id, mission_type, is_completed, is_returning, created_at
    FROM fleets 
    WHERE mission_type = 'destroy' 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.log('Total destroy fleets found:', destroyFleets.length);
  for (const f of destroyFleets) {
    console.log(`  ${f.id} - completed: ${f.is_completed}, returning: ${f.is_returning}`);
  }

  // 5. Check moons in the game
  console.log('\n=== Moons in the game ===');
  const { rows: moons } = await c.query(`
    SELECT p.id, p.name, p.galaxy, p.solar_system, p.position, p.diameter, pr.username
    FROM planets p
    LEFT JOIN profiles pr ON p.user_id = pr.id
    WHERE p.planet_type = 'moon'
    ORDER BY p.created_at DESC
    LIMIT 20
  `);
  console.log('Total moons:', moons.length);
  for (const m of moons) {
    console.log(`  [${m.galaxy}:${m.solar_system}:${m.position}] ${m.name} - ${m.username || 'No owner'} (diameter: ${m.diameter})`);
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
