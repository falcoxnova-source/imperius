const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // building_types columns
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='building_types' ORDER BY ordinal_position");
  console.log('building_types columns:', cols.rows.map(x => x.column_name).join(', '));

  // lunar_base row
  const lb = await c.query("SELECT * FROM building_types WHERE code='lunar_base'");
  console.log('\nlunar_base row:', JSON.stringify(lb.rows[0], null, 2));

  // Moon Caliope buildings
  const moonId = 'e7a50e82-19ff-45f6-b82d-6567260fde00';
  const blds = await c.query(`
    SELECT pb.level, bt.code, bt.name, bt.provides_fields
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = $1
    ORDER BY bt.code
  `, [moonId]);
  console.log('\nCaliope buildings:');
  for (const b of blds.rows) {
    console.log(`  ${b.code} (${b.name}): level ${b.level} | provides_fields=${b.provides_fields}`);
  }

  // Moon Pandora buildings
  const moonId2 = '6dcc84b5-9891-493f-aaff-6daf7728045c';
  const blds2 = await c.query(`
    SELECT pb.level, bt.code, bt.name, bt.provides_fields
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = $1
    ORDER BY bt.code
  `, [moonId2]);
  console.log('\nPandora buildings:');
  for (const b of blds2.rows) {
    console.log(`  ${b.code} (${b.name}): level ${b.level} | provides_fields=${b.provides_fields}`);
  }

  // Build queue for Caliope
  const queue = await c.query(`
    SELECT bq.target_level, bq.status, bq.created_at, bq.completes_at, bt.code
    FROM build_queue bq
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE bq.planet_id = $1
    ORDER BY bq.created_at DESC
    LIMIT 15
  `, [moonId]);
  console.log('\nCaliope build queue:');
  for (const q of queue.rows) {
    console.log(`  ${q.code} -> lv${q.target_level} | status=${q.status} | ${q.created_at} -> ${q.completes_at}`);
  }

  // Functions handling lunar_base
  const fns = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%lunar_base%'");
  console.log('\nFunctions with lunar_base:', fns.rows.map(r => r.proname).join(', '));

  // Check complete_building for fields_max logic
  for (const fname of ['complete_building', 'process_build_queue', 'start_building']) {
    const fn = await c.query('SELECT prosrc FROM pg_proc WHERE proname=$1 LIMIT 1', [fname]);
    if (fn.rows.length > 0) {
      console.log(`\n=== ${fname} (lunar_base/fields_max portions) ===`);
      const lines = fn.rows[0].prosrc.split('\n');
      const printed = new Set();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('lunar_base') || 
            lines[i].toLowerCase().includes('fields_max') ||
            lines[i].toLowerCase().includes('provides_fields') ||
            lines[i].toLowerCase().includes('fields_used') ||
            lines[i].toLowerCase().includes('terraformer')) {
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length - 1, i + 2);
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

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
