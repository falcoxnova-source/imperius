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
  const userId = 'a77c7689-a422-4a7f-8c86-0395c7dcaa2f';

  // 1) Planets (user_id not owner_id)
  console.log('=== PLANETS ===');
  const planets = await c.query(`
    SELECT id, name, galaxy, solar_system, position, planet_type, is_main_planet, created_at 
    FROM planets 
    WHERE user_id = $1 
    ORDER BY is_main_planet DESC, created_at ASC
  `, [userId]);
  planets.rows.forEach((p, i) => {
    console.log(`  [${i}] ${p.id.substring(0,8)} | ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}] ${p.is_main_planet ? '(MAIN)' : '(colony)'}`);
  });

  // 2) Resource table - planet_resources
  console.log('\n=== RESOURCE TABLES ===');
  const rtables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' 
      AND (table_name ILIKE '%resource%' OR table_name ILIKE '%planet_res%')
  `);
  console.log(rtables.rows.map(r => r.table_name));

  // Check if resources are in a separate table
  const rcols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='planet_resources' AND table_schema='public' 
    ORDER BY ordinal_position
  `);
  if (rcols.rows.length) {
    console.log('planet_resources columns:', rcols.rows.map(x => x.column_name).join(', '));
    
    // Get resources for this player's planets
    const planetIds = planets.rows.map(p => p.id);
    const res = await c.query(`
      SELECT pr.*, p.name as planet_name
      FROM planet_resources pr
      JOIN planets p ON p.id = pr.planet_id
      WHERE pr.planet_id = ANY($1)
      ORDER BY p.is_main_planet DESC, p.created_at ASC
    `, [planetIds]);
    console.log('\nPlanet resources:');
    res.rows.forEach(r => {
      console.log(`  ${r.planet_name}: M:${r.metal} C:${r.crystal} D:${r.deuterium}`);
    });
  }

  // 3) Fleet columns known: origin_planet_id (not source_planet_id), no ships column visible
  // Check fleet_ships or similar
  console.log('\n=== SHIP-RELATED TABLES ===');
  const stables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' 
      AND (table_name ILIKE '%ship%' OR table_name ILIKE '%fleet_ship%' OR table_name ILIKE '%fleet_unit%')
  `);
  console.log(stables.rows.map(r => r.table_name));

  // 4) ALL recent fleets with correct column names
  console.log('\n=== ALL RECENT FLEETS (last 3 days) ===');
  const fleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.departure_time, f.arrival_time, f.return_time,
           op.name as origin_name, op.galaxy as og, op.solar_system as os, op.position as opos,
           f.target_galaxy, f.target_system, f.target_position, f.target_type
    FROM fleets f
    LEFT JOIN planets op ON f.origin_planet_id = op.id
    WHERE f.user_id = $1
      AND f.departure_time >= NOW() - INTERVAL '3 days'
    ORDER BY f.departure_time DESC
    LIMIT 30
  `, [userId]);
  
  console.log(`Found ${fleets.rows.length} fleets`);
  fleets.rows.forEach(f => {
    console.log(`\n  Fleet ${f.id.substring(0,8)}:`);
    console.log(`    Mission: ${f.mission_type} | Returning: ${f.is_returning} | Completed: ${f.is_completed}`);
    console.log(`    From: ${f.origin_name} [${f.og}:${f.os}:${f.opos}]`);
    console.log(`    To: [${f.target_galaxy}:${f.target_system}:${f.target_position}] type:${f.target_type}`);
    console.log(`    Cargo: M:${f.cargo_metal} C:${f.cargo_crystal} D:${f.cargo_deuterium}`);
    console.log(`    Depart: ${f.departure_time}`);
    console.log(`    Arrive: ${f.arrival_time}`);
    console.log(`    Return: ${f.return_time}`);
  });

  // 5) Check fleet_ships table
  if (stables.rows.some(r => r.table_name === 'fleet_ships')) {
    console.log('\n=== FLEET SHIPS FOR RECENT FLEETS ===');
    const fleetIds = fleets.rows.map(f => f.id);
    if (fleetIds.length > 0) {
      const ships = await c.query(`
        SELECT fs.*, st.name as ship_name 
        FROM fleet_ships fs
        LEFT JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = ANY($1)
        ORDER BY fs.fleet_id, fs.ship_type_id
      `, [fleetIds]);
      ships.rows.forEach(s => {
        console.log(`  Fleet ${s.fleet_id.substring(0,8)}: ${s.ship_name || s.ship_type_id} x${s.quantity}`);
      });
    }
  }

  // 6) Check for fleet processing functions
  console.log('\n=== FLEET PROCESSING FUNCTIONS ===');
  const funcs = await c.query(`
    SELECT p.proname 
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname='public' 
      AND (p.proname ILIKE '%fleet%' OR p.proname ILIKE '%process_arrival%' OR p.proname ILIKE '%deliver%' OR p.proname ILIKE '%transport%')
    ORDER BY p.proname
  `);
  console.log(funcs.rows.map(r => r.proname));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
