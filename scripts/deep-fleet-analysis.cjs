const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // 1. Get all functions that reference fleet_ships
  console.log('=== FUNCTIONS THAT REFERENCE fleet_ships ===');
  const res1 = await client.query(`
    SELECT proname, char_length(prosrc) as src_len
    FROM pg_proc
    WHERE prosrc ILIKE '%fleet_ships%'
    ORDER BY proname
  `);
  for (const row of res1.rows) {
    console.log(`  ${row.proname} (${row.src_len} chars)`);
  }

  // 2. Get the trigger function
  console.log('\n=== trigger_update_fleet_points_on_fleet_ships_change ===');
  const res2 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'trigger_update_fleet_points_on_fleet_ships_change'
  `);
  if (res2.rows.length > 0) {
    console.log(res2.rows[0].prosrc);
  }

  // 3. Get process_user_pending_fleets
  console.log('\n=== process_user_pending_fleets ===');
  const res3 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_user_pending_fleets'
  `);
  if (res3.rows.length > 0) {
    const lines = res3.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  // 4. Get recall_deployed_fleet
  console.log('\n=== recall_deployed_fleet ===');
  const res4 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'recall_deployed_fleet'
  `);
  if (res4.rows.length > 0) {
    const lines = res4.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  // 5. Get cancel_fleet
  console.log('\n=== cancel_fleet ===');
  const res5 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'cancel_fleet'
  `);
  if (res5.rows.length > 0) {
    const lines = res5.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  // 6. Check accelerate_fleet (which can instantly process fleets)
  console.log('\n=== accelerate_fleet ===');
  const res6 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'accelerate_fleet'
  `);
  if (res6.rows.length > 0) {
    const lines = res6.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  // 7. Look for completed transports in last 24h with their data
  console.log('\n=== COMPLETED TRANSPORTS (last 24h) with origin/target info ===');
  const res7 = await client.query(`
    SELECT f.id, f.user_id, 
           p_origin.name as origin_name, 
           p_origin.galaxy || ':' || p_origin.solar_system || ':' || p_origin.position as origin_coords,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target_coords,
           f.is_returning, f.is_completed,
           f.created_at, f.arrival_time, f.return_time,
           pr.username
    FROM fleets f
    LEFT JOIN planets p_origin ON f.origin_planet_id = p_origin.id
    LEFT JOIN profiles pr ON f.user_id = pr.id
    WHERE f.mission_type = 'transport'
    AND f.is_completed = true
    AND f.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY f.created_at DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(res7.rows, null, 2));

  await client.end();
}

main().catch(console.error);
