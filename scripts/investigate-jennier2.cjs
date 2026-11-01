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

  // 1. Find the ACS by Sultan at [3:8:6] -- screenshot shows ACS-f6b8933c
  console.log('=== SEARCH ACS by Sultan at target 3:8:6 ===');
  const acsSearch = await c.query(`
    SELECT af.* FROM acs_fleets af 
    WHERE af.target_galaxy = 3 AND af.target_system = 8 AND af.target_position = 6
    ORDER BY af.created_at DESC
  `);
  console.log(JSON.stringify(acsSearch.rows, null, 2));

  // 2. Also search by ACS ID containing f6b8933c  
  console.log('\n=== SEARCH ACS by ID pattern f6b8933c ===');
  const acsIdSearch = await c.query(`
    SELECT af.* FROM acs_fleets af 
    WHERE af.id::text LIKE '%f6b8933c%' 
       OR af.main_fleet_id::text LIKE '%f6b8933c%'
       OR af.name LIKE '%f6b8933c%'
  `);
  console.log(JSON.stringify(acsIdSearch.rows, null, 2));

  // 3. Search all fleets targeting 3:8:6
  console.log('\n=== ALL FLEETS TARGETING 3:8:6 ===');
  const fleetsTo386 = await c.query(`
    SELECT f.id, f.user_id, f.mission_type, f.is_returning, f.is_completed,
           f.is_acs, f.acs_id, f.acs_fleet_id,
           f.departure_time, f.arrival_time, f.return_time,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           pr.username as owner
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    LEFT JOIN profiles pr ON pr.id = f.user_id
    WHERE f.target_galaxy = 3 AND f.target_system = 8 AND f.target_position = 6
    ORDER BY f.created_at DESC
  `);
  console.log(JSON.stringify(fleetsTo386.rows, null, 2));

  // 4. Find Sultan user and his recent fleets
  console.log('\n=== SULTAN USER ===');
  const sultan = await c.query("SELECT id, username, email FROM profiles WHERE username ILIKE '%sultan%'");
  console.log(JSON.stringify(sultan.rows, null, 2));

  if (sultan.rows.length > 0) {
    const sultanId = sultan.rows[0].id;
    console.log('\n=== SULTAN ACTIVE FLEETS ===');
    const sultanFleets = await c.query(`
      SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
             f.is_acs, f.acs_id, f.acs_fleet_id,
             f.departure_time, f.arrival_time, f.return_time,
             f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
             p.galaxy || ':' || p.solar_system || ':' || p.position as origin
      FROM fleets f
      LEFT JOIN planets p ON p.id = f.origin_planet_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
      LIMIT 15
    `, [sultanId]);
    console.log(JSON.stringify(sultanFleets.rows, null, 2));
  }

  // 5. Check Zeratul's large_cargo ship count across all fleets + planets
  console.log('\n=== ZERATUL large_cargo IN FLEETS (active) ===');
  const lcInFleets = await c.query(`
    SELECT f.id as fleet_id, fs.quantity, f.mission_type, f.is_completed,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.is_acs, f.acs_id
    FROM fleet_ships fs
    JOIN fleets f ON f.id = fs.fleet_id
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE f.user_id = $1 AND st.code = 'large_cargo' AND f.is_completed = false
  `, [userId]);
  console.log(JSON.stringify(lcInFleets.rows, null, 2));

  console.log('\n=== ZERATUL large_cargo ON PLANETS ===');
  const lcOnPlanets = await c.query(`
    SELECT ps.quantity, p.name, p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE p.user_id = $1 AND st.code = 'large_cargo'
  `, [userId]);
  console.log(JSON.stringify(lcOnPlanets.rows, null, 2));

  // 6. Check ALL active ACS fleets (is_active = true)
  console.log('\n=== ALL ACTIVE ACS FLEETS (is_active = true) ===');
  const activeAcs = await c.query(`
    SELECT af.*, pr.username as creator_name
    FROM acs_fleets af
    LEFT JOIN profiles pr ON pr.id = af.creator_id
    WHERE af.is_active = true
    ORDER BY af.created_at DESC
  `);
  console.log(JSON.stringify(activeAcs.rows, null, 2));

  // 7. Check participants for any active ACS
  for (const acs of activeAcs.rows) {
    console.log(`\n=== PARTICIPANTS FOR ACTIVE ACS ${acs.id} (${acs.name}) ===`);
    const parts = await c.query(`
      SELECT ap.*, pr.username as player_name
      FROM acs_participants ap
      LEFT JOIN profiles pr ON pr.id = ap.user_id
      WHERE ap.acs_id = $1
    `, [acs.id]);
    console.log(JSON.stringify(parts.rows, null, 2));
    
    // Check fleet ships for each participant fleet
    for (const p of parts.rows) {
      const ships = await c.query(`
        SELECT fs.quantity, st.code, st.name 
        FROM fleet_ships fs
        JOIN ship_types st ON st.id = fs.ship_type_id
        WHERE fs.fleet_id = $1
      `, [p.fleet_id]);
      console.log(`  Fleet ${p.fleet_id} (${p.player_name}):`, JSON.stringify(ships.rows));
    }
    
    // Check linked fleets
    const linkedFleets = await c.query(`
      SELECT f.id, f.user_id, f.mission_type, f.is_returning, f.is_completed,
             f.is_acs, f.acs_id, f.acs_fleet_id, pr.username as owner,
             f.departure_time, f.arrival_time, f.return_time
      FROM fleets f
      LEFT JOIN profiles pr ON pr.id = f.user_id
      WHERE f.acs_id = $1
    `, [acs.id]);
    console.log(`  Linked fleets:`, JSON.stringify(linkedFleets.rows, null, 2));
  }

  // 8. Check if Zeratul has any fleet with acs_fleet_id set  
  console.log('\n=== ZERATUL FLEETS WITH acs_fleet_id SET ===');
  const acsFleetIdFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.is_acs, f.acs_id, f.acs_fleet_id,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.departure_time, f.arrival_time
    FROM fleets f
    WHERE f.user_id = $1 AND (f.acs_id IS NOT NULL OR f.acs_fleet_id IS NOT NULL)
    ORDER BY f.created_at DESC
    LIMIT 10
  `, [userId]);
  console.log(JSON.stringify(acsFleetIdFleets.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
