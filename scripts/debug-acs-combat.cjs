const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // Check: does acs_fleets have target_type column?
  const r1 = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'acs_fleets' 
    ORDER BY ordinal_position
  `);
  console.log('=== acs_fleets columns ===');
  r1.rows.forEach(r => console.log('  ' + r.column_name));
  
  // Check: does fleets table have target_type?
  const r2 = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'fleets' AND column_name LIKE 'target%'
    ORDER BY ordinal_position
  `);
  console.log('\n=== fleets target columns ===');
  r2.rows.forEach(r => console.log('  ' + r.column_name));
  
  // Check recent ACS battles - do they involve moons?
  const r3 = await client.query(`
    SELECT af.id, af.target_galaxy, af.target_system, af.target_position, af.status,
      (SELECT COUNT(*) FROM planets p WHERE p.galaxy = af.target_galaxy AND p.solar_system = af.target_system AND p.position = af.target_position) as planets_at_coords,
      (SELECT string_agg(p.planet_type || '(' || COALESCE(p2.username, 'null') || ')', ', ') 
       FROM planets p LEFT JOIN profiles p2 ON p.user_id = p2.id
       WHERE p.galaxy = af.target_galaxy AND p.solar_system = af.target_system AND p.position = af.target_position) as planet_types
    FROM acs_fleets af
    ORDER BY af.created_at DESC
    LIMIT 10
  `);
  console.log('\n=== Recent ACS fleets ===');
  r3.rows.forEach(r => console.log(JSON.stringify(r)));
  
  // Check recent battle reports for ACS (result = attacker_won but loot = 0)
  const r4 = await client.query(`
    SELECT id, created_at, result, rounds, loot_metal, loot_crystal, loot_deuterium,
      defender_losses_metal, defender_losses_crystal, coordinates
    FROM battle_reports
    WHERE report_data->>'total_fleet_power' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\n=== Recent ACS battle reports ===');
  r4.rows.forEach(r => console.log(JSON.stringify(r)));
  
  // Check simulate_xnova_combat - what happens with empty defender?
  const r5 = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'simulate_xnova_combat'");
  const src = r5.rows[0].prosrc;
  // Just find the early return / empty defender handling
  const lines = src.split('\n');
  console.log('\n=== simulate_xnova_combat first 50 lines ===');
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    console.log((i+1).toString().padStart(3) + ': ' + lines[i]);
  }
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
