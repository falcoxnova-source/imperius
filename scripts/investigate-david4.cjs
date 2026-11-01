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

  // 1. Fleet timeline
  console.log('=== FLEET TIMELINE ===');
  const fleet = await client.query(`
    SELECT id, mission_type, 
           created_at, departure_time, arrival_time, return_time,
           is_returning, is_completed, 
           cargo_metal, cargo_crystal, cargo_deuterium
    FROM fleets WHERE id = $1
  `, [fleetId]);
  console.log(JSON.stringify(fleet.rows[0], null, 2));

  // 2. Current resources
  console.log('\n=== CURRENT PLANET RESOURCES ===');
  const res = await client.query(`
    SELECT planet_id, metal, crystal, deuterium, 
           metal_storage, crystal_storage, deuterium_storage,
           metal_per_hour, crystal_per_hour, deuterium_per_hour,
           last_update
    FROM planet_resources WHERE planet_id = $1
  `, [planetId]);
  console.log(JSON.stringify(res.rows[0], null, 2));

  // 3. Recent fleets from/to this planet
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

  // 4. Fleet ships remaining
  console.log('\n=== FLEET SHIPS FOR THIS FLEET ===');
  const shipCount = await client.query(`
    SELECT * FROM fleet_ships WHERE fleet_id = $1
  `, [fleetId]);
  console.log('Fleet ships rows:', shipCount.rows.length, shipCount.rows);

  // 5. Current DB function: calculate_planet_resources - check overflow logic
  console.log('\n=== VERIFY calculate_planet_resources OVERFLOW LOGIC ===');
  const funcDef = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'calculate_planet_resources'
    LIMIT 1
  `);
  if (funcDef.rows.length > 0) {
    const src = funcDef.rows[0].prosrc;
    const lines = src.split('\n');
    const relevantLines = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.includes('v_new_metal') || l.includes('v_new_crystal') || l.includes('v_new_deuterium') ||
          l.includes('overflow') || l.includes('freeze') || l.includes('storage')) {
        relevantLines.push(`  L${i+1}: ${l.trim()}`);
      }
    }
    console.log('Relevant resource capping lines:');
    relevantLines.forEach(l => console.log(l));
  }

  // 6. Current DB function: update_planet_resources
  console.log('\n=== VERIFY update_planet_resources ===');
  const func2 = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'update_planet_resources'
    LIMIT 1
  `);
  if (func2.rows.length > 0) {
    const src = func2.rows[0].prosrc;
    const lines = src.split('\n');
    const relevantLines = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.includes('LEAST') || l.includes('storage') || l.includes('metal') || l.includes('crystal') || l.includes('deuterium')) {
        relevantLines.push(`  L${i+1}: ${l.trim()}`);
      }
    }
    console.log('Relevant lines:');
    relevantLines.forEach(l => console.log(l));
  } else {
    console.log('Function update_planet_resources not found in DB');
  }

  // 7. Current DB function: process_fleet_arrival - return section
  console.log('\n=== VERIFY process_fleet_arrival RETURN LOGIC ===');
  const func3 = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'process_fleet_arrival'
    LIMIT 1
  `);
  if (func3.rows.length > 0) {
    const src = func3.rows[0].prosrc;
    const lines = src.split('\n');
    // Find the returning section
    let inReturning = false;
    const relevantLines = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.includes('is_returning') || l.includes('fleet_record.is_returning')) inReturning = true;
      if (inReturning && (l.includes('cargo') || l.includes('metal') || l.includes('crystal') || 
          l.includes('deuterium') || l.includes('LEAST') || l.includes('storage') || 
          l.includes('planet_resources') || l.includes('is_completed'))) {
        relevantLines.push(`  L${i+1}: ${l.trim()}`);
      }
      if (inReturning && l.includes('RETURN;')) {
        relevantLines.push(`  L${i+1}: ${l.trim()}`);
        break;
      }
    }
    console.log('Return fleet resource deposit logic:');
    relevantLines.forEach(l => console.log(l));
  }

  // 8. Check if any cron/trigger calls update_planet_resources
  console.log('\n=== TRIGGERS ON planet_resources ===');
  try {
    const triggers = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'planet_resources'
    `);
    console.log('Triggers:', JSON.stringify(triggers.rows, null, 2));
  } catch(e) {
    console.log('Error:', e.message);
  }

  // 9. Check cron jobs
  console.log('\n=== ALL CRON JOBS ===');
  try {
    const cron = await client.query(`SELECT jobid, schedule, command, jobname FROM cron.job`);
    console.log(JSON.stringify(cron.rows, null, 2));
  } catch(e) {
    console.log('No cron extension or no jobs:', e.message);
  }

  // 10. Check process_user_pending_fleets
  console.log('\n=== VERIFY process_user_pending_fleets ===');
  const func4 = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'process_user_pending_fleets'
    LIMIT 1
  `);
  if (func4.rows.length > 0) {
    const src = func4.rows[0].prosrc;
    console.log('Full function:');
    console.log(src);
  }

  await client.end();
}

investigate().catch(console.error);
