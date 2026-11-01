const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Find build queue table
  const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%queue%' OR table_name ILIKE '%construction%') ORDER BY table_name");
  console.log('Queue/construction tables:', tables.rows.map(x => x.table_name).join(', '));

  // Also check for building_queue
  const tables2 = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%build%' ORDER BY table_name");
  console.log('Build tables:', tables2.rows.map(x => x.table_name).join(', '));

  // Functions with lunar_base
  const fns = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%lunar_base%'");
  console.log('\nFunctions with lunar_base:', fns.rows.map(r => r.proname).join(', '));

  // Get FULL complete_building function
  const fn = await c.query("SELECT prosrc FROM pg_proc WHERE proname='complete_building' LIMIT 1");
  if (fn.rows.length > 0) {
    console.log('\n=== FULL complete_building FUNCTION ===');
    console.log(fn.rows[0].prosrc);
  } else {
    console.log('complete_building NOT FOUND');
    // Try alternatives
    for (const name of ['finish_building', 'process_building', 'building_complete']) {
      const f = await c.query('SELECT proname FROM pg_proc WHERE proname=$1', [name]);
      if (f.rows.length > 0) console.log('Found:', name);
    }
  }

  // All moons with lunar base > 0
  console.log('\n=== ALL MOONS WITH LUNAR BASE ===');
  const allMoons = await c.query(`
    SELECT p.id, p.name, p.fields_max, p.fields_used, p.diameter, 
           pb.level as lunar_level, pr.username
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
    const expected3 = baseMoonFields + (m.lunar_level * 3);
    const expected5 = baseMoonFields + (m.lunar_level * 5);
    console.log(`  "${m.name}" (${m.username}) | lunar lv${m.lunar_level} | diam=${m.diameter} | base=${baseMoonFields} | fields_max=${m.fields_max} | expect@3/lv=${expected3} expect@5/lv=${expected5}`);
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
