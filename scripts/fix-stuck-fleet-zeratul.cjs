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

  const stuckFleetId = '56b48bce-f196-47b6-989b-1794472abab5';
  const originPlanetId = '8e18ccae-caf4-400a-be01-b884eae96090'; // [1:332:13]

  // 1. Verify current state
  console.log('=== BEFORE FIX ===');
  
  const fleet = await c.query(`
    SELECT id, mission_type, is_completed, is_returning, 
           departure_time, arrival_time, return_time,
           target_galaxy || ':' || target_system || ':' || target_position as target
    FROM fleets WHERE id = $1
  `, [stuckFleetId]);
  console.log('Fleet:', JSON.stringify(fleet.rows[0], null, 2));

  const fleetShips = await c.query(`
    SELECT fs.quantity, st.code, st.name, fs.ship_type_id
    FROM fleet_ships fs
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE fs.fleet_id = $1
  `, [stuckFleetId]);
  console.log('Ships in fleet:', JSON.stringify(fleetShips.rows, null, 2));

  const starDestBefore = await c.query(`
    SELECT ps.quantity, st.code
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = $1 AND st.code = 'star_destroyer'
  `, [originPlanetId]);
  console.log('Star Destroyers on [1:332:13] BEFORE:', starDestBefore.rows[0]?.quantity || 0);

  // 2. FIX: Return ships to origin planet and mark fleet completed
  console.log('\n=== APPLYING FIX ===');

  // Start transaction
  await c.query('BEGIN');

  try {
    // Return each ship type to origin planet
    for (const ship of fleetShips.rows) {
      console.log(`  Returning ${ship.quantity}x ${ship.code} to [1:332:13]...`);
      await c.query(`
        UPDATE planet_ships
        SET quantity = quantity + $1
        WHERE planet_id = $2 AND ship_type_id = $3
      `, [ship.quantity, originPlanetId, ship.ship_type_id]);
    }

    // Delete fleet_ships records
    await c.query('DELETE FROM fleet_ships WHERE fleet_id = $1', [stuckFleetId]);

    // Mark fleet as completed
    await c.query(`
      UPDATE fleets 
      SET is_completed = true, is_returning = true 
      WHERE id = $1
    `, [stuckFleetId]);

    await c.query('COMMIT');
    console.log('  ✅ Transaction committed successfully!');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('  ❌ Transaction rolled back:', e.message);
    await c.end();
    return;
  }

  // 3. Verify
  console.log('\n=== AFTER FIX ===');

  const fleetAfter = await c.query(`
    SELECT id, mission_type, is_completed, is_returning
    FROM fleets WHERE id = $1
  `, [stuckFleetId]);
  console.log('Fleet:', JSON.stringify(fleetAfter.rows[0]));

  const starDestAfter = await c.query(`
    SELECT ps.quantity, st.code
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = $1 AND st.code = 'star_destroyer'
  `, [originPlanetId]);
  console.log('Star Destroyers on [1:332:13] AFTER:', starDestAfter.rows[0]?.quantity || 0);

  const fleetShipsAfter = await c.query(`
    SELECT COUNT(*) as count FROM fleet_ships WHERE fleet_id = $1
  `, [stuckFleetId]);
  console.log('Fleet ships remaining:', fleetShipsAfter.rows[0].count);

  // 4. Active fleets count
  const activeCount = await c.query(`
    SELECT COUNT(*) as count FROM fleets 
    WHERE user_id = '361fbc06-8d5b-41c5-8e76-e3afee01f342' AND is_completed = false
  `);
  console.log('Active fleets now:', activeCount.rows[0].count, '(was 3, should be 2)');

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
