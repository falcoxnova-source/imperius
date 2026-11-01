const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows: [u] } = await c.query(`SELECT id FROM profiles WHERE email = 'dark@gmail.com'`);
  if (!u) { console.log('User not found'); await c.end(); return; }

  // Get principal planet (first created)
  const { rows: [principal] } = await c.query(`SELECT id, name FROM planets WHERE user_id = $1 AND planet_type = 'planet' AND NOT is_destroyed ORDER BY id LIMIT 1`, [u.id]);
  console.log('Principal:', principal.name, principal.id);

  // Get colonies (all except principal)
  const { rows: colonies } = await c.query(`SELECT id, name, galaxy, solar_system, position FROM planets WHERE user_id = $1 AND NOT is_destroyed AND id <> $2 ORDER BY id`, [u.id, principal.id]);
  console.log('Colonias:', colonies.length);

  const codes = ['metal_mine', 'crystal_mine', 'deuterium_synthesizer', 'solar_plant'];
  const { rows: bt } = await c.query(`SELECT id, code FROM building_types WHERE code = ANY($1)`, [codes]);
  const m = {};
  bt.forEach(b => m[b.code] = b.id);

  // Solar plant at level 25: 20*25*1.1^25 = ~5418
  // Metal 21 consumption: 10*21*1.1^21 = 210*8.062 = ~1693
  // Crystal 21: same ~1693
  // Deut 18: 20*18*1.1^18 = 360*5.56 = ~2002
  // Total: ~5388 → solar 25 just barely covers it. Use 26 to be safe.
  const TARGET_SOLAR = 26;

  for (const col of colonies) {
    for (const [code, lvl] of [['metal_mine', 21], ['crystal_mine', 21], ['deuterium_synthesizer', 18], ['solar_plant', TARGET_SOLAR]]) {
      const bid = m[code];
      const { rows } = await c.query(`SELECT level FROM planet_buildings WHERE planet_id = $1 AND building_type_id = $2`, [col.id, bid]);
      const cur = rows.length ? rows[0].level : 0;
      if (cur !== lvl) {
        if (rows.length) {
          await c.query(`UPDATE planet_buildings SET level = $1 WHERE planet_id = $2 AND building_type_id = $3`, [lvl, col.id, bid]);
        } else {
          await c.query(`INSERT INTO planet_buildings (planet_id, building_type_id, level) VALUES ($1, $2, $3)`, [col.id, bid, lvl]);
        }
        console.log(`  ${col.name}: ${code} ${cur} → ${lvl}`);
      }
    }
  }

  // Verify all
  const { rows: v } = await c.query(`
    SELECT p.name,
      (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=$2) as metal,
      (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=$3) as crystal,
      (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=$4) as deut,
      (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=$5) as solar
    FROM planets p WHERE p.user_id=$1 AND NOT p.is_destroyed ORDER BY p.id
  `, [u.id, m.metal_mine, m.crystal_mine, m.deuterium_synthesizer, m.solar_plant]);
  console.log('\n=== RESULTADO FINAL ===');
  console.table(v);
  await c.end();
})();
