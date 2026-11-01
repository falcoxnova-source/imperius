const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
(async () => {
  await c.connect();

  // Find energy calc function
  const fns = await c.query(`SELECT proname FROM pg_proc WHERE proname ILIKE '%energy%' OR proname ILIKE '%production%' ORDER BY proname`);
  console.log('energy fns:', fns.rows.map(x => x.proname));

  // Building base for solar (energy production)
  const bt = await c.query(`SELECT * FROM building_types WHERE code IN ('solar_plant','fusion_reactor','metal_mine','crystal_mine','deuterium_synthesizer')`);
  console.log('\nbuilding_types cols:');
  console.log(Object.keys(bt.rows[0]).join(', '));
  console.table(bt.rows);

  // ship_types for solar_satellite
  const ss = await c.query(`SELECT * FROM ship_types WHERE code='solar_satellite'`);
  console.log('\nsolar_satellite:');
  console.table(ss.rows);
  console.log('cols:', Object.keys(ss.rows[0]).join(', '));

  // Planets
  const pls = await c.query(`SELECT id, name, is_main_planet, temp_max FROM planets WHERE user_id=$1 ORDER BY is_main_planet DESC, name`, [USER_ID]);
  console.table(pls.rows);

  // Buildings per planet
  for (const pl of pls.rows) {
    const blds = await c.query(`
      SELECT bt.code, pb.level FROM planet_buildings pb
      JOIN building_types bt ON bt.id=pb.building_type_id
      WHERE pb.planet_id=$1 AND bt.code IN ('metal_mine','crystal_mine','deuterium_synthesizer','solar_plant','fusion_reactor')
      ORDER BY bt.code
    `, [pl.id]);
    const ships = await c.query(`
      SELECT st.code, ps.quantity FROM planet_ships ps
      JOIN ship_types st ON st.id=ps.ship_type_id
      WHERE ps.planet_id=$1 AND st.code IN ('solar_satellite','deathstar')
    `, [pl.id]);
    console.log(`\n=== ${pl.name} (main=${pl.is_main_planet}, tempMax=${pl.temp_max}) ===`);
    console.table(blds.rows);
    console.table(ships.rows);
  }

  // profile battle cols
  const bc = await c.query(`SELECT username, battles_won, battles_lost, battles_draw FROM profiles WHERE id=$1`, [USER_ID]);
  console.log('\n--- battles ---', bc.rows[0]);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
