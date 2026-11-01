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

  const userId = '4e46ba8f-6fe3-477e-85c2-dca300e3b7a3';

  // The fleet the user describes: deploy from [1:104:10] to [1:105:5], 296 large_cargo
  // cargo: ~2600000 metal, 1910000 crystal, 1226000 deuterium
  // He recalled it when it was 15 min from arriving
  // Fleet ID looks like: c972f54b - the one with mission_type='return', 
  // origin [1:104:10], target [1:105:5], cargo 2890000/1930000/1270000

  // Check fleet c972f54b in detail
  const fleet = await c.query(`
    SELECT f.*, p.name as origin_name, p.galaxy as origin_galaxy, p.solar_system as origin_system, p.position as origin_pos
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.id = 'c972f54b-a162-4159-afe7-1aac38b87612'
  `);
  console.log('SUSPICIOUS FLEET:', JSON.stringify(fleet.rows, null, 2));

  // Get ships for this fleet  
  const ships = await c.query(`
    SELECT fs.*, st.code, st.name, st.cargo_capacity
    FROM fleet_ships fs 
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE fs.fleet_id = 'c972f54b-a162-4159-afe7-1aac38b87612'
  `);
  console.log('FLEET SHIPS:', JSON.stringify(ships.rows, null, 2));

  // Check fleet_restoration_log for any info
  const restorationLog = await c.query(`
    SELECT * FROM fleet_restoration_log 
    WHERE fleet_id = 'c972f54b-a162-4159-afe7-1aac38b87612'
    OR user_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [userId]).catch(() => ({ rows: [] }));
  console.log('RESTORATION LOG:', JSON.stringify(restorationLog.rows, null, 2));

  // Also check: were there any fleets that were in-flight with deploy from [1:104:10] to [1:105:5]?
  const deployFleets = await c.query(`
    SELECT f.id, f.mission_type, f.cargo_metal, f.cargo_crystal, f.cargo_deuterium, 
           f.is_returning, f.is_completed, f.departure_time, f.arrival_time, f.return_time,
           f.target_galaxy, f.target_system, f.target_position,
           p.galaxy as origin_galaxy, p.solar_system as origin_system, p.position as origin_pos
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1
    AND p.galaxy = 1 AND p.solar_system = 104 AND p.position = 10
    AND f.target_galaxy = 1 AND f.target_system = 105 AND f.target_position = 5
    ORDER BY f.created_at DESC
    LIMIT 10
  `, [userId]);
  console.log('\nDEPLOY FLEETS [1:104:10] -> [1:105:5]:', JSON.stringify(deployFleets.rows, null, 2));

  // Check: the fleet record says cargo was 2890000/1930000/1270000 and is_completed=true
  // But the process_fleet_arrival should have deposited cargo on origin planet
  // Let's check what's on origin planet now
  const originResources = await c.query(`
    SELECT * FROM planet_resources WHERE planet_id = '1473a75a-ef98-495b-a6c0-b9e9dc0889cd'
  `);
  console.log('\nORIGIN PLANET [1:104:10] RESOURCES:', JSON.stringify(originResources.rows, null, 2));

  // Check the specific deploy fleet from 04:55 that went from [1:104:10] to [1:105:5]
  // with 1028000 metal, 72000 crystal, 50000 deuterium
  const deployFleet2 = await c.query(`
    SELECT * FROM fleets WHERE id = '2635d119-84c4-452a-9e60-2eddeac7c630'
  `);
  console.log('\nDEPLOY FLEET 2635:', JSON.stringify(deployFleet2.rows, null, 2));

  // Check if there's a newer cancel_fleet function
  const funcs = await c.query(`
    SELECT routine_name FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name IN ('cancel_fleet', 'recall_deployed_fleet', 'process_fleet_arrival', 'process_user_pending_fleets')
  `);
  console.log('\nFUNCTIONS:', JSON.stringify(funcs.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
