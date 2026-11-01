const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const u = await c.query(`SELECT id, username, email FROM profiles WHERE email='samaileal01@gmail.com'`);
  console.log('User:', u.rows);
  if (!u.rows.length) { await c.end(); return; }
  const uid = u.rows[0].id;

  const planets = await c.query(`SELECT id, name, is_moon, galaxy, system, position, planet_type FROM planets WHERE user_id=$1 ORDER BY is_moon, galaxy, system, position`, [uid]);
  console.log('\nPlanetas/Lunas:');
  planets.rows.forEach(p=>console.log(`  ${p.is_moon?'🌙 LUNA':'🪐'} ${p.name} [${p.galaxy}:${p.system}:${p.position}] type=${p.planet_type} id=${p.id}`));

  // Inspeccionar columnas planet_buildings para ver el nombre real de phalanx y base lunar
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='planet_buildings' ORDER BY ordinal_position`);
  console.log('\nplanet_buildings cols:');
  console.log(cols.rows.map(r=>r.column_name).join(', '));

  // Buildings de la(s) luna(s)
  const moons = planets.rows.filter(p=>p.is_moon);
  for (const m of moons) {
    const b = await c.query(`SELECT * FROM planet_buildings WHERE planet_id=$1`, [m.id]);
    console.log(`\nEdificios actuales en luna ${m.name}:`, b.rows[0] || 'sin registro');
  }

  await c.end();
})();
