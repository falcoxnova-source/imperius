const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Check is_main_planet for bots
  const r = await c.query(`
    SELECT pr.username, p.name, p.galaxy, p.solar_system, p.position, p.is_main_planet
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE pr.is_bot = true
    ORDER BY pr.username, p.is_main_planet DESC
  `);

  const byUser = {};
  for (const row of r.rows) {
    if (!byUser[row.username]) byUser[row.username] = [];
    byUser[row.username].push({ name: row.name, pos: `${row.galaxy}:${row.solar_system}:${row.position}`, is_main: row.is_main_planet });
  }

  let noMain = 0;
  for (const [user, planets] of Object.entries(byUser)) {
    const hasMain = planets.some(p => p.is_main === true);
    if (!hasMain) {
      noMain++;
      console.log(`❌ ${user}: NINGÚN planeta con is_main_planet=true`);
      planets.forEach(p => console.log(`     ${p.pos} ${p.name} is_main=${p.is_main}`));
    }
  }

  if (noMain === 0) {
    console.log('✅ Todos los bots tienen un planeta principal marcado');
  } else {
    console.log(`\n⚠️ ${noMain} bots sin planeta principal. Arreglando...`);
    const fix = await c.query(`
      UPDATE planets p SET is_main_planet = true
      FROM profiles pr
      WHERE p.user_id = pr.id AND pr.is_bot = true
        AND p.name = 'Planeta Principal'
        AND p.is_main_planet IS NOT TRUE
      RETURNING pr.username, p.galaxy, p.solar_system, p.position
    `);
    console.log(`✅ Arreglados ${fix.rowCount} planetas:`);
    fix.rows.forEach(r => console.log(`   ${r.username} [${r.galaxy}:${r.solar_system}:${r.position}]`));
  }

  await c.end();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
