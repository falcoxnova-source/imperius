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
  
  // 1. Check if building_type_id 15 is actually lunar_base
  const bt = await client.query(`SELECT id, code, name FROM building_types WHERE code = 'lunar_base'`);
  console.log('=== Lunar Base building type ===');
  console.log(bt.rows);
  
  const bt15 = await client.query(`SELECT id, code, name FROM building_types WHERE id = 15`);
  console.log('\n=== Building type ID 15 ===');
  console.log(bt15.rows);
  
  // 2. Check ALL moons and their fields vs lunar_base level
  const moons = await client.query(`
    SELECT p.id, p.name, p.fields_max, p.fields_used, p.planet_type,
      p.galaxy, p.solar_system, p.position,
      COALESCE(pb.level, 0) as lunar_base_level,
      1 + COALESCE(pb.level, 0) * 3 as expected_fields_max,
      pr.username as owner
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id 
      AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type = 'moon'
    ORDER BY p.created_at DESC
    LIMIT 50
  `);
  
  console.log('\n=== All Moons (newest first) ===');
  console.log('Owner'.padEnd(20), 'Name'.padEnd(15), 'Coords'.padEnd(12), 'Fields'.padEnd(8), 'Used'.padEnd(6), 'LB Lvl'.padEnd(8), 'Expected'.padEnd(10), 'OK?');
  console.log('-'.repeat(95));
  
  let wrongCount = 0;
  for (const m of moons.rows) {
    const coords = `[${m.galaxy}:${m.solar_system}:${m.position}]`;
    const ok = m.fields_max == m.expected_fields_max;
    if (!ok) wrongCount++;
    console.log(
      (m.owner || '?').padEnd(20),
      (m.name || '?').padEnd(15),
      coords.padEnd(12),
      String(m.fields_max).padEnd(8),
      String(m.fields_used).padEnd(6),
      String(m.lunar_base_level).padEnd(8),
      String(m.expected_fields_max).padEnd(10),
      ok ? '✅' : '❌ WRONG'
    );
  }
  
  console.log(`\nTotal moons: ${moons.rows.length}, Wrong fields_max: ${wrongCount}`);
  
  // 3. Check the building queue for any pending lunar_base builds
  const queue = await client.query(`
    SELECT bq.*, bt.code, bt.name as building_name, p.name as planet_name, p.planet_type,
      pr.username as owner
    FROM building_queue bq
    JOIN building_types bt ON bt.id = bq.building_type_id
    JOIN planets p ON p.id = bq.planet_id
    LEFT JOIN profiles pr ON pr.id = bq.user_id
    WHERE bt.code = 'lunar_base'
    ORDER BY bq.created_at DESC
    LIMIT 10
  `);
  
  console.log('\n=== Pending/Recent Lunar Base queue items ===');
  if (queue.rows.length === 0) {
    console.log('None found');
  } else {
    queue.rows.forEach(q => console.log(q));
  }
  
  // 4. Check recently created moons (last 7 days)
  const recent = await client.query(`
    SELECT p.id, p.name, p.fields_max, p.fields_used, p.planet_type,
      p.galaxy, p.solar_system, p.position,
      p.created_at,
      COALESCE(pb.level, 0) as lunar_base_level,
      pr.username as owner
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id 
      AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type = 'moon'
    AND p.created_at > NOW() - INTERVAL '7 days'
    ORDER BY p.created_at DESC
  `);
  
  console.log('\n=== Moons created in last 7 days ===');
  recent.rows.forEach(m => {
    const coords = `[${m.galaxy}:${m.solar_system}:${m.position}]`;
    console.log(`  ${m.owner} - ${m.name} ${coords} | fields_max=${m.fields_max} used=${m.fields_used} | LB lvl=${m.lunar_base_level} | created=${m.created_at}`);
  });
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
