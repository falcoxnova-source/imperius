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
  
  // Check the LIVE function definition for optimized_global_queue_processor
  const res = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'optimized_global_queue_processor'
  `);
  
  if (res.rows.length === 0) {
    console.log('Function not found!');
  } else {
    const src = res.rows[0].prosrc;
    const lines = src.split('\n');
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      if (line.includes('lunar') || line.includes('moon') || line.includes('fields_max') || line.includes('diameter')) {
        const start = Math.max(0, i - 3);
        const end = Math.min(lines.length, i + 4);
        console.log(`\n--- Line ${i+1} context ---`);
        for (let j = start; j < end; j++) {
          console.log(`${j+1}: ${lines[j]}`);
        }
        found = true;
      }
    }
    if (!found) {
      console.log('No lunar/moon/fields_max/diameter references found in function!');
      console.log('\nFull function (first 200 lines):');
      lines.slice(0, 200).forEach((l, i) => console.log(`${i+1}: ${l}`));
    }
  }
  
  // Check moons with wrong fields_max and see if they match diameter formula
  const moons2 = await client.query(`
    SELECT p.id, p.name, p.fields_max, p.fields_used, p.diameter,
      p.galaxy, p.solar_system, p.position, p.created_at,
      COALESCE(pb.level, 0) as lunar_base_level,
      pr.username as owner,
      FLOOR(p.diameter / 1000.0) as diameter_based_fields
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id 
      AND pb.building_type_id = 15
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type = 'moon'
    AND p.fields_max != 1 + COALESCE(pb.level, 0) * 3
    ORDER BY p.created_at DESC
    LIMIT 30
  `);
  
  console.log('\n\n=== Moons with WRONG fields_max (checking diameter correlation) ===');
  for (const m of moons2.rows) {
    const expected = 1 + m.lunar_base_level * 3;
    const diameterBased = Number(m.diameter_based_fields) + m.lunar_base_level * 3;
    console.log(
      `${(m.owner||'?').padEnd(22)} [${m.galaxy}:${m.solar_system}:${m.position}] | ` +
      `diam=${m.diameter} | max=${m.fields_max} | expected=${expected} | ` +
      `diam_formula=${diameterBased} | LB=${m.lunar_base_level} | ` +
      `match_diam? ${m.fields_max == diameterBased ? 'YES' : 'no'}`
    );
  }
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
