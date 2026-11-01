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

  // 1. Let's search ALL fleet_ships for Zeratul with ship_type_id = 2 (large_cargo)
  // Maybe they are in completed fleet records
  console.log('=== ALL fleet_ships with large_cargo FOR ZERATUL EVER ===');
  const allLC = await c.query(`
    SELECT fs.fleet_id, fs.quantity, f.mission_type, f.is_completed, f.is_acs, f.acs_id,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.created_at, f.departure_time, f.arrival_time
    FROM fleet_ships fs
    JOIN fleets f ON f.id = fs.fleet_id
    WHERE f.user_id = $1 AND fs.ship_type_id = 2
    ORDER BY f.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(allLC.rows, null, 2));
  console.log('Total fleet records with large_cargo:', allLC.rows.length);

  // 2. Check if any fleet was deleted (not just completed) - look for orphaned fleet_ships
  console.log('\n=== ORPHANED fleet_ships for Zeratul ===');
  const orphaned = await c.query(`
    SELECT fs.*
    FROM fleet_ships fs
    LEFT JOIN fleets f ON f.id = fs.fleet_id
    WHERE f.id IS NULL
    LIMIT 10
  `);
  console.log('Orphaned fleet_ships count:', orphaned.rows.length);

  // 3. Check ALL fleets ever deleted for Zeratul (if there's a soft delete mechanism)
  // Actually let's count total fleets ever
  console.log('\n=== TOTAL FLEET RECORDS FOR ZERATUL ===');
  const totalFleets = await c.query(`
    SELECT COUNT(*) as total, 
           SUM(CASE WHEN is_completed THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN NOT is_completed THEN 1 ELSE 0 END) as active
    FROM fleets WHERE user_id = $1
  `, [userId]);
  console.log(JSON.stringify(totalFleets.rows));

  // 4. Check how many fleet slots Zeratul has (computer_tech + 1 + admiral)
  console.log('\n=== ZERATUL COMPUTER TECH ===');
  const compTech = await c.query(`
    SELECT ut.level, tt.code
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = $1 AND tt.code = 'computer_tech'
  `, [userId]);
  console.log(JSON.stringify(compTech.rows));

  // 5. Active fleet count
  console.log('\n=== ZERATUL ACTIVE FLEET COUNT ===');
  const activeCount = await c.query(`
    SELECT COUNT(*) as count FROM fleets WHERE user_id = $1 AND is_completed = false
  `, [userId]);
  console.log(JSON.stringify(activeCount.rows));

  // 6. Check if there is a Zeratul account issue (multiple accounts?)
  // The screenshot mentions "jennierfs@gmail.com" but Zeratul is that account
  console.log('\n=== ALL PROFILES MATCHING jenni ===');
  const profiles = await c.query(`
    SELECT id, username, email FROM profiles 
    WHERE email ILIKE '%jenni%' OR username ILIKE '%jenni%' OR username ILIKE '%zeratul%'
  `);
  console.log(JSON.stringify(profiles.rows, null, 2));

  // 7. Check the deploy fleet 56b48bce that is "stuck" (created Mar 7, still not completed)
  console.log('\n=== DEPLOY FLEET 56b48bce STATUS ===');
  const deployFleet = await c.query(`
    SELECT id, mission_type, is_returning, is_completed,
           departure_time, arrival_time, return_time,
           target_galaxy || ':' || target_system || ':' || target_position as target,
           created_at
    FROM fleets 
    WHERE id = '56b48bce-f196-47b6-989b-1794472abab5'
  `);
  console.log(JSON.stringify(deployFleet.rows, null, 2));
  console.log('NOTE: This deploy to 2:22:5 was created on Mar 7 but arrival was Mar 8 09:26. It is still not completed!');
  console.log('Current time check needed - is the arrival_time in the past?');

  // 8. NOW() from DB 
  console.log('\n=== CURRENT DB TIME ===');
  const now = await c.query('SELECT NOW()');
  console.log(now.rows[0].now);

  // 9. Check who owns planet at 2:22:5
  console.log('\n=== PLANET AT 2:22:5 ===');
  const targetPlanet = await c.query(`
    SELECT p.id, p.name, p.user_id, pr.username
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.galaxy = 2 AND p.solar_system = 22 AND p.position = 5
  `);
  console.log(JSON.stringify(targetPlanet.rows, null, 2));

  // 10. Check the recycle fleet 49128847 - it just returned to 1:332:13
  // This fleet HAD recyclers. Did the recyclers return to the planet?
  console.log('\n=== RECYCLER COUNT ON MAIN PLANET ===');
  const recyclerOnPlanet = await c.query(`
    SELECT ps.quantity, st.code
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = '8e18ccae-caf4-400a-be01-b884eae96090'
    AND st.code = 'recycler'
  `);
  console.log(JSON.stringify(recyclerOnPlanet.rows));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
