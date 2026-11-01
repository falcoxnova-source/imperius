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

  // Bajar crystal_mine a 29 (forzar, ignorar GREATEST)
  const cmId = (await c.query(`SELECT id FROM building_types WHERE code='crystal_mine'`)).rows[0].id;
  await c.query(`UPDATE planet_buildings SET level=29 WHERE planet_id=$1 AND building_type_id=$2`, [MAIN, cmId]);

  await c.query(`SELECT update_player_points($1)`, [USER_ID]);

  const after = await c.query(`SELECT username, points_total, points_buildings, points_research, points_fleet FROM profiles WHERE id=$1`, [USER_ID]);
  console.log('Wolf King:', after.rows[0]);

  // Top 30-35
  const top = await c.query(`
    SELECT username, points_total, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
    FROM profiles WHERE is_admin=false AND is_hidden=false
    ORDER BY points_total DESC LIMIT 35
  `);
  console.log('\nTOP 28-35:');
  top.rows.filter(r => r.rank >= 28 && r.rank <= 35).forEach(r => {
    const mark = r.username === 'Wolf King' ? ' <-- WOLF KING' : '';
    console.log(`${r.rank}. ${r.username} -> ${r.points_total}${mark}`);
  });

  const rank = await c.query(`
    SELECT rank FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
      FROM profiles WHERE is_admin=false AND is_hidden=false
    ) x WHERE id=$1
  `, [USER_ID]);
  console.log(`\n>>> Wolf King rank: ${rank.rows[0].rank}`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
