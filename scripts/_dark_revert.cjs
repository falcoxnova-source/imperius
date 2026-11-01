const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows: [u] } = await c.query(`SELECT id FROM profiles WHERE email = 'dark@gmail.com'`);
  const codes = ['metal_mine', 'crystal_mine', 'deuterium_synthesizer', 'solar_plant'];
  const { rows: bt } = await c.query(`SELECT id, code FROM building_types WHERE code = ANY($1)`, [codes]);
  const m = {};
  bt.forEach(b => m[b.code] = b.id);

  // Original levels when at ranking 173
  const original = {
    'Proxima B':         { metal_mine: 19, crystal_mine: 20, deuterium_synthesizer: 16, solar_plant: 24 },
    'Kepler-442':        { metal_mine: 21, crystal_mine: 19, deuterium_synthesizer: 16, solar_plant: 24 },
    'Nueva Terra':       { metal_mine: 19, crystal_mine: 20, deuterium_synthesizer: 15, solar_plant: 24 },
    'Planeta Principal': { metal_mine: 20, crystal_mine: 20, deuterium_synthesizer: 15, solar_plant: 22 },
    'Andromeda Prime':   { metal_mine: 24, crystal_mine: 22, deuterium_synthesizer: 17, solar_plant: 22 },
  };

  const { rows: planets } = await c.query(`SELECT id, name FROM planets WHERE user_id = $1 AND NOT is_destroyed ORDER BY id`, [u.id]);

  for (const p of planets) {
    const orig = original[p.name];
    if (!orig) { console.log(`Skipping ${p.name} (no original data)`); continue; }
    for (const [code, lvl] of Object.entries(orig)) {
      await c.query(`UPDATE planet_buildings SET level = $1 WHERE planet_id = $2 AND building_type_id = $3`, [lvl, p.id, m[code]]);
    }
    console.log(`${p.name}: metal=${orig.metal_mine} crystal=${orig.crystal_mine} deut=${orig.deuterium_synthesizer} solar=${orig.solar_plant}`);
  }

  // Verify
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
