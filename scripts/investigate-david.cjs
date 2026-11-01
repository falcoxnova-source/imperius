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
  const user = await c.query("SELECT id, username, email FROM profiles WHERE email = 'davidgongorao03@gmail.com'");
  console.log('USER:', JSON.stringify(user.rows, null, 2));

  if (user.rows.length === 0) {
    console.log('User not found!');
    await c.end();
    return;
  }

  const userId = user.rows[0].id;

  // 2. Get planets
  const planets = await c.query('SELECT id, name, is_main_planet, galaxy, solar_system, position FROM planets WHERE user_id = $1 ORDER BY is_main_planet DESC', [userId]);
  console.log('\nPLANETS:', JSON.stringify(planets.rows, null, 2));

  // 3. Get all fleets (active and completed) for this user
  const fleets = await c.query(`
    SELECT f.*, 
           p.name as origin_name, p.galaxy as origin_galaxy, p.solar_system as origin_system, p.position as origin_pos
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1
    ORDER BY f.created_at DESC
    LIMIT 20
  `, [userId]);
  console.log('\nFLEETS (last 20):', JSON.stringify(fleets.rows, null, 2));

  // 4. Check fleet_ships for those fleets
  if (fleets.rows.length > 0) {
    for (const fleet of fleets.rows) {
      const ships = await c.query(`
        SELECT fs.*, st.code, st.name 
        FROM fleet_ships fs 
        JOIN ship_types st ON st.id = fs.ship_type_id
        WHERE fs.fleet_id = $1
      `, [fleet.id]);
      if (ships.rows.length > 0) {
        console.log(`\nFLEET ${fleet.id} SHIPS:`, JSON.stringify(ships.rows, null, 2));
      }
    }
  }

  // 5. Check fleet logs / combat reports for this user
  const logs = await c.query(`
    SELECT * FROM fleet_logs 
    WHERE user_id = $1 
    ORDER BY created_at DESC 
    LIMIT 20
  `, [userId]).catch(() => ({ rows: [] }));
  if (logs.rows.length > 0) {
    console.log('\nFLEET_LOGS:', JSON.stringify(logs.rows, null, 2));
  }

  // 6. Check current resources on planets
  for (const planet of planets.rows) {
    const res = await c.query('SELECT metal, crystal, deuterium, metal_storage, crystal_storage, deuterium_storage FROM planet_resources WHERE planet_id = $1', [planet.id]);
    console.log(`\nRESOURCES ${planet.name} [${planet.galaxy}:${planet.solar_system}:${planet.position}]:`, JSON.stringify(res.rows, null, 2));
  }

  // 7. Check if there are any fleet-related functions or triggers
  const completedFleets = await c.query(`
    SELECT * FROM fleets 
    WHERE user_id = $1 
    AND is_completed = true
    AND mission_type = 'deploy'
    ORDER BY created_at DESC
    LIMIT 10
  `, [userId]);
  console.log('\nCOMPLETED DEPLOY FLEETS:', JSON.stringify(completedFleets.rows, null, 2));

  // 8. Check if there's a fleet_events or fleet_history table
  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE '%fleet%'
    ORDER BY table_name
  `);
  console.log('\nFLEET TABLES:', JSON.stringify(tables.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
