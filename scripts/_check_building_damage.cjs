const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'process_fleet_arrival'`);
  const src = r.rows[0].def;
  console.log('--- process_fleet_arrival checks ---');
  console.log('Has building_damage logic:', src.includes('building_damage') || src.includes('damaged_buildings') || src.includes('Dano a infraestructura') || src.includes('Daño a infraestructura'));
  console.log('Has level reduction (UPDATE planet_buildings SET level):', /UPDATE\s+planet_buildings\s+SET\s+level\s*=\s*level\s*-\s*1/i.test(src));
  console.log('Has random() < probability for buildings:', src.includes('robotics_factory') && src.includes('random()'));

  // Look for damage messages
  const matches = src.match(/(building.*damage|damaged.*building|infraestructura|nivel.*->|nivel \d|level \d)/gi);
  console.log('Damage-related matches found:', matches ? matches.length : 0);
  if (matches) console.log('Sample:', matches.slice(0, 5));

  // Check perform_combat too
  const r2 = await c.query(`SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname IN ('perform_combat', 'perform_acs_combat')`);
  for (const row of r2.rows) {
    console.log(`\n--- ${row.proname} ---`);
    console.log('Has building_damage logic:', row.def.includes('planet_buildings') && row.def.includes('SET level'));
  }

  // List recent message types in messages table
  const r3 = await c.query(`SELECT DISTINCT message_type FROM messages WHERE created_at > now() - interval '7 days' ORDER BY message_type`);
  console.log('\n--- Recent message types in last 7 days ---');
  console.log(r3.rows.map(x => x.message_type));

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
