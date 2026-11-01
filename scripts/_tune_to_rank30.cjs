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
  const col1 = (await c.query(`SELECT id FROM planets WHERE user_id=$1 AND name='Colonia 1'`, [USER_ID])).rows[0].id;

  // Iterar 1..5 deathstars en colonia1
  for (let n = 1; n <= 5; n++) {
    await c.query(`
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = $3
    `, [col1, dsId, n]);
    await c.query(`SELECT update_player_points($1)`, [USER_ID]);
    const pts = (await c.query(`SELECT points_total FROM profiles WHERE id=$1`, [USER_ID])).rows[0].points_total;
    const rank = parseInt((await c.query(`
      SELECT rank FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank FROM profiles WHERE is_admin=false AND is_hidden=false) x WHERE id=$1
    `, [USER_ID])).rows[0].rank, 10);
    console.log(`Colonia 1 ds=${n} → ${pts} → rank=${rank}`);
    if (rank === 30) {
      console.log('✓ RANK 30');
      break;
    }
    if (rank < 30) {
      // pasamos: revertir uno
      await c.query(`UPDATE planet_ships SET quantity=$3 WHERE planet_id=$1 AND ship_type_id=$2`, [col1, dsId, n-1]);
      await c.query(`SELECT update_player_points($1)`, [USER_ID]);
      console.log(`(revertido a ${n-1})`);
      break;
    }
  }

  console.log('\n--- FINAL ---');
  const top = await c.query(`
    SELECT username, points_total, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
    FROM profiles WHERE is_admin=false AND is_hidden=false ORDER BY points_total DESC LIMIT 35
  `);
  top.rows.filter(r => r.rank>=27 && r.rank<=34).forEach(r => {
    const m = r.username==='Wolf King' ? '  <-- WOLF KING' : '';
    console.log(`  ${r.rank}. ${r.username} → ${r.points_total}${m}`);
  });

  const prof = await c.query(`SELECT username, points_total, points_buildings, points_research, points_fleet, battles_won, battles_lost FROM profiles WHERE id=$1`, [USER_ID]);
  console.log('\n', prof.rows[0]);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
