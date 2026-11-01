const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';

(async () => {
  await c.connect();

  console.log('=== TOP 40 ===');
  const top = await c.query(`
    SELECT id, username, points_total, points_buildings, points_research, points_fleet, points_defense, is_admin
    FROM profiles
    WHERE is_admin = false AND is_hidden = false
    ORDER BY points_total DESC NULLS LAST
    LIMIT 40
  `);
  top.rows.forEach((r,i) => console.log(`${i+1}. ${r.username} -> ${r.points_total} (b=${r.points_buildings} r=${r.points_research} f=${r.points_fleet} d=${r.points_defense}) ${r.id===USER_ID?'<-- WOLF KING':''}`));

  console.log('\n=== Wolf King profile ===');
  const me = await c.query(`SELECT id, username, points_total, points_buildings, points_research, points_fleet, points_defense, is_admin, is_hidden FROM profiles WHERE id=$1`, [USER_ID]);
  console.log(me.rows[0]);

  console.log('\n=== requisitos deathstar ===');
  const reqs = await c.query(`
    SELECT bt.code AS bld, tt.code AS tech, sr.required_level
    FROM ship_requirements sr
    LEFT JOIN building_types bt ON bt.id = sr.building_type_id
    LEFT JOIN technology_types tt ON tt.id = sr.technology_type_id
    WHERE sr.ship_type_id = (SELECT id FROM ship_types WHERE code='deathstar')
  `);
  console.table(reqs.rows);

  console.log('\n=== planetas Wolf King ===');
  const pls = await c.query(`SELECT id, name, is_main_planet, galaxy, system, position FROM planets WHERE user_id=$1`, [USER_ID]);
  console.table(pls.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
