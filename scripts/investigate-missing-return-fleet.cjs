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

  const fleetId = '6869bc07-a18b-42d1-9190-66fc767b850d';
  const userId = '361fbc06-8d5b-41c5-8e76-e3afee01f342';
  const originPlanetId = '8e18ccae-caf4-400a-be01-b884eae96090'; // [1:332:13]

  console.log('=== CURRENT DB TIME ===');
  const now = await c.query('SELECT NOW()');
  console.log(now.rows[0].now);

  // 1. Fleet status
  console.log('\n=== FLEET 6869bc07 STATUS ===');
  const fleet = await c.query(`
    SELECT f.id, f.mission_type, f.is_acs, f.acs_id, f.is_returning, f.is_completed,
           f.departure_time, f.arrival_time, f.return_time,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.id = $1
  `, [fleetId]);
  console.log(JSON.stringify(fleet.rows[0], null, 2));

  // 2. Fleet ships still in fleet_ships?
  console.log('\n=== FLEET_SHIPS FOR 6869bc07 ===');
  const fleetShips = await c.query(`
    SELECT fs.quantity, st.code, st.name, fs.ship_type_id
    FROM fleet_ships fs
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE fs.fleet_id = $1
    ORDER BY fs.quantity DESC
  `, [fleetId]);
  console.log(JSON.stringify(fleetShips.rows, null, 2));
  console.log('Total ship types in fleet_ships:', fleetShips.rows.length);

  // 3. Ships on origin planet now
  console.log('\n=== ALL SHIPS ON [1:332:13] NOW ===');
  const planetShips = await c.query(`
    SELECT ps.quantity, st.code, st.name, ps.ship_type_id
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = $1 AND ps.quantity > 0
    ORDER BY ps.quantity DESC
  `, [originPlanetId]);
  console.log(JSON.stringify(planetShips.rows, null, 2));

  // 4. ALL ships on ALL zeratul planets
  console.log('\n=== ALL SHIPS ON ALL ZERATUL PLANETS ===');
  const allShips = await c.query(`
    SELECT p.galaxy || ':' || p.solar_system || ':' || p.position as coords,
           st.code, ps.quantity
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE p.user_id = $1 AND ps.quantity > 0
    ORDER BY p.galaxy, p.solar_system, p.position, st.code
  `, [userId]);
  console.log(JSON.stringify(allShips.rows, null, 2));

  // 5. Check target planet 1:1:1
  console.log('\n=== PLANET 1:1:1 OWNER ===');
  const targetPlanet = await c.query(`
    SELECT p.id, p.name, p.user_id, pr.username, p.is_destroyed
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.galaxy = 1 AND p.solar_system = 1 AND p.position = 1
  `);
  console.log(JSON.stringify(targetPlanet.rows, null, 2));

  // 6. Check battle reports for this fleet attack
  console.log('\n=== BATTLE REPORTS AT 1:1:1 RECENTLY ===');
  const battleReports = await c.query(`
    SELECT id, attacker_id, defender_id, coordinates, result, created_at,
           attacker_losses_metal, attacker_losses_crystal,
           defender_losses_metal, defender_losses_crystal,
           loot_metal, loot_crystal, loot_deuterium,
           report_data->'attacker_remaining' as attacker_remaining,
           report_data->'attacker_initial' as attacker_initial
    FROM battle_reports
    WHERE attacker_id = $1 AND coordinates LIKE '%1:1%'
    ORDER BY created_at DESC
    LIMIT 5
  `, [userId]);
  console.log(JSON.stringify(battleReports.rows, null, 2));

  // 7. Check ALL active fleets for Zeratul now
  console.log('\n=== ALL ACTIVE FLEETS NOW ===');
  const activeFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_acs, f.is_returning, f.is_completed,
           f.departure_time, f.arrival_time, f.return_time,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target
    FROM fleets f
    WHERE f.user_id = $1 AND f.is_completed = false
    ORDER BY f.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(activeFleets.rows, null, 2));

  // 8. Check process_fleet_arrival for the attack return logic
  console.log('\n=== CHECK process_fleet_arrival RETURN LOGIC ===');
  const processFleet = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival' ORDER BY oid DESC LIMIT 1
  `);
  if (processFleet.rows.length > 0) {
    const src = processFleet.rows[0].prosrc;
    // Find the "is_returning" section that handles returning fleets
    const returnIdx = src.indexOf('is_returning');
    if (returnIdx > -1) {
      console.log('Return handling (first 3000 chars):');
      console.log(src.substring(returnIdx, Math.min(returnIdx + 3000, src.length)));
    }
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
