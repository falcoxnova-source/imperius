const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const userId = 'c6531fc3-0fa5-4293-92fe-8f3604d22bc9';
  console.log('User: Touka (Roxy)');

  // Check planets table columns first
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='planets' ORDER BY ordinal_position`);
  console.log('\n=== PLANETS COLUMNS ===');
  console.log(cols.rows.map(r => r.column_name).join(', '));

  // Get all planets/moons
  console.log('\n=== ALL PLANETS/MOONS ===');
  const planets = await c.query(`
    SELECT p.id, p.name, p.planet_type, p.galaxy, p.system, p.position,
           p.max_fields, p.used_fields, p.diameter, p.is_main_planet, p.parent_planet_id
    FROM planets p
    WHERE p.user_id = $1
    ORDER BY p.planet_type, p.galaxy, p.system, p.position
  `, [userId]);
  
  for (const pl of planets.rows) {
    console.log(`  ${pl.planet_type} "${pl.name}" [${pl.galaxy}:${pl.system}:${pl.position}] | fields=${pl.used_fields}/${pl.max_fields} | diameter=${pl.diameter} | parent=${pl.parent_planet_id || 'none'} | ID=${pl.id}`);
  }

  // Find moons
  const moons = planets.rows.filter(p => p.planet_type === 'moon');
  
  for (const moon of moons) {
    console.log(`\n=== MOON: "${moon.name}" (${moon.id}) ===`);
    console.log(`  Fields: ${moon.used_fields}/${moon.max_fields} | Diameter: ${moon.diameter}`);
    
    // Buildings on this moon
    const buildings = await c.query(`
      SELECT pb.id, bt.code, bt.name, pb.level, bt.fields_per_level, bt.provides_fields
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = $1
      ORDER BY bt.code
    `, [moon.id]);
    
    console.log('  Buildings:');
    for (const b of buildings.rows) {
      console.log(`    ${b.code} (${b.name}): level ${b.level} | fields_per_level=${b.fields_per_level} | provides_fields=${b.provides_fields}`);
    }

    // Resources
    const res = await c.query(`SELECT metal, crystal, deuterium FROM planet_resources WHERE planet_id = $1`, [moon.id]);
    if (res.rows.length > 0) {
      console.log(`  Resources: M=${res.rows[0].metal} C=${res.rows[0].crystal} D=${res.rows[0].deuterium}`);
    }

    // Build queue
    const queue = await c.query(`
      SELECT bq.*, bt.code, bt.name 
      FROM build_queue bq
      JOIN building_types bt ON bt.id = bq.building_type_id
      WHERE bq.planet_id = $1
      ORDER BY bq.created_at DESC
      LIMIT 10
    `, [moon.id]);
    if (queue.rows.length > 0) {
      console.log('  Build queue (recent):');
      for (const q of queue.rows) {
        console.log(`    ${q.code} -> level ${q.target_level} | status=${q.status} | created=${q.created_at} | completes=${q.completes_at}`);
      }
    }
  }

  // Lunar base building type definition
  console.log('\n=== LUNAR_BASE BUILDING TYPE ===');
  const lunarBase = await c.query(`SELECT * FROM building_types WHERE code = 'lunar_base'`);
  if (lunarBase.rows.length > 0) {
    const lb = lunarBase.rows[0];
    console.log(`  ID: ${lb.id} | Code: ${lb.code} | Name: ${lb.name}`);
    console.log(`  Fields per level: ${lb.fields_per_level}`);
    console.log(`  Provides fields: ${lb.provides_fields}`);
    console.log(`  Moon only: ${lb.moon_only}`);
    console.log(`  Metal base: ${lb.metal_base} | Crystal base: ${lb.crystal_base} | Deut base: ${lb.deuterium_base}`);
    console.log(`  Metal factor: ${lb.metal_factor} | Crystal factor: ${lb.crystal_factor} | Deut factor: ${lb.deuterium_factor}`);
  }

  // Check complete_building function - lunar_base logic
  console.log('\n=== COMPLETE_BUILDING FUNCTION (lunar_base/max_fields parts) ===');
  const fn = await c.query("SELECT prosrc FROM pg_proc WHERE proname='complete_building' LIMIT 1");
  if (fn.rows.length > 0) {
    const src = fn.rows[0].prosrc;
    const lines = src.split('\n');
    const printed = new Set();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('lunar_base') || 
          lines[i].toLowerCase().includes('max_fields') ||
          lines[i].toLowerCase().includes('provides_fields') ||
          lines[i].toLowerCase().includes('used_fields')) {
        const start = Math.max(0, i - 3);
        const end = Math.min(lines.length - 1, i + 3);
        for (let j = start; j <= end; j++) {
          const key = `${j}: ${lines[j]}`;
          if (!printed.has(key)) {
            printed.add(key);
            console.log(key);
          }
        }
        console.log('---');
      }
    }
  } else {
    console.log('complete_building function NOT FOUND');
    // Check alternative names
    const fns = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%lunar_base%' AND prosrc ILIKE '%max_fields%'");
    console.log('Functions mentioning lunar_base + max_fields:', fns.rows.map(r => r.proname));
  }

  // Also check process_build_queue or similar
  console.log('\n=== FUNCTIONS WITH lunar_base + max_fields ===');
  const fns = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%lunar_base%'");
  console.log('Functions mentioning lunar_base:', fns.rows.map(r => r.proname));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
