// Principal metal=30, sube minas de colonias hasta caer en rank 32
const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';

(async () => {
  await c.connect();

  const planets = (await c.query(`SELECT id, name, is_main_planet FROM planets WHERE user_id=$1 ORDER BY is_main_planet DESC, name`, [USER_ID])).rows;
  const main = planets.find(p => p.is_main_planet);
  const colonies = planets.filter(p => !p.is_main_planet);

  const metalId = (await c.query(`SELECT id FROM building_types WHERE code='metal_mine'`)).rows[0].id;
  const crystalId = (await c.query(`SELECT id FROM building_types WHERE code='crystal_mine'`)).rows[0].id;
  const deutId = (await c.query(`SELECT id FROM building_types WHERE code='deuterium_synthesizer'`)).rows[0].id;

  // 1) Principal metal → 30
  await c.query(`UPDATE planet_buildings SET level=30 WHERE planet_id=$1 AND building_type_id=$2`, [main.id, metalId]);
  console.log('✓ Principal metal_mine = 30');

  await c.query(`SELECT update_player_points($1)`, [USER_ID]);
  let pts = (await c.query(`SELECT points_total FROM profiles WHERE id=$1`, [USER_ID])).rows[0].points_total;
  let rank = parseInt((await c.query(`SELECT rank FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank FROM profiles WHERE is_admin=false AND is_hidden=false) x WHERE id=$1`, [USER_ID])).rows[0].rank, 10);
  console.log(`Tras bajar principal: ${pts} pts → rank ${rank}`);

  // 2) Subir minas colonias UNIFORMEMENTE: metal y cristal y deut suben a target.
  // Probamos targets crecientes hasta que rank caiga a [31,32].
  // Parto de niveles actuales y subo todos juntos.
  for (let metalT = 22; metalT <= 35; metalT++) {
    const crystalT = metalT - 4;  // mantener proporción tipica
    const deutT = metalT - 6;

    for (const col of colonies) {
      await c.query(`
        UPDATE planet_buildings SET level = GREATEST(level, $3)
        WHERE planet_id=$1 AND building_type_id=$2
      `, [col.id, metalId, metalT]);
      await c.query(`
        UPDATE planet_buildings SET level = GREATEST(level, $3)
        WHERE planet_id=$1 AND building_type_id=$2
      `, [col.id, crystalId, crystalT]);
      await c.query(`
        UPDATE planet_buildings SET level = GREATEST(level, $3)
        WHERE planet_id=$1 AND building_type_id=$2
      `, [col.id, deutId, deutT]);
    }
    await c.query(`SELECT update_player_points($1)`, [USER_ID]);
    pts = (await c.query(`SELECT points_total FROM profiles WHERE id=$1`, [USER_ID])).rows[0].points_total;
    rank = parseInt((await c.query(`SELECT rank FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank FROM profiles WHERE is_admin=false AND is_hidden=false) x WHERE id=$1`, [USER_ID])).rows[0].rank, 10);
    console.log(`Colonias metal=${metalT} cristal=${crystalT} deut=${deutT} → ${pts} pts → rank ${rank}`);

    if (rank === 32) {
      console.log('✓ RANK 32 alcanzado');
      break;
    }
    if (rank < 32) {
      // pasamos: rank ya pasó por encima. Ya está bien si queda en 31.
      console.log('rank pasó a <32, parando');
      break;
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

  console.log('\n--- Minas por planeta ---');
  for (const pl of planets) {
    const r = await c.query(`
      SELECT bt.code, pb.level FROM planet_buildings pb
      JOIN building_types bt ON bt.id=pb.building_type_id
      WHERE pb.planet_id=$1 AND bt.code IN ('metal_mine','crystal_mine','deuterium_synthesizer')
      ORDER BY bt.code
    `, [pl.id]);
    console.log(`${pl.name}: ${r.rows.map(x => `${x.code}=${x.level}`).join(', ')}`);
  }

  await c.end();
})().catch(e => { console.error('❌', e); process.exit(1); });
