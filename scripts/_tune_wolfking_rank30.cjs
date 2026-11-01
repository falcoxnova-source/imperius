// Iterar deathstars en colonias hasta caer en rank ~30
const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
const TARGET_RANK_MIN = 28;
const TARGET_RANK_MAX = 32;

(async () => {
  await c.connect();
  const dsId = (await c.query(`SELECT id FROM ship_types WHERE code='deathstar'`)).rows[0].id;
  const planets = (await c.query(`SELECT id, name, is_main_planet FROM planets WHERE user_id=$1 ORDER BY is_main_planet DESC`, [USER_ID])).rows;
  const main = planets.find(p => p.is_main_planet);
  const colonies = planets.filter(p => !p.is_main_planet);

  // Mantener 10 deathstars en planeta principal SIEMPRE
  await c.query(`
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction)
    VALUES ($1, $2, 10, 0)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = 10
  `, [main.id, dsId]);

  // Probar: dsPerColony = 0,1,2,3,...
  for (let dsPerColony = 0; dsPerColony <= 10; dsPerColony++) {
    for (const col of colonies) {
      await c.query(`
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = $3
      `, [col.id, dsId, dsPerColony]);
    }
    await c.query(`SELECT update_player_points($1)`, [USER_ID]);
    const r = await c.query(`SELECT points_total FROM profiles WHERE id=$1`, [USER_ID]);
    const rk = await c.query(`
      SELECT rank FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
        FROM profiles WHERE is_admin=false AND is_hidden=false
      ) x WHERE id=$1
    `, [USER_ID]);
    const rank = parseInt(rk.rows[0].rank, 10);
    console.log(`ds_per_colony=${dsPerColony} → total=${r.rows[0].points_total} → rank=${rank}`);
    if (rank >= TARGET_RANK_MIN && rank <= TARGET_RANK_MAX) {
      console.log(`✓ OK en rango [${TARGET_RANK_MIN},${TARGET_RANK_MAX}]`);
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
  console.log('\nTOP 27-34:');
  top.rows.filter(r => r.rank>=27 && r.rank<=34).forEach(r => {
    const m = r.username==='Wolf King' ? '  <-- WOLF KING' : '';
    console.log(`  ${r.rank}. ${r.username} → ${r.points_total}${m}`);
  });

  // Resumen naves
  console.log('\n--- Estrellas por planeta ---');
  for (const pl of planets) {
    const q = (await c.query(`
      SELECT ps.quantity FROM planet_ships ps
      JOIN ship_types st ON st.id=ps.ship_type_id
      WHERE ps.planet_id=$1 AND st.code='deathstar'
    `, [pl.id])).rows[0]?.quantity ?? 0;
    console.log(`  ${pl.name}: ${q}`);
  }

  await c.end();
})().catch(e => { console.error('❌', e); process.exit(1); });
