const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Find user by email
  console.log('=== FIND USER ===');
  const user = await c.query(`
    SELECT p.id, p.username, p.email, p.fxu_balance, p.is_admin
    FROM profiles p
    WHERE LOWER(p.email) = LOWER('Roxytrust21@gmail.com')
  `);
  if (user.rows.length === 0) {
    console.log('User not found by email, trying auth.users...');
    const authUser = await c.query(`
      SELECT au.id, au.email FROM auth.users au WHERE LOWER(au.email) = LOWER('Roxytrust21@gmail.com')
    `);
    console.log('Auth user:', authUser.rows);
    if (authUser.rows.length > 0) {
      const prof = await c.query(`SELECT * FROM profiles WHERE id = $1`, [authUser.rows[0].id]);
      console.log('Profile:', prof.rows[0]);
    }
    await c.end();
    return;
  }
  
  const userId = user.rows[0].id;
  console.log('User:', user.rows[0].username, '| ID:', userId);

  // 2. Get all planets (including moons)
  console.log('\n=== ALL PLANETS/MOONS ===');
  const planets = await c.query(`
    SELECT p.id, p.name, p.planet_type, p.is_moon, p.galaxy, p.system, p.position,
           p.max_fields, p.used_fields, p.diameter, p.temperature_min, p.temperature_max,
           p.is_main_planet, p.parent_planet_id
    FROM planets p
    WHERE p.user_id = $1
    ORDER BY p.is_moon, p.galaxy, p.system, p.position
  `, [userId]);
  
  for (const pl of planets.rows) {
    console.log(`  ${pl.planet_type} "${pl.name}" [${pl.galaxy}:${pl.system}:${pl.position}] | moon=${pl.is_moon} | fields=${pl.used_fields}/${pl.max_fields} | diameter=${pl.diameter} | parent=${pl.parent_planet_id || 'none'}`);
  }

  // 3. Find the moon "Caliope" specifically
  const moons = planets.rows.filter(p => p.is_moon);
  console.log('\n=== MOONS DETAIL ===');
  
  for (const moon of moons) {
    console.log(`\nMoon: "${moon.name}" | ID: ${moon.id}`);
    console.log(`  Fields: ${moon.used_fields}/${moon.max_fields} | Diameter: ${moon.diameter}`);
    
    // 4. Check buildings on this moon
    const buildings = await c.query(`
      SELECT pb.id, bt.code, bt.name, pb.level, bt.fields_per_level,
             bt.provides_fields
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = $1
      ORDER BY bt.code
    `, [moon.id]);
    
    console.log('  Buildings:');
    for (const b of buildings.rows) {
      console.log(`    ${b.code} (${b.name}): level ${b.level} | fields_per_level=${b.fields_per_level} | provides_fields=${b.provides_fields}`);
    }

    // 5. Check resources
    const res = await c.query(`
      SELECT metal, crystal, deuterium FROM planet_resources WHERE planet_id = $1
    `, [moon.id]);
    if (res.rows.length > 0) {
      console.log(`  Resources: M=${res.rows[0].metal} C=${res.rows[0].crystal} D=${res.rows[0].deuterium}`);
    }

    // 6. Check build queue
    const queue = await c.query(`
      SELECT bq.*, bt.code, bt.name 
      FROM build_queue bq
      JOIN building_types bt ON bt.id = bq.building_type_id
      WHERE bq.planet_id = $1
      ORDER BY bq.created_at DESC
      LIMIT 5
    `, [moon.id]);
    if (queue.rows.length > 0) {
      console.log('  Build queue:');
      for (const q of queue.rows) {
        console.log(`    ${q.code} level ${q.target_level} | status=${q.status} | created=${q.created_at} | completes=${q.completes_at}`);
      }
    }
  }

  // 7. Check lunar_base building type definition
  console.log('\n=== LUNAR_BASE BUILDING TYPE ===');
  const lunarBase = await c.query(`
    SELECT * FROM building_types WHERE code = 'lunar_base'
  `);
  if (lunarBase.rows.length > 0) {
    const lb = lunarBase.rows[0];
    console.log(`  Code: ${lb.code} | Name: ${lb.name}`);
    console.log(`  Fields per level: ${lb.fields_per_level}`);
    console.log(`  Provides fields: ${lb.provides_fields}`);
    console.log(`  Moon only: ${lb.moon_only}`);
    console.log(`  Metal base: ${lb.metal_base} | Crystal base: ${lb.crystal_base} | Deut base: ${lb.deuterium_base}`);
    console.log(`  Metal factor: ${lb.metal_factor} | Crystal factor: ${lb.crystal_factor} | Deut factor: ${lb.deuterium_factor}`);
  }

  // 8. Check the complete_building function for lunar_base logic
  console.log('\n=== COMPLETE_BUILDING FUNCTION (lunar_base parts) ===');
  const fn = await c.query("SELECT prosrc FROM pg_proc WHERE proname='complete_building' LIMIT 1");
  if (fn.rows.length > 0) {
    const lines = fn.rows[0].prosrc.split('\n');
    const relevant = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('lunar_base') || 
          lines[i].toLowerCase().includes('max_fields') ||
          lines[i].toLowerCase().includes('provides_fields') ||
          lines[i].toLowerCase().includes('fields_per_level')) {
        // Get context
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length - 1, i + 2);
        for (let j = start; j <= end; j++) {
          if (!relevant.includes(`${j}: ${lines[j]}`)) {
            relevant.push(`${j}: ${lines[j]}`);
          }
        }
        relevant.push('---');
      }
    }
    console.log(relevant.join('\n'));
  }

  // 9. Also check start_building for lunar_base
  console.log('\n=== START_BUILDING FUNCTION (lunar_base parts) ===');
  const fn2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='start_building' LIMIT 1");
  if (fn2.rows.length > 0) {
    const lines = fn2.rows[0].prosrc.split('\n');
    const relevant = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('lunar_base') || 
          lines[i].toLowerCase().includes('max_fields') ||
          lines[i].toLowerCase().includes('provides_fields')) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length - 1, i + 2);
        for (let j = start; j <= end; j++) {
          if (!relevant.includes(`${j}: ${lines[j]}`)) {
            relevant.push(`${j}: ${lines[j]}`);
          }
        }
        relevant.push('---');
      }
    }
    console.log(relevant.join('\n'));
  }

  // 10. Check build history for this user's moons
  console.log('\n=== BUILD HISTORY ON MOONS (last 20) ===');
  for (const moon of moons) {
    const history = await c.query(`
      SELECT bq.*, bt.code, bt.name
      FROM build_queue bq
      JOIN building_types bt ON bt.id = bq.building_type_id
      WHERE bq.planet_id = $1
      ORDER BY bq.created_at DESC
      LIMIT 20
    `, [moon.id]);
    console.log(`Moon "${moon.name}":`);
    for (const h of history.rows) {
      console.log(`  ${h.code} lv${h.target_level} | status=${h.status} | created=${h.created_at} | completes=${h.completes_at}`);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
