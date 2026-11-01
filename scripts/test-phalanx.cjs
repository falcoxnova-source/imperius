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
  
  // Test 1: Check if the function can be called at all (will fail on auth but that's expected)
  try {
    const res = await client.query(`
      SELECT phalanx_scan(
        '00000000-0000-0000-0000-000000000000'::uuid,
        1, 1, 1
      ) as result
    `);
    console.log('Test 1 (no auth):', res.rows[0].result);
  } catch (e) {
    console.log('Test 1 error:', e.message);
  }
  
  // Test 2: Check if there are any active fleets right now
  const fleets = await client.query(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN is_returning THEN 1 ELSE 0 END) as returning,
      SUM(CASE WHEN NOT is_returning THEN 1 ELSE 0 END) as outgoing
    FROM fleets WHERE is_completed = false
  `);
  console.log('\nActive fleets:', fleets.rows[0]);
  
  // Test 3: Check if function can access fleets table (SECURITY DEFINER should bypass RLS)
  // Let's try to call the function AS a user who has phalanx
  // Goraforever has level 4 phalanx on moon [3:45:9], range 15 systems
  const goraId = await client.query(`SELECT id FROM profiles WHERE username = 'Goraforever'`);
  const goraMoon = await client.query(`
    SELECT p.id, p.galaxy, p.solar_system, p.position 
    FROM planets p
    JOIN planet_buildings pb ON pb.planet_id = p.id
    JOIN building_types bt ON bt.id = pb.building_type_id AND bt.code = 'sensor_phalanx'
    WHERE p.user_id = $1 AND p.planet_type = 'moon' AND pb.level > 0
    LIMIT 1
  `, [goraId.rows[0].id]);
  
  console.log('\nGoraforever moon:', goraMoon.rows[0]);
  
  // Find an enemy planet in range of Goraforever's moon [3:45:9] (range 15 systems => systems 30-60)
  const targets = await client.query(`
    SELECT p.galaxy, p.solar_system, p.position, p.name, pr.username
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type = 'planet'
    AND p.galaxy = 3
    AND p.solar_system BETWEEN 30 AND 60
    AND p.user_id != $1
    AND p.is_destroyed = false
    LIMIT 5
  `, [goraId.rows[0].id]);
  console.log('\nPossible targets in range:');
  targets.rows.forEach(t => console.log(`  ${t.username} - ${t.name} [${t.galaxy}:${t.solar_system}:${t.position}]`));
  
  // Test 4: Check if function uses auth.uid() - this means it can only be called via Supabase client
  // The function REQUIRES auth.uid() which won't work from direct pg connection
  // This is EXPECTED - let's verify by checking the function source for auth.uid()
  const funcSrc = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'phalanx_scan'`);
  const hasAuth = funcSrc.rows[0].prosrc.includes('auth.uid()');
  console.log('\nFunction uses auth.uid():', hasAuth);
  console.log('(This means it can ONLY work via Supabase client, not direct pg - that is correct)');
  
  // Test 5: Check if there's a deuterium issue - moons with phalanx but no deuterium
  const deutCheck = await client.query(`
    SELECT pr.username, p.name, p.galaxy, p.solar_system, p.position,
      pb.level as phalanx_level,
      COALESCE(res.deuterium, 0) as deuterium
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id AND bt.code = 'sensor_phalanx'
    JOIN planets p ON p.id = pb.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN planet_resources res ON res.planet_id = p.id
    WHERE pb.level >= 2
    ORDER BY pb.level DESC
    LIMIT 15
  `);
  console.log('\n=== Phalanx moons - deuterium check ===');
  deutCheck.rows.forEach(r => {
    const hasDeut = r.deuterium >= 5000;
    console.log(`  ${r.username.padEnd(22)} [${r.galaxy}:${r.solar_system}:${r.position}] | PH Lvl ${r.phalanx_level} | Deut: ${Math.floor(r.deuterium)} ${hasDeut ? '✅' : '⚠️ LOW'}`);
  });
  
  // Test 6: Check if planet_resources exists for ALL moons with phalanx
  const noRes = await client.query(`
    SELECT p.id, p.name, pr.username
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id AND bt.code = 'sensor_phalanx'
    JOIN planets p ON p.id = pb.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN planet_resources res ON res.planet_id = p.id
    WHERE pb.level > 0 AND res.planet_id IS NULL
  `);
  console.log('\n=== Moons with phalanx but NO planet_resources row ===');
  console.log(noRes.rows.length === 0 ? 'None (all OK)' : noRes.rows);
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
