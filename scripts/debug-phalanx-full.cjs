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

  // 1. Find players who have phalanx and enough deuterium
  const phalanxPlayers = await client.query(`
    SELECT pr.username, p.id as moon_id, p.galaxy, p.solar_system, p.position,
      pb.level as phalanx_level,
      (pb.level * pb.level) - 1 as phalanx_range,
      COALESCE(res.deuterium, 0) as deut
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id AND bt.code = 'sensor_phalanx'
    JOIN planets p ON p.id = pb.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN planet_resources res ON res.planet_id = p.id
    WHERE pb.level > 0
    ORDER BY pb.level DESC
  `);

  console.log('=== ALL PLAYERS WITH SENSOR PHALANX ===');
  console.log(`Total: ${phalanxPlayers.rows.length} moons with phalanx\n`);
  
  phalanxPlayers.rows.forEach(r => {
    const canScan = r.deut >= 5000;
    console.log(`  ${r.username.padEnd(24)} Luna [${r.galaxy}:${String(r.solar_system).padStart(3)}:${String(r.position).padStart(2)}] | Level ${r.phalanx_level} | Range: ${String(r.phalanx_range).padStart(2)} systems | Deut: ${Math.floor(r.deut).toLocaleString().padStart(10)} ${canScan ? '✅ CAN SCAN' : '❌ NO DEUT'}`);
  });

  // 2. For each phalanx moon, find active fleets in their scan range
  console.log('\n=== FLEET ACTIVITY IN PHALANX RANGES ===');
  for (const moon of phalanxPlayers.rows) {
    const range = moon.phalanx_range;
    const minSys = moon.solar_system - range;
    const maxSys = moon.solar_system + range;
    
    const fleets = await client.query(`
      SELECT COUNT(*) as cnt
      FROM fleets f
      WHERE f.is_completed = false
      AND (
        (f.target_galaxy = $1 AND f.target_system BETWEEN $2 AND $3 AND NOT f.is_returning)
        OR
        (EXISTS (
          SELECT 1 FROM planets p WHERE p.id = f.origin_planet_id 
          AND p.galaxy = $1 AND p.solar_system BETWEEN $2 AND $3
        ) AND f.is_returning)
      )
    `, [moon.galaxy, minSys, maxSys]);

    if (parseInt(fleets.rows[0].cnt) > 0) {
      console.log(`  ${moon.username} [${moon.galaxy}:${moon.solar_system}:${moon.position}] → ${fleets.rows[0].cnt} fleets in range (sys ${minSys}-${maxSys})`);
    }
  }

  // 3. Check RLS policies on planet_buildings table (could block the initial query)
  const rlsPB = await client.query(`
    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as policy_expr
    FROM pg_policy WHERE polrelid = 'planet_buildings'::regclass
  `);
  console.log('\n=== RLS POLICIES on planet_buildings ===');
  rlsPB.rows.forEach(r => console.log(`  ${r.polname}: cmd=${r.polcmd}, expr=${r.policy_expr}`));

  // 4. Check RLS policies on planets table
  const rlsP = await client.query(`
    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as policy_expr
    FROM pg_policy WHERE polrelid = 'planets'::regclass
  `);
  console.log('\n=== RLS POLICIES on planets ===');
  rlsP.rows.forEach(r => console.log(`  ${r.polname}: cmd=${r.polcmd}, expr=${r.policy_expr}`));

  // 5. Check building_types RLS
  const rlsBT = await client.query(`
    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as policy_expr
    FROM pg_policy WHERE polrelid = 'building_types'::regclass
  `);
  console.log('\n=== RLS POLICIES on building_types ===');
  rlsBT.rows.forEach(r => console.log(`  ${r.polname}: cmd=${r.polcmd}, expr=${r.policy_expr}`));

  // 6. Check if planet_buildings has an RLS that restricts reads to own buildings only
  const rlsEnabled = await client.query(`
    SELECT relrowsecurity, relforcerowsecurity
    FROM pg_class WHERE relname = 'planet_buildings'
  `);
  console.log('\n=== planet_buildings RLS enabled? ===');
  console.log('  RLS:', rlsEnabled.rows[0].relrowsecurity ? 'ENABLED' : 'DISABLED');
  console.log('  Force RLS:', rlsEnabled.rows[0].relforcerowsecurity ? 'YES' : 'NO');

  // 7. Verify: can authenticated users read building_types?
  const rlsEnabledBT = await client.query(`
    SELECT relrowsecurity FROM pg_class WHERE relname = 'building_types'
  `);
  console.log('\n  building_types RLS:', rlsEnabledBT.rows[0].relrowsecurity ? 'ENABLED' : 'DISABLED');

  // 8. Most critical: Check what the frontend query would actually return via Supabase (RLS)
  // The frontend does: supabase.from('planet_buildings').select('planet_id, level').eq('building_type_id', btData.id).in('planet_id', moonIds).gt('level', 0)
  // If RLS restricts to own planet_buildings only, then this works ONLY for the logged-in user's moons - which is correct!
  // But let's verify the policy
  console.log('\n=== CRITICAL: planet_buildings SELECT policies ===');
  const pbPolicies = await client.query(`
    SELECT polname, polcmd::text, pg_get_expr(polqual, polrelid) as using_expr,
      pg_get_expr(polwithcheck, polrelid) as check_expr,
      ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(polroles)) as roles
    FROM pg_policy WHERE polrelid = 'planet_buildings'::regclass
  `);
  pbPolicies.rows.forEach(r => {
    console.log(`  Policy: ${r.polname}`);
    console.log(`    Command: ${r.polcmd}`);
    console.log(`    Roles: ${r.roles}`);
    console.log(`    USING: ${r.using_expr}`);
    console.log(`    CHECK: ${r.check_expr}`);
  });

  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
