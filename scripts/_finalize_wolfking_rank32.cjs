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
  const spId = (await c.query(`SELECT id FROM building_types WHERE code='solar_plant'`)).rows[0].id;
  await c.query(`UPDATE planet_buildings SET level=27 WHERE planet_id=$1 AND building_type_id=$2`, [MAIN, spId]);
  await c.query(`SELECT update_player_points($1)`, [USER_ID]);

  const r = await c.query(`SELECT username, points_total, points_buildings, points_research, points_fleet FROM profiles WHERE id=$1`, [USER_ID]);
  console.log('Wolf King:', r.rows[0]);

  const rk = await c.query(`
    SELECT rank FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
      FROM profiles WHERE is_admin=false AND is_hidden=false
    ) x WHERE id=$1
  `, [USER_ID]);
  console.log(`>>> RANK: ${rk.rows[0].rank}`);

  const top = await c.query(`
    SELECT username, points_total, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
    FROM profiles WHERE is_admin=false AND is_hidden=false ORDER BY points_total DESC LIMIT 35
  `);
  console.log('\nTOP 30-34:');
  top.rows.filter(r => r.rank >= 30 && r.rank <= 34).forEach(r => {
    const m = r.username === 'Wolf King' ? '  <-- WOLF KING' : '';
    console.log(`  ${r.rank}. ${r.username} → ${r.points_total}${m}`);
  });

  // Verificacion final: edificios + tecnologias + naves
  console.log('\n--- Edificios planeta principal ---');
  const blds = await c.query(`
    SELECT bt.code, pb.level FROM planet_buildings pb
    JOIN building_types bt ON bt.id=pb.building_type_id
    WHERE pb.planet_id=$1 ORDER BY bt.code
  `, [MAIN]);
  console.table(blds.rows);

  console.log('\n--- Tecnologias relevantes ---');
  const techs = await c.query(`
    SELECT tt.code, ut.level FROM user_technologies ut
    JOIN technology_types tt ON tt.id=ut.technology_type_id
    WHERE ut.user_id=$1 AND tt.code IN ('hyperspace_tech','hyperspace_drive','graviton_tech','energy_tech')
    ORDER BY tt.code
  `, [USER_ID]);
  console.table(techs.rows);

  console.log('\n--- Naves ---');
  const ships = await c.query(`
    SELECT st.code, st.name, ps.quantity FROM planet_ships ps
    JOIN ship_types st ON st.id=ps.ship_type_id
    WHERE ps.planet_id=$1 AND ps.quantity>0
  `, [MAIN]);
  console.table(ships.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
