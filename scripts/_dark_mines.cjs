const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();

  // 1. Get user id
  const { rows: [user] } = await c.query(`SELECT id FROM profiles WHERE email = 'dark@gmail.com'`);
  if (!user) { console.log('User not found'); await c.end(); return; }
  console.log('User:', user.id);

  // 2. Get all planets
  const { rows: planets } = await c.query(`SELECT p.id, p.name, p.galaxy, p.solar_system, p.position, p.planet_type FROM planets p WHERE p.user_id = $1 AND NOT p.is_destroyed ORDER BY p.planet_type DESC, p.id`, [user.id]);
  console.log(`Found ${planets.length} planets`);

  // 3. Get building type ids
  const codes = ['metal_mine', 'crystal_mine', 'deuterium_synthesizer', 'solar_plant'];
  const { rows: btypes } = await c.query(`SELECT id, code FROM building_types WHERE code = ANY($1)`, [codes]);
  const bt = {};
  btypes.forEach(b => bt[b.code] = b.id);
  console.log('Building types:', bt);

  // 4. For each planet, upsert mines to 25 and solar to enough
  // Solar plant energy formula: 20 * level * 1.1^level (base production)
  // Metal mine consumption: 10 * level * 1.1^level
  // Crystal mine consumption: 10 * level * 1.1^level  
  // Deut synth consumption: 20 * level * 1.1^level
  // At level 25: metal consumes 10*25*1.1^25 = 2,500 * 10.835 = ~2709
  // Crystal 25: same ~2709
  // Deut 25: 20*25*1.1^25 = ~5418
  // Total consumption ~10,836
  // Solar at level 25: 20*25*1.1^25 = ~5418 → not enough
  // Solar at level 30: 20*30*1.1^30 = 600*17.449 = ~10,470 → still tight
  // Solar at level 31: 20*31*1.1^31 = 620*19.194 = ~11,900 → enough
  // Let's set solar to 31 to be safe

  const TARGET_MINE = 25;
  const TARGET_SOLAR = 31;

  for (const planet of planets) {
    console.log(`\nProcessing: ${planet.name} [${planet.galaxy}:${planet.solar_system}:${planet.position}] (${planet.planet_type})`);
    
    for (const [code, targetLevel] of [['metal_mine', TARGET_MINE], ['crystal_mine', TARGET_MINE], ['deuterium_synthesizer', TARGET_MINE], ['solar_plant', TARGET_SOLAR]]) {
      const bid = bt[code];
      const { rows } = await c.query(`SELECT level FROM planet_buildings WHERE planet_id = $1 AND building_type_id = $2`, [planet.id, bid]);
      const currentLevel = rows.length ? rows[0].level : 0;
      
      if (currentLevel < targetLevel) {
        if (rows.length) {
          await c.query(`UPDATE planet_buildings SET level = $1 WHERE planet_id = $2 AND building_type_id = $3`, [targetLevel, planet.id, bid]);
        } else {
          await c.query(`INSERT INTO planet_buildings (planet_id, building_type_id, level) VALUES ($1, $2, $3)`, [planet.id, bid, targetLevel]);
        }
        console.log(`  ${code}: ${currentLevel} → ${targetLevel}`);
      } else {
        console.log(`  ${code}: already at ${currentLevel} (>= ${targetLevel})`);
      }
    }
  }

  // 5. Verify
  const { rows: verify } = await c.query(`
    SELECT p.name, p.galaxy, p.solar_system, p.position,
      (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=$2) as metal,
      (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=$3) as crystal,
      (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=$4) as deut,
      (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=$5) as solar
    FROM planets p WHERE p.user_id=$1 AND NOT p.is_destroyed ORDER BY p.id
  `, [user.id, bt.metal_mine, bt.crystal_mine, bt.deuterium_synthesizer, bt.solar_plant]);
  console.log('\n=== RESULTADO FINAL ===');
  console.table(verify);

  await c.end();
  console.log('Done!');
})();
