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

  // 1. Check if Zeratul EVER had large_cargo ships on any planet (check planet_ships history)
  console.log('=== ZERATUL planet_ships for large_cargo (ship_type_id = 2) ===');
  const lcPlanetShips = await c.query(`
    SELECT ps.*, p.name, p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.ship_type_id = 2 AND p.user_id = $1
  `, [userId]);
  console.log(JSON.stringify(lcPlanetShips.rows, null, 2));

  // 2. Check deploy fleet to 2:22:5 (active) - what happened before it?
  console.log('\n=== DEPLOY FLEET 56b48bce TO 2:22:5 details ===');
  const deployFleet = await c.query(`
    SELECT f.*, p.galaxy || ':' || p.solar_system || ':' || p.position as origin_coords
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.id = '56b48bce-f196-47b6-989b-1794472abab5'
  `);
  console.log(JSON.stringify(deployFleet.rows, null, 2));

  // 3. Check the recycle mission to 2:22:5 that returned with cargo
  console.log('\n=== RECYCLE FLEET 49128847 FULL details ===');
  const recycleFleet = await c.query(`
    SELECT f.*, p.galaxy || ':' || p.solar_system || ':' || p.position as origin_coords
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.id = '49128847-1069-4200-ad7d-c8e278a23659'
  `);
  console.log(JSON.stringify(recycleFleet.rows, null, 2));

  // 4. Look for the join_acs function in database
  console.log('\n=== CHECK join_acs_fleet FUNCTION SIGNATURE ===');
  const joinAcsFunc = await c.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname LIKE '%join_acs%' OR proname LIKE '%acs_join%'
  `);
  console.log('Functions found:', joinAcsFunc.rows.map(r => r.proname));
  if (joinAcsFunc.rows.length > 0) {
    console.log('\n--- FUNCTION SOURCE ---');
    console.log(joinAcsFunc.rows[0].prosrc);
  }

  // 5. Check the send_fleet function to see ACS join logic  
  console.log('\n=== CHECK send_fleet FUNCTION ===');
  const sendFleetFunc = await c.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'send_fleet'
  `);
  if (sendFleetFunc.rows.length > 0) {
    console.log('send_fleet found, first 5000 chars:');
    console.log(sendFleetFunc.rows[0].prosrc.substring(0, 5000));
  }

  // 6. Check cancel_fleet for ACS logic
  console.log('\n=== CHECK cancel_fleet FUNCTION (ACS section) ===');
  const cancelFleetFunc = await c.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'cancel_fleet'
  `);
  if (cancelFleetFunc.rows.length > 0) {
    const src = cancelFleetFunc.rows[0].prosrc;
    // Find ACS-related section
    const acsIdx = src.indexOf('acs');
    if (acsIdx > 0) {
      console.log('cancel_fleet ACS section (chars around first "acs"):');
      console.log(src.substring(Math.max(0, acsIdx - 200), Math.min(src.length, acsIdx + 3000)));
    }
  }

  // 7. Check if user has Jenserfs account too (d66b3f11 seen in earlier ACS)
  console.log('\n=== JENSERFS ACCOUNT ===');
  const jenserfs = await c.query("SELECT id, username, email FROM profiles WHERE id = 'd66b3f11-9e04-4015-ac3d-4e5ea8ef7c11'");
  console.log(JSON.stringify(jenserfs.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
