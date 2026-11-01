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
  const acsId = '2758afc0-f3e8-4be1-8b43-eaa32cf80b54'; // ACS by Sultan

  // 1. Check if Zeratul ever had a fleet linked to this ACS
  console.log('=== ZERATUL FLEETS WITH ACS ID 2758afc0 ===');
  const zeratulAcsFleets = await c.query(`
    SELECT f.* FROM fleets f WHERE f.user_id = $1 AND f.acs_id = $2
  `, [userId, acsId]);
  console.log(JSON.stringify(zeratulAcsFleets.rows, null, 2));

  // 2. Check all fleets linked to this ACS (even completed/deleted)
  console.log('\n=== ALL FLEETS WITH ACS ID 2758afc0 ===');
  const allAcsFleets = await c.query(`
    SELECT f.id, f.user_id, f.mission_type, f.is_returning, f.is_completed,
           f.is_acs, f.acs_id, f.acs_fleet_id,
           f.departure_time, f.arrival_time, f.return_time,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           pr.username as owner
    FROM fleets f
    LEFT JOIN profiles pr ON pr.id = f.user_id
    WHERE f.acs_id = $1
  `, [acsId]);
  console.log(JSON.stringify(allAcsFleets.rows, null, 2));

  // 3. Check if there's a fleet for Zeratul targeting 3:8:6 recently
  console.log('\n=== ZERATUL FLEETS TARGETING 3:8:6 ===');
  const zeratulTo386 = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.is_acs, f.acs_id,
           f.departure_time, f.arrival_time, f.return_time,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND f.target_galaxy = 3 AND f.target_system = 8 AND f.target_position = 6
    ORDER BY f.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(zeratulTo386.rows, null, 2));

  // 4. Check all Zeratul fleet records created today (March 15-16)
  console.log('\n=== ALL ZERATUL FLEETS CREATED TODAY ===');
  const todayFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.is_acs, f.acs_id,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.departure_time, f.arrival_time, f.return_time,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.created_at
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND f.created_at >= '2026-03-15T00:00:00Z'
    ORDER BY f.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(todayFleets.rows, null, 2));

  // 5. Check fleet_ships for all Zeratul's ACTIVE fleets to see what types
  console.log('\n=== ALL SHIP TYPES IN ALL ACTIVE ZERATUL FLEETS ===');
  const activeShips = await c.query(`
    SELECT f.id as fleet_id, f.mission_type, 
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           st.code, st.name, fs.quantity
    FROM fleet_ships fs
    JOIN fleets f ON f.id = fs.fleet_id
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE f.user_id = $1 AND f.is_completed = false
    ORDER BY f.id, st.code
  `, [userId]);
  console.log(JSON.stringify(activeShips.rows, null, 2));

  // 6. Check the ACS participants table for Zeratul in this ACS
  console.log('\n=== ACS PARTICIPANTS FOR ACS 2758afc0 ===');
  const acsParticipants = await c.query(`
    SELECT * FROM acs_participants WHERE acs_id = $1
  `, [acsId]);
  console.log(JSON.stringify(acsParticipants.rows, null, 2));

  // 7. Check if large_cargo ever existed for Zeratul - recent fleet_ships
  console.log('\n=== ZERATUL FLEET_SHIPS WITH large_cargo (last 30 fleets) ===');
  const lcFleetShips = await c.query(`
    SELECT fs.fleet_id, fs.quantity, f.mission_type, f.is_completed,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.created_at, f.departure_time
    FROM fleet_ships fs
    JOIN fleets f ON f.id = fs.fleet_id
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE f.user_id = $1 AND st.code = 'large_cargo'
    ORDER BY f.created_at DESC
    LIMIT 30
  `, [userId]);
  console.log(JSON.stringify(lcFleetShips.rows, null, 2));

  // 8. Check the deploy fleets that were sent to distribute ships (recent completed)
  console.log('\n=== ZERATUL RECENT DEPLOY FLEETS WITH SHIPS ===');
  const deployFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_completed,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.created_at, f.arrival_time
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND f.mission_type IN ('deploy', 'transport') 
      AND f.created_at >= '2026-03-14T00:00:00Z'
    ORDER BY f.created_at DESC
  `, [userId]);
  
  for (const fleet of deployFleets.rows) {
    const ships = await c.query(`
      SELECT st.code, fs.quantity
      FROM fleet_ships fs
      JOIN ship_types st ON st.id = fs.ship_type_id
      WHERE fs.fleet_id = $1
    `, [fleet.id]);
    if (ships.rows.length > 0) {
      console.log(`  ${fleet.id} [${fleet.mission_type}] ${fleet.origin} → ${fleet.target}:`, 
        ships.rows.map(s => `${s.code}:${s.quantity}`).join(', '));
    }
  }

  // 9. Check the recycle fleet that came back (49128847) - it had 89 recyclers
  console.log('\n=== RECYCLE FLEET 49128847 SHIPS ===');
  const recycleShips = await c.query(`
    SELECT st.code, fs.quantity
    FROM fleet_ships fs
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE fs.fleet_id = '49128847-1069-4200-ad7d-c8e278a23659'
  `);
  console.log(JSON.stringify(recycleShips.rows, null, 2));

  // 10. Check the total large_cargo that Zeratul should have - sum from latest deploy arrivals
  console.log('\n=== LARGE_CARGO SHIP TYPE ID ===');
  const lcType = await c.query("SELECT id, code, name FROM ship_types WHERE code = 'large_cargo'");
  console.log(JSON.stringify(lcType.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
