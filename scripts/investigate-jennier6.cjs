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

  // 1. Fix the stuck deploy fleet first - let's understand what ships it has
  console.log('=== STUCK DEPLOY FLEET 56b48bce ships ===');
  const stuckShips = await c.query(`
    SELECT fs.quantity, st.code, st.name
    FROM fleet_ships fs
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE fs.fleet_id = '56b48bce-f196-47b6-989b-1794472abab5'
  `);
  console.log(JSON.stringify(stuckShips.rows, null, 2));

  // 2. Check ALL planet_ships for large_cargo across entire game
  // to understand if large_cargo was redistributed or just vanished
  console.log('\n=== LARGE_CARGO ON ALL ZERATUL PLANETS (ship_type_id=2) ===');
  const allLCPlanets = await c.query(`
    SELECT ps.planet_id, ps.quantity, ps.in_construction, 
           p.name, p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.ship_type_id = 2 AND p.user_id = $1
  `, [userId]);
  console.log(JSON.stringify(allLCPlanets.rows, null, 2));

  // 3. Check the shipyard build queue on all Zeratul's planets
  console.log('\n=== SHIPYARD BUILD QUEUE ===');
  const buildQueue = await c.query(`
    SELECT ps.planet_id, ps.ship_type_id, ps.in_construction, ps.construction_end_time,
           st.code, st.name,
           p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    JOIN planets p ON p.id = ps.planet_id
    WHERE p.user_id = $1 AND ps.in_construction > 0
  `, [userId]);
  console.log(JSON.stringify(buildQueue.rows, null, 2));

  // 4. Check the join_acs_attack function more carefully
  // Let's see if there's a second version
  console.log('\n=== ALL join_acs_attack FUNCTIONS ===');
  const joinFuncs = await c.query(`
    SELECT proname, pronargs, proargnames, proargtypes, pg_get_function_arguments(oid) as args
    FROM pg_proc 
    WHERE proname = 'join_acs_attack'
    ORDER BY oid
  `);
  console.log(JSON.stringify(joinFuncs.rows, null, 2));

  // 5. Check the latest version of join_acs_attack
  console.log('\n=== LATEST join_acs_attack SOURCE ===');
  const latestJoin = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'join_acs_attack' ORDER BY oid DESC LIMIT 1
  `);
  if (latestJoin.rows.length > 0) {
    console.log(latestJoin.rows[0].prosrc);
  }

  // 6. Let me check if the issue is that user tried to join from the UI 
  // but it showed as if they joined when the function actually failed
  // Check the frontend code to understand ACS join flow

  // 7. Let's also check if there were large_cargo built on main planet in recent past
  // by looking at construction records
  console.log('\n=== LARGE_CARGO RECORDS ON MAIN PLANET ===');
  const lcMainPlanet = await c.query(`
    SELECT * FROM planet_ships 
    WHERE planet_id = $1 AND ship_type_id = 2
  `, [mainPlanetId]);
  console.log(JSON.stringify(lcMainPlanet.rows, null, 2));

  // 8. Let's check if there's a battle report that destroyed ships
  console.log('\n=== RECENT BATTLE REPORTS INVOLVING ZERATUL ===');
  const battleReports = await c.query(`
    SELECT id, attacker_id, defender_id, 
           target_galaxy || ':' || target_system || ':' || target_position as target,
           battle_time, result, 
           attacker_losses, defender_losses
    FROM battle_reports
    WHERE defender_id = $1
    ORDER BY battle_time DESC
    LIMIT 10
  `, [userId]);
  console.log(JSON.stringify(battleReports.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
