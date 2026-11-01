const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Moon Caliope
  const moonId = 'e7a50e82-19ff-45f6-b82d-6567260fde00';
  console.log('=== CALIOPE MOON ===');
  const moon = await c.query('SELECT * FROM planets WHERE id=$1', [moonId]);
  console.log(`  fields_used=${moon.rows[0].fields_used}, fields_max=${moon.rows[0].fields_max}, diameter=${moon.rows[0].diameter}`);

  // Buildings
  const blds = await c.query(`
    SELECT pb.level, bt.code, bt.name
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = $1 AND pb.level > 0
    ORDER BY bt.code
  `, [moonId]);
  console.log('  Buildings:');
  let totalFieldsUsed = 0;
  let lunarLevel = 0;
  for (const b of blds.rows) {
    totalFieldsUsed += b.level;
    if (b.code === 'lunar_base') lunarLevel = b.level;
    console.log(`    ${b.code}: level ${b.level}`);
  }
  console.log(`  Sum of all building levels (fields_used calc): ${totalFieldsUsed}`);
  console.log(`  Lunar base level: ${lunarLevel}`);

  // Moon Pandora
  const moonId2 = '6dcc84b5-9891-493f-aaff-6daf7728045c';
  console.log('\n=== PANDORA MOON ===');
  const moon2 = await c.query('SELECT * FROM planets WHERE id=$1', [moonId2]);
  console.log(`  fields_used=${moon2.rows[0].fields_used}, fields_max=${moon2.rows[0].fields_max}, diameter=${moon2.rows[0].diameter}`);

  const blds2 = await c.query(`
    SELECT pb.level, bt.code, bt.name
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = $1 AND pb.level > 0
    ORDER BY bt.code
  `, [moonId2]);
  console.log('  Buildings:');
  let totalFieldsUsed2 = 0;
  let lunarLevel2 = 0;
  for (const b of blds2.rows) {
    totalFieldsUsed2 += b.level;
    if (b.code === 'lunar_base') lunarLevel2 = b.level;
    console.log(`    ${b.code}: level ${b.level}`);
  }
  console.log(`  Sum of all building levels: ${totalFieldsUsed2}`);
  console.log(`  Lunar base level: ${lunarLevel2}`);

  // Build queue for Caliope
  const queue = await c.query(`
    SELECT bq.target_level, bq.status, bq.created_at, bq.completes_at, bt.code
    FROM build_queue bq
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE bq.planet_id = $1
    ORDER BY bq.created_at DESC
    LIMIT 15
  `, [moonId]);
  console.log('\n=== CALIOPE BUILD QUEUE ===');
  for (const q of queue.rows) {
    console.log(`  ${q.code} -> lv${q.target_level} | status=${q.status} | ${q.created_at} -> ${q.completes_at}`);
  }

  // Functions with lunar_base
  const fns = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%lunar_base%'");
  console.log('\nFunctions with lunar_base:', fns.rows.map(r => r.proname).join(', '));

  // Check complete_building for fields_max logic
  for (const fname of ['complete_building', 'process_build_queue', 'start_building']) {
    const fn = await c.query('SELECT prosrc FROM pg_proc WHERE proname=$1 LIMIT 1', [fname]);
    if (fn.rows.length > 0) {
      console.log(`\n=== ${fname} (fields_max/lunar_base portions) ===`);
      const lines = fn.rows[0].prosrc.split('\n');
      const printed = new Set();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('lunar_base') || 
            lines[i].toLowerCase().includes('fields_max') ||
            lines[i].toLowerCase().includes('fields_used') ||
            lines[i].toLowerCase().includes('terraformer')) {
          const start = Math.max(0, i - 3);
          const end = Math.min(lines.length - 1, i + 3);
          for (let j = start; j <= end; j++) {
            if (!printed.has(j)) {
              printed.add(j);
              console.log(`  ${j}: ${lines[j]}`);
            }
          }
          console.log('  ---');
        }
      }
    }
  }

  // Check all moons across ALL users to see if any have lunar_base > 0 with correct fields_max
  console.log('\n=== ALL MOONS WITH LUNAR BASE (check fields_max) ===');
  const allMoons = await c.query(`
    SELECT p.id, p.name, p.fields_max, p.fields_used, p.diameter, p.user_id,
           pb.level as lunar_level,
           pr.username
    FROM planets p
    JOIN planet_buildings pb ON pb.planet_id = p.id
    JOIN building_types bt ON bt.id = pb.building_type_id AND bt.code = 'lunar_base'
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type = 'moon' AND pb.level > 0
    ORDER BY pb.level DESC
    LIMIT 20
  `);
  for (const m of allMoons.rows) {
    const baseMoonFields = Math.floor(m.diameter / 1000);
    const expectedMax = baseMoonFields + (m.lunar_level * 3); // 3 fields per level in OGame
    console.log(`  "${m.name}" (${m.username}) | lunar_base lv${m.lunar_level} | diameter=${m.diameter} | base_fields=${baseMoonFields} | fields_max=${m.fields_max} | expected=${expectedMax} | ${m.fields_max >= expectedMax ? 'OK' : 'BUG!'}`);
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
