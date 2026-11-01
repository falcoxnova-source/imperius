const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function investigate() {
  await client.connect();
  const userId = '4e46ba8f-6fe3-477e-85c2-dca300e3b7a3';
  const fleetId = 'c972f54b-a162-4159-afe7-1aac38b87612';
  const planetId = '1473a75a-ef98-495b-a6c0-b9e9dc0889cd';

  // 1. Check fleet timestamps to determine when it was created, cancelled, and completed
  console.log('=== FLEET TIMELINE ===');
  const fleet = await client.query(`
    SELECT id, mission_type, 
           created_at, departure_time, arrival_time, return_time,
           is_returning, is_completed, 
           cargo_metal, cargo_crystal, cargo_deuterium
    FROM fleets WHERE id = $1
  `, [fleetId]);
  console.log(JSON.stringify(fleet.rows[0], null, 2));

  // 2. Check current resource values + last_update
  console.log('\n=== CURRENT PLANET RESOURCES ===');
  const res = await client.query(`
    SELECT planet_id, metal, crystal, deuterium, 
           metal_storage, crystal_storage, deuterium_storage,
           metal_per_hour, crystal_per_hour, deuterium_per_hour,
           last_update
    FROM planet_resources WHERE planet_id = $1
  `, [planetId]);
  console.log(JSON.stringify(res.rows[0], null, 2));

  // 3. Check if update_planet_resources is used anywhere (triggers, cron)
  console.log('\n=== FUNCTIONS THAT REFERENCE update_planet_resources ===');
  const refs = await client.query(`
    SELECT routine_name, routine_definition 
    FROM information_schema.routines 
    WHERE routine_definition LIKE '%update_planet_resources%'
    AND routine_schema = 'public'
  `);
  console.log('Functions referencing update_planet_resources:', refs.rows.map(r => r.routine_name));

  // 4. Check if there's a cron job that calls resource updates
  console.log('\n=== CRON JOBS ===');
  try {
    const cron = await client.query(`
      SELECT jobid, schedule, command, jobname 
      FROM cron.job 
      WHERE command LIKE '%resource%' OR command LIKE '%planet%' OR command LIKE '%update%'
    `);
    console.log(JSON.stringify(cron.rows, null, 2));
  } catch (e) {
    console.log('No cron access or no matching jobs:', e.message);
  }

  // 5. Check fleet_logs for this fleet
  console.log('\n=== FLEET LOGS ===');
  const logs = await client.query(`
    SELECT * FROM fleet_logs 
    WHERE fleet_id = $1 
    ORDER BY created_at DESC 
    LIMIT 10
  `, [fleetId]);
  if (logs.rows.length === 0) {
    console.log('No fleet logs found');
  } else {
    console.log(JSON.stringify(logs.rows, null, 2));
  }

  // 6. Check all fleet activity for this planet around the fleet times
  console.log('\n=== RECENT FLEETS FROM/TO THIS PLANET ===');
  const recentFleets = await client.query(`
    SELECT id, mission_type, is_returning, is_completed,
           cargo_metal, cargo_crystal, cargo_deuterium,
           created_at, arrival_time, return_time,
           origin_planet_id, 
           target_galaxy || ':' || target_system || ':' || target_position as target
    FROM fleets 
    WHERE (origin_planet_id = $1 OR (target_galaxy = 1 AND target_system = 104 AND target_position = 10))
    AND created_at >= NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 20
  `, [planetId]);
  console.log(JSON.stringify(recentFleets.rows, null, 2));

  // 7. Check if the process_fleet_arrival actually ran by looking at fleet state
  console.log('\n=== CHECK: Was cargo deposited? ===');
  // If is_completed=true AND fleet_ships is empty, the fleet WAS processed
  // But were resources actually added?
  const shipCount = await client.query(`
    SELECT COUNT(*) as ship_count FROM fleet_ships WHERE fleet_id = $1
  `, [fleetId]);
  console.log('Fleet ships remaining:', shipCount.rows[0].ship_count);
  console.log('Fleet is_completed:', fleet.rows[0]?.is_completed);

  // 8. Check the current version of calculate_planet_resources to verify overflow fix
  console.log('\n=== VERIFY OVERFLOW FIX IN DB ===');
  const funcDef = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'calculate_planet_resources'
    LIMIT 1
  `);
  if (funcDef.rows.length > 0) {
    const src = funcDef.rows[0].prosrc;
    // Find the lines around LEAST and storage
    const lines = src.split('\n');
    const relevantLines = lines.filter(l => 
      l.includes('v_new_metal') || l.includes('v_new_crystal') || l.includes('v_new_deuterium') ||
      l.includes('LEAST') || l.includes('v_metal_storage') || l.includes('overflow') || l.includes('freeze')
    );
    console.log('Relevant lines from current calculate_planet_resources:');
    relevantLines.forEach(l => console.log('  ', l.trim()));
  }

  // 9. Also check update_planet_resources current version
  console.log('\n=== VERIFY update_planet_resources IN DB ===');
  const func2 = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'update_planet_resources'
    LIMIT 1
  `);
  if (func2.rows.length > 0) {
    const src = func2.rows[0].prosrc;
    const lines = src.split('\n');
    const relevantLines = lines.filter(l => 
      l.includes('LEAST') || l.includes('metal') || l.includes('crystal') || l.includes('deuterium') || l.includes('storage')
    );
    console.log('Relevant lines from current update_planet_resources:');
    relevantLines.forEach(l => console.log('  ', l.trim()));
  }

  await client.end();
}

investigate().catch(console.error);
