const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. ALL planets where fields_used > fields_max
  console.log('=== PLANETS WITH fields_used > fields_max ===');
  const { rows: overflow } = await c.query(`
    SELECT p.id, p.name, p.user_id, pr.username, p.fields_max, p.fields_used, 
           p.diameter, p.is_main_planet,
           p.galaxy, p.solar_system, p.position,
           (p.fields_used - p.fields_max) as overflow
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.user_id IS NOT NULL 
    AND p.fields_used > p.fields_max
    ORDER BY (p.fields_used - p.fields_max) DESC
  `);
  console.log(`Found ${overflow.length} planets with overflow:`);
  for (const p of overflow) {
    console.log(`  ${p.username} - "${p.name}" [${p.galaxy}:${p.solar_system}:${p.position}] -> ${p.fields_used}/${p.fields_max} (overflow: +${p.overflow}, diameter: ${p.diameter}, main: ${p.is_main_planet})`);
  }

  // 2. Check terraformer levels on overflow planets
  if (overflow.length > 0) {
    const planetIds = overflow.map(p => `'${p.id}'`).join(',');
    console.log('\n=== TERRAFORMER LEVELS on overflow planets ===');
    const { rows: terra } = await c.query(`
      SELECT pb.planet_id, p.name, pr.username, bt.internal_name, pb.level
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      JOIN planets p ON p.id = pb.planet_id
      LEFT JOIN profiles pr ON pr.id = p.user_id
      WHERE pb.planet_id IN (${planetIds})
      AND bt.internal_name = 'terraformer'
      ORDER BY pb.planet_id
    `);
    for (const t of terra) {
      console.log(`  ${t.username} - "${p?.name || t.planet_id}": terraformer level ${t.level}`);
    }
    // Fix: use proper lookup
    const terraMap = {};
    for (const t of terra) {
      terraMap[t.planet_id] = t.level;
    }
    for (const p of overflow) {
      const tLevel = terraMap[p.id] || 0;
      const expectedFields = Math.floor(p.diameter / 1000 * 6) + tLevel;
      console.log(`  ${p.username} - "${p.name}": diameter=${p.diameter}, terraform=${tLevel}, expected_max=${expectedFields}, actual_max=${p.fields_max}`);
    }
  }

  // 3. Check ALL functions that modify fields_max
  console.log('\n=== FUNCTIONS that reference fields_max ===');
  const { rows: fns } = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc LIKE '%fields_max%'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY proname
  `);
  for (const f of fns) {
    console.log(`  ${f.proname}`);
  }

  // 4. Check process_building_completion for terraformer logic
  console.log('\n=== process_building_completion - terraformer logic ===');
  const { rows: buildComp } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'process_building_completion'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (buildComp.length > 0) {
    const src = buildComp[0].prosrc;
    const idx = src.toLowerCase().indexOf('terraform');
    if (idx >= 0) {
      console.log(src.substring(Math.max(0, idx - 300), Math.min(src.length, idx + 600)));
    } else {
      console.log('No terraformer section found');
      // Search for fields_max updates
      const fmIdx = src.indexOf('fields_max');
      if (fmIdx >= 0) {
        console.log('Found fields_max at:', src.substring(Math.max(0, fmIdx - 200), Math.min(src.length, fmIdx + 400)));
      }
    }
  }

  // 5. Check if our VIP migration touched any function that uses fields_max
  console.log('\n=== Did secure_abandon_colony affect fields_max? ===');
  const { rows: abandonFn } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'secure_abandon_colony'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (abandonFn.length > 0) {
    const src = abandonFn[0].prosrc;
    if (src.includes('fields_max')) {
      const idx = src.indexOf('fields_max');
      console.log('YES - sets fields_max here:');
      console.log(src.substring(Math.max(0, idx - 200), Math.min(src.length, idx + 200)));
    } else if (src.includes('max_fields')) {
      console.log('WARNING: uses old column name max_fields!');
      const idx = src.indexOf('max_fields');
      console.log(src.substring(Math.max(0, idx - 200), Math.min(src.length, idx + 200)));
    } else {
      console.log('Does NOT touch fields_max');
    }
  }

  // 6. Check for Kul Tiras user's astrophysics level
  console.log('\n=== Kul Tiras user astrophysics level ===');
  const { rows: kulUser } = await c.query(`
    SELECT p.user_id, pr.username FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.name = 'Kul Tiras'
  `);
  if (kulUser.length > 0) {
    const userId = kulUser[0].user_id;
    console.log(`User: ${kulUser[0].username} (${userId})`);
    
    const { rows: astro } = await c.query(`
      SELECT ut.level, tt.internal_name 
      FROM user_technologies ut
      JOIN technology_types tt ON tt.id = ut.technology_type_id
      WHERE ut.user_id = $1
      AND tt.internal_name = 'astrophysics'
    `, [userId]);
    console.log(`  Astrophysics: ${astro.length > 0 ? 'Level ' + astro[0].level : 'Not found'}`);

    // All this user's planets and fields
    const { rows: userPlanets } = await c.query(`
      SELECT name, galaxy, solar_system, position, diameter, fields_used, fields_max, is_main_planet
      FROM planets WHERE user_id = $1 ORDER BY created_at
    `, [userId]);
    console.log(`  All planets:`);
    for (const p of userPlanets) {
      const baseFields = Math.floor(p.diameter / 1000 * 6);
      console.log(`    "${p.name}" [${p.galaxy}:${p.solar_system}:${p.position}] ${p.fields_used}/${p.fields_max} (diameter: ${p.diameter}, base_fields: ${baseFields}, main: ${p.is_main_planet})`);
    }
  }

  // 7. Check the formula used to calculate fields_max in colonize
  console.log('\n=== colonize_planet / process_colonize functions ===');
  const { rows: colonFns } = await c.query(`
    SELECT proname, prosrc FROM pg_proc 
    WHERE (proname LIKE '%colonize%' OR proname LIKE '%coloniz%')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY proname
  `);
  for (const f of colonFns) {
    console.log(`\n--- ${f.proname} ---`);
    const fmIdx = f.prosrc.indexOf('fields_max');
    if (fmIdx >= 0) {
      console.log(f.prosrc.substring(Math.max(0, fmIdx - 300), Math.min(f.prosrc.length, fmIdx + 300)));
    } else {
      console.log('No fields_max reference. First 500 chars:');
      console.log(f.prosrc.substring(0, 500));
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
