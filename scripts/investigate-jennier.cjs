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

  // 1. Find user
  console.log('=== USER ===');
  const user = await c.query("SELECT id, username, email FROM profiles WHERE email = 'jennierfs@gmail.com'");
  console.log(JSON.stringify(user.rows, null, 2));

  if (user.rows.length === 0) {
    console.log('User not found!');
    await c.end();
    return;
  }

  const userId = user.rows[0].id;

  // 2. All active fleets (not completed)
  console.log('\n=== ACTIVE FLEETS (not completed) ===');
  const activeFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.is_acs, f.acs_id, f.acs_fleet_id,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.departure_time, f.arrival_time, f.return_time,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND f.is_completed = false
    ORDER BY f.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(activeFleets.rows, null, 2));

  // 3. All fleets (last 20)
  console.log('\n=== ALL FLEETS (last 20) ===');
  const allFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.is_acs, f.acs_id, f.acs_fleet_id,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.departure_time, f.arrival_time, f.return_time,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.created_at
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1
    ORDER BY f.created_at DESC
    LIMIT 20
  `, [userId]);
  console.log(JSON.stringify(allFleets.rows, null, 2));

  // 4. Fleet ships for active fleets
  console.log('\n=== FLEET SHIPS FOR ALL ACTIVE FLEETS ===');
  for (const fleet of activeFleets.rows) {
    const ships = await c.query(`
      SELECT fs.*, st.code, st.name, st.cargo_capacity
      FROM fleet_ships fs
      JOIN ship_types st ON st.id = fs.ship_type_id
      WHERE fs.fleet_id = $1
    `, [fleet.id]);
    if (ships.rows.length > 0) {
      console.log(`Fleet ${fleet.id} [${fleet.mission_type}] → ${fleet.target}:`, JSON.stringify(ships.rows, null, 2));
    } else {
      console.log(`Fleet ${fleet.id} [${fleet.mission_type}] → ${fleet.target}: NO SHIPS!`);
    }
  }

  // 5. Check ACS fleets involving this user
  console.log('\n=== ACS FLEETS ===');
  const acsFleets = await c.query(`
    SELECT af.* 
    FROM acs_fleets af
    WHERE af.id IN (
      SELECT acs_id FROM fleets WHERE user_id = $1 AND acs_id IS NOT NULL
    )
    OR af.id IN (
      SELECT acs_id FROM acs_participants WHERE user_id = $1
    )
    ORDER BY af.created_at DESC
    LIMIT 10
  `, [userId]);
  console.log(JSON.stringify(acsFleets.rows, null, 2));

  // 6. Check ACS participants
  console.log('\n=== ACS PARTICIPANTS ===');
  for (const acs of acsFleets.rows) {
    const participants = await c.query(`
      SELECT ap.*, p.username as player_name
      FROM acs_participants ap
      LEFT JOIN profiles p ON p.id = ap.user_id
      WHERE ap.acs_id = $1
    `, [acs.id]);
    console.log(`ACS ${acs.id}:`, JSON.stringify(participants.rows, null, 2));
    
    // Also check fleets linked to this ACS
    const acsLinkedFleets = await c.query(`
      SELECT f.id, f.user_id, f.mission_type, f.is_returning, f.is_completed,
             f.is_acs, f.acs_id, f.acs_fleet_id,
             f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
             p2.username as owner
      FROM fleets f
      LEFT JOIN profiles p2 ON p2.id = f.user_id
      WHERE f.acs_id = $1
    `, [acs.id]);
    console.log(`  Linked fleets:`, JSON.stringify(acsLinkedFleets.rows, null, 2));
  }

  // 7. Planets and ships
  console.log('\n=== PLANETS ===');
  const planets = await c.query(`
    SELECT id, name, galaxy, solar_system, position, is_main_planet
    FROM planets WHERE user_id = $1 ORDER BY is_main_planet DESC
  `, [userId]);
  console.log(JSON.stringify(planets.rows, null, 2));

  // 8. Check ships on all planets (especially large_cargo)
  console.log('\n=== SHIPS ON PLANETS ===');
  for (const planet of planets.rows) {
    const ships = await c.query(`
      SELECT ps.quantity, st.code, st.name
      FROM planet_ships ps
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE ps.planet_id = $1 AND ps.quantity > 0
      ORDER BY st.code
    `, [planet.id]);
    if (ships.rows.length > 0) {
      console.log(`${planet.name} [${planet.galaxy}:${planet.solar_system}:${planet.position}]:`, JSON.stringify(ships.rows, null, 2));
    } else {
      console.log(`${planet.name} [${planet.galaxy}:${planet.solar_system}:${planet.position}]: NO SHIPS`);
    }
  }

  // 9. Recently completed fleets with ships that might have vanished
  console.log('\n=== RECENTLY COMPLETED FLEETS ===');
  const completedFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.is_acs, f.acs_id,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.arrival_time, f.return_time,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND f.is_completed = true
    ORDER BY f.created_at DESC
    LIMIT 15
  `, [userId]);
  console.log(JSON.stringify(completedFleets.rows, null, 2));

  // 10. Fleet ships for completed fleets (should be empty if processed correctly)
  console.log('\n=== FLEET SHIPS FOR RECENTLY COMPLETED FLEETS ===');
  for (const fleet of completedFleets.rows) {
    const ships = await c.query(`
      SELECT fs.*, st.code, st.name
      FROM fleet_ships fs
      JOIN ship_types st ON st.id = fs.ship_type_id
      WHERE fs.fleet_id = $1
    `, [fleet.id]);
    if (ships.rows.length > 0) {
      console.log(`Fleet ${fleet.id} [${fleet.mission_type}] STILL HAS SHIPS:`, JSON.stringify(ships.rows, null, 2));
    }
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
