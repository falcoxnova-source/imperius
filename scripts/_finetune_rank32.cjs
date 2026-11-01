const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
(async () => {
  await c.connect();
  const dsId = (await c.query(`SELECT id FROM ship_types WHERE code='deathstar'`)).rows[0].id;

  // Quitar deathstars de TODAS las colonias (dejar solo en principal)
  await c.query(`
    UPDATE planet_ships SET quantity=0
    WHERE ship_type_id=$2 AND planet_id IN (
      SELECT id FROM planets WHERE user_id=$1 AND is_main_planet=false
    )
  `, [USER_ID, dsId]);

  await c.query(`SELECT update_player_points($1)`, [USER_ID]);
  let pts = (await c.query(`SELECT points_total FROM profiles WHERE id=$1`, [USER_ID])).rows[0].points_total;
  let rank = parseInt((await c.query(`SELECT rank FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank FROM profiles WHERE is_admin=false AND is_hidden=false) x WHERE id=$1`, [USER_ID])).rows[0].rank, 10);
  console.log(`Sin estrellas en colonias: ${pts} pts → rank ${rank}`);

  // Si todavia rank < 32, bajar 1 nivel deut en colonias
  const deutId = (await c.query(`SELECT id FROM building_types WHERE code='deuterium_synthesizer'`)).rows[0].id;
  if (rank < 32) {
    for (let target = 22; target >= 18; target--) {
      await c.query(`
        UPDATE planet_buildings SET level=$3
        WHERE building_type_id=$2 AND planet_id IN (
          SELECT id FROM planets WHERE user_id=$1 AND is_main_planet=false
        ) AND level > $3
      `, [USER_ID, deutId, target]);
      await c.query(`SELECT update_player_points($1)`, [USER_ID]);
      pts = (await c.query(`SELECT points_total FROM profiles WHERE id=$1`, [USER_ID])).rows[0].points_total;
      rank = parseInt((await c.query(`SELECT rank FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank FROM profiles WHERE is_admin=false AND is_hidden=false) x WHERE id=$1`, [USER_ID])).rows[0].rank, 10);
      console.log(`Colonias deut=${target} → ${pts} pts → rank ${rank}`);
      if (rank >= 31 && rank <= 32) break;
    }
  }

  console.log('\n--- FINAL ---');
  const prof = await c.query(`SELECT username, points_total, points_buildings, points_research, points_fleet, battles_won, battles_lost FROM profiles WHERE id=$1`, [USER_ID]);
  console.log(prof.rows[0]);

  const top = await c.query(`
    SELECT username, points_total, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
    FROM profiles WHERE is_admin=false AND is_hidden=false ORDER BY points_total DESC LIMIT 35
  `);
  console.log('\nTOP 29-34:');
  top.rows.filter(r => r.rank>=29 && r.rank<=34).forEach(r => {
    const m = r.username==='Wolf King' ? '  <-- WOLF KING' : '';
    console.log(`  ${r.rank}. ${r.username} → ${r.points_total}${m}`);
  });

  console.log('\n--- Minas + estrellas ---');
  const planets = (await c.query(`SELECT id, name, is_main_planet FROM planets WHERE user_id=$1 ORDER BY is_main_planet DESC, name`, [USER_ID])).rows;
  for (const pl of planets) {
    const blds = await c.query(`
      SELECT bt.code, pb.level FROM planet_buildings pb
      JOIN building_types bt ON bt.id=pb.building_type_id
      WHERE pb.planet_id=$1 AND bt.code IN ('metal_mine','crystal_mine','deuterium_synthesizer')
      ORDER BY bt.code
    `, [pl.id]);
    const ds = (await c.query(`SELECT ps.quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id WHERE ps.planet_id=$1 AND st.code='deathstar'`, [pl.id])).rows[0]?.quantity ?? 0;
    console.log(`  ${pl.name}: ${blds.rows.map(x => `${x.code.replace('_mine','').replace('deuterium_synthesizer','deut')}=${x.level}`).join(', ')}, deathstars=${ds}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
