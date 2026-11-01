const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const userId = 'c6531fc3-0fa5-4293-92fe-8f3604d22bc9';

  // Get all planets/moons
  console.log('=== ALL PLANETS/MOONS ===');
  const planets = await c.query(`
    SELECT p.id, p.name, p.planet_type, p.galaxy, p.solar_system, p.position,
           p.fields_max, p.fields_used, p.diameter, p.is_main_planet
    FROM planets p
    WHERE p.user_id = $1
    ORDER BY p.planet_type, p.galaxy, p.solar_system, p.position
  `, [userId]);
  
  for (const pl of planets.rows) {
    console.log(`  ${pl.planet_type} "${pl.name}" [${pl.galaxy}:${pl.solar_system}:${pl.position}] | fields=${pl.fields_used}/${pl.fields_max} | diameter=${pl.diameter} | ID=${pl.id}`);
  }

  // Find moons
  const moons = planets.rows.filter(p => p.planet_type === 'moon');
  
  for (const moon of moons) {
    console.log(`\n=== MOON: "${moon.name}" (${moon.id}) ===`);
    console.log(`  Fields: ${moon.fields_used}/${moon.fields_max} | Diameter: ${moon.diameter}`);
    
    // Buildings on this moon
    const buildings = await c.query(`
      SELECT pb.id, bt.code, bt.name, pb.level, bt.fields_per_level, bt.provides_fields
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = $1
      ORDER BY bt.code
    `, [moon.id]);
    
    console.log('  Buildings:');
    let totalFieldsUsed = 0;
    let lunarBaseLevel = 0;
    let lunarBaseProvidesFields = 0;
    for (const b of buildings.rows) {
      const fieldsUsedByThis = b.level * (b.fields_per_level || 1);
      totalFieldsUsed += fieldsUsedByThis;
      if (b.code === 'lunar_base') {
        lunarBaseLevel = b.level;
        lunarBaseProvidesFields = b.provides_fields;
      }
      console.log(`    ${b.code} (${b.name}): level ${b.level} | uses ${fieldsUsedByThis} fields | provides_fields=${b.provides_fields}`);
    }
    console.log(`  Total fields used by buildings: ${totalFieldsUsed}`);
    console.log(`  Lunar base level: ${lunarBaseLevel}, provides_fields per level: ${lunarBaseProvidesFields}`);
    
    // What fields_max SHOULD be
    const baseMoonFields = Math.floor(moon.diameter / 1000); // typical formula
    const expectedExtra = lunarBaseLevel * (lunarBaseProvidesFields || 3);
    console.log(`  Base moon fields (diameter/1000): ${baseMoonFields}`);
    console.log(`  Expected extra from lunar base: ${expectedExtra}`);
    console.log(`  Expected fields_max: ${baseMoonFields + expectedExtra}`);
    console.log(`  ACTUAL fields_max: ${moon.fields_max}`);
    if (moon.fields_max < baseMoonFields + expectedExtra) {
      console.log(`  ⚠️  BUG CONFIRMED: fields_max should be ${baseMoonFields + expectedExtra} but is ${moon.fields_max}`);
    }

    // Resources
    const res = await c.query(`SELECT metal, crystal, deuterium FROM planet_resources WHERE planet_id = $1`, [moon.id]);
    if (res.rows.length > 0) {
      console.log(`  Resources: M=${Math.floor(res.rows[0].metal)} C=${Math.floor(res.rows[0].crystal)} D=${Math.floor(res.rows[0].deuterium)}`);
    }

    // Build queue history
    const queue = await c.query(`
      SELECT bq.*, bt.code, bt.name 
      FROM build_queue bq
      JOIN building_types bt ON bt.id = bq.building_type_id
      WHERE bq.planet_id = $1
      ORDER BY bq.created_at DESC
      LIMIT 15
    `, [moon.id]);
    if (queue.rows.length > 0) {
      console.log('  Build queue (recent):');
      for (const q of queue.rows) {
        console.log(`    ${q.code} -> lv${q.target_level} | status=${q.status} | created=${q.created_at} | completes=${q.completes_at}`);
      }
    }
  }

  // Lunar base building type
  console.log('\n=== LUNAR_BASE BUILDING TYPE ===');
  const lb = await c.query(`SELECT * FROM building_types WHERE code = 'lunar_base'`);
  if (lb.rows.length > 0) {
    const b = lb.rows[0];
    console.log(`  ID: ${b.id} | provides_fields: ${b.provides_fields} | fields_per_level: ${b.fields_per_level} | moon_only: ${b.moon_only}`);
  }

  // Functions mentioning lunar_base
  console.log('\n=== FUNCTIONS MENTIONING lunar_base ===');
  const fns = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%lunar_base%'");
  console.log(fns.rows.map(r => r.proname).join(', '));

  // Check complete_building / process_build_queue for lunar_base
  console.log('\n=== COMPLETE_BUILDING / PROCESS_BUILD_QUEUE ===');
  for (const fname of ['complete_building', 'process_build_queue', 'finish_building', 'complete_construction']) {
    const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname=$1 LIMIT 1`, [fname]);
    if (fn.rows.length > 0) {
      console.log(`\nFound function: ${fname}`);
      const src = fn.rows[0].prosrc;
      const lines = src.split('\n');
      const printed = new Set();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('lunar_base') || 
            lines[i].toLowerCase().includes('fields_max') ||
            lines[i].toLowerCase().includes('provides_fields') ||
            lines[i].toLowerCase().includes('fields_used')) {
          const start = Math.max(0, i - 3);
          const end = Math.min(lines.length - 1, i + 3);
          for (let j = start; j <= end; j++) {
            const key = `${j}: ${lines[j]}`;
            if (!printed.has(j)) {
              printed.add(j);
              console.log(key);
            }
          }
          console.log('---');
        }
      }
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
