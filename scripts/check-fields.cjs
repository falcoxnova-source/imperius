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

  // 1. Check planets where used_fields > max_fields
  console.log('=== PLANETS WITH used_fields > max_fields ===');
  const { rows: overflowPlanets } = await c.query(`
    SELECT p.id, p.name, p.user_id, pr.username, p.max_fields, p.used_fields, 
           p.diameter, p.is_homeworld,
           p.galaxy, p.system, p.position
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.user_id IS NOT NULL 
    AND p.used_fields > p.max_fields
    ORDER BY (p.used_fields - p.max_fields) DESC
  `);
  console.log(`Found ${overflowPlanets.length} planets with overflow:`);
  for (const p of overflowPlanets) {
    console.log(`  ${p.username} - ${p.name} [${p.galaxy}:${p.system}:${p.position}] -> ${p.used_fields}/${p.max_fields} (diameter: ${p.diameter}, hw: ${p.is_homeworld})`);
  }

  // 2. Check how max_fields is calculated - look for related functions
  console.log('\n=== FUNCTIONS related to max_fields ===');
  const { rows: fieldFunctions } = await c.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname LIKE '%field%' OR proname LIKE '%max_field%' OR proname LIKE '%terraform%'
    ORDER BY proname
  `);
  for (const f of fieldFunctions) {
    console.log(`\n--- ${f.proname} ---`);
    console.log(f.prosrc.substring(0, 600));
  }

  // 3. Check if any function recalculates max_fields 
  console.log('\n=== FUNCTIONS that UPDATE max_fields ===');
  const { rows: updateFieldFns } = await c.query(`
    SELECT proname 
    FROM pg_proc 
    WHERE prosrc LIKE '%max_fields%' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY proname
  `);
  for (const f of updateFieldFns) {
    console.log(`  ${f.proname}`);
  }

  // 4. Check astrophysics-related functions
  console.log('\n=== ASTROPHYSICS FUNCTIONS ===');
  const { rows: astroFns } = await c.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE (prosrc LIKE '%astrophysic%' OR prosrc LIKE '%astrofisic%' OR proname LIKE '%astroph%')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY proname
  `);
  for (const f of astroFns) {
    console.log(`\n--- ${f.proname} ---`);
    console.log(f.prosrc.substring(0, 800));
  }

  // 5. Check colonize_planet or create_planet - how are max_fields initially set?
  console.log('\n=== colonize_planet / assign_planet functions ===');
  const { rows: colonizeFns } = await c.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE (proname LIKE '%colonize%' OR proname LIKE '%assign_planet%' OR proname LIKE '%create_colony%')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY proname
  `);
  for (const f of colonizeFns) {
    console.log(`\n--- ${f.proname} ---`);
    console.log(f.prosrc.substring(0, 1500));
  }

  // 6. Check process_building_completion for terraformer
  console.log('\n=== process_building_completion (terraformer section) ===');
  const { rows: buildCompFns } = await c.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'process_building_completion'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (buildCompFns.length > 0) {
    const src = buildCompFns[0].prosrc;
    // Find terraformer section
    const terraIdx = src.toLowerCase().indexOf('terraformer');
    if (terraIdx >= 0) {
      console.log(src.substring(Math.max(0, terraIdx - 200), Math.min(src.length, terraIdx + 800)));
    } else {
      console.log('No terraformer section found in process_building_completion');
    }
  }

  // 7. Specifically check "Kul Tiras" planet from the screenshot
  console.log('\n=== Kul Tiras planet ===');
  const { rows: kulTiras } = await c.query(`
    SELECT p.id, p.name, p.user_id, pr.username, p.max_fields, p.used_fields,
           p.diameter, p.galaxy, p.system, p.position, p.is_homeworld
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.name = 'Kul Tiras'
  `);
  for (const p of kulTiras) {
    console.log(`  ${p.username} - ${p.name} [${p.galaxy}:${p.system}:${p.position}] -> ${p.used_fields}/${p.max_fields} (diameter: ${p.diameter})`);
  }

  // 8. Check terraformer levels for overflow planets
  if (overflowPlanets.length > 0) {
    const planetIds = overflowPlanets.map(p => `'${p.id}'`).join(',');
    console.log('\n=== Terraformer levels for overflow planets ===');
    const { rows: terraLevels } = await c.query(`
      SELECT pb.planet_id, p.name, pr.username, bt.internal_name, pb.level
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      JOIN planets p ON p.id = pb.planet_id
      LEFT JOIN profiles pr ON pr.id = p.user_id
      WHERE pb.planet_id IN (${planetIds})
      AND bt.internal_name IN ('terraformer', 'lunar_base')
      ORDER BY pb.planet_id
    `);
    for (const t of terraLevels) {
      console.log(`  ${t.username} - ${t.name}: ${t.internal_name} level ${t.level}`);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
