const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  const userId = '361fbc06-8d5b-41c5-8e76-e3afee01f342'; // Zeratul

  // 1. Check battle_reports schema
  console.log('=== BATTLE_REPORTS COLUMNS ===');
  const brCols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'battle_reports' ORDER BY ordinal_position
  `);
  console.log(brCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join(', '));

  // 2. Check recent battle reports where Zeratul is defender
  console.log('\n=== BATTLE REPORTS WHERE ZERATUL IS DEFENDER ===');
  const battleReports = await c.query(`
    SELECT * FROM battle_reports WHERE defender_id = $1 ORDER BY created_at DESC LIMIT 5
  `, [userId]);
  for (const br of battleReports.rows) {
    console.log(`Battle ${br.id}: result=${br.result}, created=${br.created_at}`);
    if (br.defender_losses) console.log('  Defender losses:', JSON.stringify(br.defender_losses));
    if (br.attacker_losses) console.log('  Attacker losses:', JSON.stringify(br.attacker_losses));
  }

  // 3. Check if there was a recent attack on Zeratul's main planet
  console.log('\n=== FLEETS ATTACKING ZERATUL PLANETS (last 10) ===');
  const attacksOnZeratul = await c.query(`
    SELECT f.id, f.user_id, f.mission_type, f.is_completed, f.arrival_time,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           pr.username as attacker
    FROM fleets f
    LEFT JOIN profiles pr ON pr.id = f.user_id
    WHERE f.target_galaxy = 1 AND f.target_system = 332 
      AND f.target_position IN (10, 11, 12, 13)
      AND f.mission_type = 'attack'
      AND f.user_id != $1
    ORDER BY f.created_at DESC
    LIMIT 10
  `, [userId]);
  console.log(JSON.stringify(attacksOnZeratul.rows, null, 2));

  // 4. The two key issues to address:
  // ISSUE 1: Zeratul NEVER had large_cargo in fleet_ships, but claims ~160 disappeared
  //          This means the large_cargo should have been on planets. Let's check 
  //          when they went to 0
  // ISSUE 2: ACS join didn't work - the join_acs_attack function requires an 
  //          EXISTING fleet with same target. Let's check how the frontend calls it.

  // 5. Let's check if there are TWO versions of join_acs:
  // - join_acs_with_fleet: creates a new fleet AND joins ACS
  // - join_acs_attack (latest): joins EXISTING fleet to ACS
  // The user might have used join_acs_with_fleet which was the older version
  console.log('\n=== join_acs_with_fleet SOURCE ===');
  const joinWithFleet = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'join_acs_with_fleet'
  `);
  if (joinWithFleet.rows.length > 0) {
    // Already printed above, let's check the key part
    const src = joinWithFleet.rows[0].prosrc;
    // Check if it subtracts ships from planet
    const subtractIdx = src.indexOf('quantity - v_ship.quantity');
    console.log('Has ship subtraction:', subtractIdx > -1);
    // Check what happens with large_cargo
    console.log('Source length:', src.length);
  }

  // 6. The real question: did the user ACTUALLY join the ACS?
  // The screenshot shows "1/2 participantes" which means only 1 out of 2 max joined
  // The user says their fleet doesn't show. This means the join FAILED.
  // But did it subtract ships without creating a fleet? Let's check carefully.

  // 7. Timeline reconstruction - check what happened around the time Sultan created the ACS
  // ACS created at 2026-03-15T21:41:21.423Z
  console.log('\n=== ALL ZERATUL DB OPERATIONS AROUND 21:41 UTC ===');
  const recentFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_acs, f.acs_id, f.is_completed,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.created_at
    FROM fleets f
    WHERE f.user_id = $1 AND f.created_at >= '2026-03-15T21:00:00Z'
    ORDER BY f.created_at
  `, [userId]);
  console.log(JSON.stringify(recentFleets.rows, null, 2));

  // 8. Now let's directly check if the large_cargo quantity was updated recently
  // Unfortunately without audit logging, we can't tell when it was set to 0
  // But we can check if large_cargo was EVER in any fleet

  // 9. Double check - maybe user built them but they never got added to planet_ships?
  // Check the build logs or shipyard queue
  console.log('\n=== CHECK IF LARGE_CARGO WAS BUILT ON ANY PLANET ===');
  // Check ALL planet_ships for large_cargo - the created_at tells us when the row was first made
  const allLCRows = await c.query(`
    SELECT ps.created_at, ps.quantity, p.user_id, pr.username,
           p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE st.code = 'large_cargo' AND p.user_id = $1
    ORDER BY ps.created_at
  `, [userId]);
  console.log(JSON.stringify(allLCRows.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
