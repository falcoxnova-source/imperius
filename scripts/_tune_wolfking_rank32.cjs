const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
const MAIN    = '4ae2e0ea-9112-41f2-8a83-c17f6001e254';

(async () => {
  await c.connect();

  // Bucle iterativo: ajustar solar_plant hasta caer en rango [472564, 484117] = rank 32
  const spId = (await c.query(`SELECT id FROM building_types WHERE code='solar_plant'`)).rows[0].id;

  for (let lvl = 27; lvl >= 20; lvl--) {
    await c.query(`UPDATE planet_buildings SET level=$3 WHERE planet_id=$1 AND building_type_id=$2`, [MAIN, spId, lvl]);
    await c.query(`SELECT update_player_points($1)`, [USER_ID]);
    const r = await c.query(`SELECT points_total FROM profiles WHERE id=$1`, [USER_ID]);
    const pts = r.rows[0].points_total;
    const rank = (await c.query(`
      SELECT rank FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
        FROM profiles WHERE is_admin=false AND is_hidden=false
      ) x WHERE id=$1
    `, [USER_ID])).rows[0].rank;
    console.log(`solar_plant=${lvl} → points=${pts} → rank=${rank}`);
    if (rank === 32) {
      console.log('✓ ALCANZADO RANK 32');
      break;
    }
  }

  // Final
  console.log('\n--- FINAL ---');
  const after = await c.query(`SELECT username, points_total, points_buildings, points_research, points_fleet FROM profiles WHERE id=$1`, [USER_ID]);
  console.log(after.rows[0]);
  const top = await c.query(`
    SELECT username, points_total, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
    FROM profiles WHERE is_admin=false AND is_hidden=false ORDER BY points_total DESC LIMIT 35
  `);
  console.log('\nTOP 30-34:');
  top.rows.filter(r => r.rank >= 30 && r.rank <= 34).forEach(r => {
    const m = r.username === 'Wolf King' ? ' <-- WOLF KING' : '';
    console.log(`${r.rank}. ${r.username} -> ${r.points_total}${m}`);
  });

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
