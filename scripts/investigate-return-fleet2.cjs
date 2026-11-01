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

  const userId = '361fbc06-8d5b-41c5-8e76-e3afee01f342';
  const fleetId = '6869bc07-a18b-42d1-9190-66fc767b850d';

  console.log('=== DB TIME ===');
  const now = await c.query('SELECT NOW()');
  console.log(now.rows[0].now);

  // The fleet arrival is 2026-03-16T01:10:32 UTC - it hasn't arrived yet!
  // But user says it returned. Maybe they mean a different fleet?
  
  // Check deathstar fleet to 1:139:6
  console.log('\n=== DEATHSTAR FLEET 6dd9e014 to 1:139:6 ===');
  const dsFleet = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.departure_time, f.arrival_time, f.return_time,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target
    FROM fleets f WHERE f.id = '6dd9e014-263e-4f19-a547-a1b684674977'
  `);
  console.log(JSON.stringify(dsFleet.rows[0], null, 2));

  // Check fleet_ships for deathstar fleet
  console.log('\n=== DEATHSTAR FLEET SHIPS ===');
  const dsShips = await c.query(`
    SELECT st.code, fs.quantity FROM fleet_ships fs
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE fs.fleet_id = '6dd9e014-263e-4f19-a547-a1b684674977'
  `);
  console.log(JSON.stringify(dsShips.rows, null, 2));

  // Check ALL recently completed fleets for Zeratul (last few hours)
  console.log('\n=== RECENTLY COMPLETED FLEETS (last 6h) ===');
  const recent = await c.query(`
    SELECT f.id, f.mission_type, f.is_acs, f.is_returning, f.is_completed,
           f.arrival_time, f.return_time,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 
      AND f.is_completed = true
      AND f.created_at >= NOW() - interval '24 hours'
    ORDER BY f.created_at DESC
    LIMIT 20
  `, [userId]);
  console.log(JSON.stringify(recent.rows, null, 2));

  // Check if fleet 6869bc07 was processed
  console.log('\n=== FLEET 6869bc07 COMPLETE STATUS (re-check) ===');
  const f2 = await c.query(`
    SELECT id, is_completed, is_returning, arrival_time, return_time
    FROM fleets WHERE id = $1
  `, [fleetId]);
  console.log(JSON.stringify(f2.rows[0]));

  // Check all star_destroyer quantities
  console.log('\n=== STAR_DESTROYER (ship_type_id=15) EVERYWHERE FOR ZERATUL ===');
  const sdPlanets = await c.query(`
    SELECT ps.quantity, p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.ship_type_id = 15 AND p.user_id = $1
  `, [userId]);
  console.log('On planets:', JSON.stringify(sdPlanets.rows));

  const sdFleets = await c.query(`
    SELECT fs.fleet_id, fs.quantity, f.mission_type, f.is_completed, f.is_returning,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target
    FROM fleet_ships fs
    JOIN fleets f ON f.id = fs.fleet_id
    WHERE fs.ship_type_id = 15 AND f.user_id = $1
  `, [userId]);
  console.log('In fleets:', JSON.stringify(sdFleets.rows));

  // Check total across everything
  let totalSD = 0;
  for (const r of sdPlanets.rows) totalSD += r.quantity;
  for (const r of sdFleets.rows) totalSD += r.quantity;
  console.log('TOTAL star_destroyers:', totalSD);

  // Check battle report for 1:1:1 or 1:139:6 
  console.log('\n=== BATTLE REPORTS FOR ZERATUL (attacker) RECENTLY ===');
  const br = await c.query(`
    SELECT id, coordinates, result, created_at,
           attacker_losses_metal, attacker_losses_crystal,
           defender_losses_metal, defender_losses_crystal
    FROM battle_reports
    WHERE attacker_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [userId]);
  console.log(JSON.stringify(br.rows, null, 2));

  // The 3 deathstars on planet - where did they come from? 
  // Before the fix, there was 1 deathstar + 1 deathstar in fleet to 1:139:6 
  // After fix, we added 10 star_destroyers (not deathstars)
  // Now shows 3 deathstars. Let's check deathstar fleet  
  console.log('\n=== DEATHSTAR ON PLANETS (type 14) ===');
  const dsPlanets = await c.query(`
    SELECT ps.quantity, p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.ship_type_id = 14 AND p.user_id = $1
  `, [userId]);
  console.log(JSON.stringify(dsPlanets.rows));

  const dsFleets2 = await c.query(`
    SELECT fs.fleet_id, fs.quantity, f.mission_type, f.is_completed,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target
    FROM fleet_ships fs
    JOIN fleets f ON f.id = fs.fleet_id
    WHERE fs.ship_type_id = 14 AND f.user_id = $1
  `, [userId]);
  console.log('Deathstars in fleets:', JSON.stringify(dsFleets2.rows));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
