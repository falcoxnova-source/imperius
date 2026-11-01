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

  // Get building_types columns
  const { rows: btCols } = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'building_types' ORDER BY ordinal_position
  `);
  console.log('building_types columns:', btCols.map(x => x.column_name).join(', '));

  const { rows: pbCols } = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'planet_buildings' ORDER BY ordinal_position
  `);
  console.log('planet_buildings columns:', pbCols.map(x => x.column_name).join(', '));

  // Overflow planets
  const overflowIds = [
    '42d213d4-6932-4f0d-998b-ad237d670bb3', // Kul Tiras
  ];

  // Find terraformer building type
  const { rows: terraType } = await c.query(`
    SELECT * FROM building_types WHERE name ILIKE '%terraform%' OR name ILIKE '%terra%'
  `);
  console.log('\nTerraformer building type:', JSON.stringify(terraType, null, 2));

  // Get Kul Tiras planet buildings
  console.log('\n=== Kul Tiras planet_buildings ===');
  const { rows: buildings } = await c.query(`
    SELECT pb.*, bt.name as building_name
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = '42d213d4-6932-4f0d-998b-ad237d670bb3'
    ORDER BY bt.name
  `);
  let totalFields = 0;
  for (const b of buildings) {
    totalFields += b.level;
    console.log(`  ${b.building_name}: level ${b.level}`);
  }
  console.log(`  TOTAL levels (=fields_used): ${totalFields}`);

  // Get second overflow planet
  console.log('\n=== Tapa "Colonia" ===');
  const { rows: tapaPlanets } = await c.query(`
    SELECT * FROM planets WHERE name = 'Colonia' AND fields_used > fields_max
  `);
  if (tapaPlanets.length > 0) {
    const tp = tapaPlanets[0];
    console.log(`  Planet: ${tp.name} [${tp.galaxy}:${tp.solar_system}:${tp.position}] ${tp.fields_used}/${tp.fields_max} diameter: ${tp.diameter}`);
    
    const { rows: tBuildings } = await c.query(`
      SELECT pb.*, bt.name as building_name
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = $1
      ORDER BY bt.name
    `, [tp.id]);
    let tTotal = 0;
    for (const b of tBuildings) {
      tTotal += b.level;
      console.log(`  ${b.building_name}: level ${b.level}`);
    }
    console.log(`  TOTAL levels (=fields_used): ${tTotal}`);
  }

  // Check functions that UPDATE fields_max
  console.log('\n=== Functions that UPDATE fields_max ===');
  const { rows: fns } = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc LIKE '%fields_max%'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY proname
  `);
  for (const f of fns) {
    console.log(`  ${f.proname}`);
  }

  // Check process_building_completion
  console.log('\n=== process_building_completion source (fields_max section) ===');
  const { rows: bComp } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'process_building_completion'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (bComp.length > 0) {
    const src = bComp[0].prosrc;
    // Find all occurrences of fields_max
    let idx = 0;
    while (true) {
      idx = src.indexOf('fields_max', idx);
      if (idx === -1) break;
      console.log(`\n  [pos ${idx}]:`, src.substring(Math.max(0, idx - 150), Math.min(src.length, idx + 150)));
      idx += 10;
    }
  }

  // Check secure_abandon_colony for fields_max
  console.log('\n=== secure_abandon_colony source (fields section) ===');
  const { rows: abandonFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_abandon_colony'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (abandonFn.length > 0) {
    const src = abandonFn[0].prosrc;
    if (src.includes('fields_max')) {
      const idx = src.indexOf('fields_max');
      console.log(src.substring(Math.max(0, idx - 200), Math.min(src.length, idx + 200)));
    } else if (src.includes('max_fields')) {
      console.log('WARNING: uses OLD column name max_fields!');
      const idx = src.indexOf('max_fields');
      console.log(src.substring(Math.max(0, idx - 200), Math.min(src.length, idx + 200)));
    } else {
      console.log('Does not reference fields_max at all');
    }
  }

  // Check Kul Tiras user's astrophysics
  console.log('\n=== FearDk astrophysics ===');
  const { rows: feardk } = await c.query(`
    SELECT ut.level, tt.name 
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = '6bfdd56b-7174-4f06-857b-5fcdcdb882f8'
    AND tt.name ILIKE '%astroph%'
  `);
  if (feardk.length > 0) {
    console.log(`  Astrophysics level: ${feardk[0].level}`);
  } else {
    console.log('  Not found');
  }

  // Check ALL FearDk planets
  console.log('\n=== All FearDk planets ===');
  const { rows: fdPlanets } = await c.query(`
    SELECT name, galaxy, solar_system, position, diameter, fields_used, fields_max, is_main_planet
    FROM planets WHERE user_id = '6bfdd56b-7174-4f06-857b-5fcdcdb882f8'
    ORDER BY created_at
  `);
  for (const p of fdPlanets) {
    const baseFields = Math.floor((p.diameter / 1000) ** 2);
    console.log(`  "${p.name}" [${p.galaxy}:${p.solar_system}:${p.position}] ${p.fields_used}/${p.fields_max} (diam: ${p.diameter}, base_sq: ${baseFields}, main: ${p.is_main_planet})`);
  }

  // Check formula: what formula gives fields_max from diameter?
  console.log('\n=== Checking fields_max formula across ALL planets ===');
  const { rows: allPlanets } = await c.query(`
    SELECT diameter, fields_max, fields_used, name, 
           ROUND(diameter::numeric / 1000 * 6, 0) as formula_div6,
           ROUND((diameter::numeric / 1000) * (diameter::numeric / 1000), 0) as formula_sq,
           ROUND(diameter::numeric / 100, 0) as formula_div100
    FROM planets 
    WHERE user_id IS NOT NULL AND is_destroyed = false
    ORDER BY diameter
    LIMIT 30
  `);
  console.log('  diameter | fields_max | d/1000*6 | (d/1000)^2 | d/100');
  for (const p of allPlanets) {
    console.log(`  ${p.diameter} | ${p.fields_max} | ${p.formula_div6} | ${p.formula_sq} | ${p.formula_div100} | "${p.name}"`);
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
