const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Specifically MarinaAR72
  const r = await c.query(`
    SELECT p.id, p.name, p.galaxy, p.solar_system, p.position, p.is_main_planet, p.planet_type
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE pr.username = 'MarinaAR72'
    ORDER BY p.is_main_planet DESC, p.created_at
  `);
  console.log('MarinaAR72 planetas:');
  console.table(r.rows.map(x => ({
    name: x.name, pos: `${x.galaxy}:${x.solar_system}:${x.position}`,
    is_main: x.is_main_planet, type: x.planet_type
  })));

  // Now check: does the Supabase client query return it?
  // Simulate the exact query the frontend does
  const r2 = await c.query(`
    SELECT * FROM planets 
    WHERE user_id = (SELECT id FROM profiles WHERE username = 'MarinaAR72')
    AND is_main_planet = true
  `);
  console.log('\nQuery is_main_planet=true result:', r2.rows.length, 'rows');
  if (r2.rows.length > 0) {
    console.log('  Planet:', r2.rows[0].name, `[${r2.rows[0].galaxy}:${r2.rows[0].solar_system}:${r2.rows[0].position}]`);
  }

  // Check if is_main_planet column might be NULL vs false
  const r3 = await c.query(`
    SELECT p.name, p.is_main_planet, pg_typeof(p.is_main_planet) as type
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE pr.username = 'MarinaAR72'
  `);
  console.log('\nis_main_planet values:');
  console.table(r3.rows.map(x => ({ name: x.name, is_main_planet: x.is_main_planet, type: x.type })));

  await c.end();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
