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
  const mainPlanetId = '8e18ccae-caf4-400a-be01-b884eae96090'; // [1:332:13]

  // 1. Check planet_ships for large_cargo on ALL planets  
  console.log('=== LARGE_CARGO planet_ships ALL PLANETS ===');
  const lc = await c.query(`
    SELECT ps.planet_id, ps.quantity, ps.in_construction, ps.created_at,
           p.galaxy || ':' || p.solar_system || ':' || p.position as coords, p.name
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.ship_type_id = 2 AND p.user_id = $1
  `, [userId]);
  console.log(JSON.stringify(lc.rows, null, 2));

  // 2. Check shipyard_queue for large_cargo builds ever
  console.log('\n=== SHIPYARD_QUEUE COLUMNS ===');
  const sqCols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'shipyard_queue' ORDER BY ordinal_position
  `);
  console.log(sqCols.rows.map(r => r.column_name).join(', '));

  console.log('\n=== SHIPYARD_QUEUE FOR ZERATUL PLANETS ===');
  const sq = await c.query(`
    SELECT sq.* FROM shipyard_queue sq
    JOIN planets p ON p.id = sq.planet_id
    WHERE p.user_id = $1
    ORDER BY sq.created_at DESC
    LIMIT 20
  `, [userId]);
  console.log(JSON.stringify(sq.rows, null, 2));

  // 3. Check if there's a completed_at or log in shipyard_queue
  console.log('\n=== ALL SHIPYARD QUEUE ENTRIES WITH ship_type 2 (large_cargo) ===');
  const sqLC = await c.query(`
    SELECT sq.* FROM shipyard_queue sq
    JOIN planets p ON p.id = sq.planet_id
    WHERE p.user_id = $1 AND sq.ship_type_id = 2
    ORDER BY sq.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(sqLC.rows, null, 2));

  // 4. Check expedition results - these can give ships
  console.log('\n=== CHECK TABLES FOR EXPEDITION RESULTS ===');
  const expTables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name LIKE '%expedition%' OR table_name LIKE '%fleet_log%' OR table_name LIKE '%ship_log%'
  `);
  console.log('Tables:', expTables.rows.map(r => r.table_name));

  // 5. Check fleet_logs or similar
  const logTables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name LIKE '%log%' OR table_name LIKE '%history%' OR table_name LIKE '%audit%'
  `);
  console.log('Log/History tables:', logTables.rows.map(r => r.table_name));

  // 6. Check notifications - maybe there's a notification about lost ships
  console.log('\n=== NOTIFICATIONS FOR ZERATUL (last 20) ===');
  const notifs = await c.query(`
    SELECT id, type, message, created_at FROM notifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 20
  `, [userId]);
  console.log(JSON.stringify(notifs.rows, null, 2));

  // 7. Check if deploy fleets to own planets moved large_cargo
  // Look at completed deploy fleets' fleet_ships (should be deleted, but maybe not)
  console.log('\n=== COMPLETED DEPLOY FLEETS WITH fleet_ships STILL PRESENT ===');
  const deployWithShips = await c.query(`
    SELECT f.id, f.mission_type, f.is_completed,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.created_at
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 
      AND f.is_completed = true
      AND f.mission_type = 'deploy'
      AND EXISTS (SELECT 1 FROM fleet_ships fs WHERE fs.fleet_id = f.id)
    ORDER BY f.created_at DESC
    LIMIT 10
  `, [userId]);
  console.log(JSON.stringify(deployWithShips.rows, null, 2));

  // 8. Look at the process_fleet_arrival code for how deploy to own planet works
  // When deploy to own planet completes: ships go to target planet
  // When deploy to allied planet: ships go to target planet  
  // Returning deploy: ships go back to origin

  // 9. Check if there's a specific point where large_cargo was subtracted
  // Look for deploys that originated from main planet with large_cargo
  console.log('\n=== ALL DEPLOY FLEETS FROM MAIN PLANET [1:332:13] ===');
  const deploysFromMain = await c.query(`
    SELECT f.id, f.mission_type, f.is_completed, f.is_returning,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.created_at, f.arrival_time
    FROM fleets f
    WHERE f.user_id = $1 
      AND f.origin_planet_id = $2
      AND f.mission_type IN ('deploy', 'transport')
    ORDER BY f.created_at DESC
    LIMIT 30
  `, [userId, mainPlanetId]);
  console.log(JSON.stringify(deploysFromMain.rows, null, 2));

  // 10. Check the heavy_fighter planet_ships too - user had 15 in ACS
  console.log('\n=== HEAVY_FIGHTER (ship_type_id=8) ON ALL PLANETS ===');
  const hf = await c.query(`
    SELECT ps.quantity, p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.ship_type_id = 8 AND p.user_id = $1
  `, [userId]);
  console.log(JSON.stringify(hf.rows));

  // 11. Final: just check how many of each ship type Zeratul has in total
  console.log('\n=== TOTAL SHIP INVENTORY FOR ZERATUL ===');
  const inventory = await c.query(`
    SELECT st.code, st.name,
           COALESCE(SUM(ps.quantity), 0) as on_planets,
           COALESCE((SELECT SUM(fs2.quantity) FROM fleet_ships fs2 
                     JOIN fleets f2 ON f2.id = fs2.fleet_id 
                     WHERE f2.user_id = $1 AND f2.is_completed = false 
                     AND fs2.ship_type_id = st.id), 0) as in_fleets
    FROM ship_types st
    LEFT JOIN planet_ships ps ON ps.ship_type_id = st.id 
      AND ps.planet_id IN (SELECT id FROM planets WHERE user_id = $1)
    GROUP BY st.id, st.code, st.name
    HAVING COALESCE(SUM(ps.quantity), 0) > 0 
       OR COALESCE((SELECT SUM(fs2.quantity) FROM fleet_ships fs2 
                    JOIN fleets f2 ON f2.id = fs2.fleet_id 
                    WHERE f2.user_id = $1 AND f2.is_completed = false 
                    AND fs2.ship_type_id = st.id), 0) > 0
    ORDER BY st.code
  `, [userId]);
  for (const row of inventory.rows) {
    const total = parseInt(row.on_planets) + parseInt(row.in_fleets);
    console.log(`  ${row.code}: ${row.on_planets} on planets + ${row.in_fleets} in fleets = ${total} total`);
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
