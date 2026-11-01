const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188'; // Wolf King

(async () => {
  await c.connect();

  console.log('=== TOP 32 (puntos) ===');
  const top = await c.query(`
    SELECT p.username, p.email, COALESCE(s.total_points,0) AS points
    FROM profiles p
    LEFT JOIN user_stats s ON s.user_id = p.id
    ORDER BY COALESCE(s.total_points,0) DESC
    LIMIT 35
  `);
  top.rows.forEach((r,i) => console.log(`${i+1}. ${r.username} (${r.email}) -> ${r.points}`));

  console.log('\n=== Wolf King state ===');
  const me = await c.query(`SELECT * FROM user_stats WHERE user_id = $1`, [USER_ID]);
  console.log(me.rows[0]);

  // Requisitos para deathstar
  console.log('\n=== Requisitos Estrella de la Muerte ===');
  const reqs = await c.query(`
    SELECT bt.code AS bld_code, tt.code AS tech_code, sr.required_level
    FROM ship_requirements sr
    LEFT JOIN building_types bt ON bt.id = sr.building_type_id
    LEFT JOIN technology_types tt ON tt.id = sr.technology_type_id
    WHERE sr.ship_type_id = (SELECT id FROM ship_types WHERE code = 'deathstar')
  `);
  console.table(reqs.rows);

  console.log('\n=== Edificios actuales en planeta principal ===');
  const planet = await c.query(`SELECT id, name FROM planets WHERE user_id = $1 AND is_main_planet = true`, [USER_ID]);
  console.log(planet.rows[0]);

  if (planet.rows[0]) {
    const blds = await c.query(`
      SELECT bt.code, pb.level
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = $1
      ORDER BY bt.code
    `, [planet.rows[0].id]);
    console.table(blds.rows);

    const techs = await c.query(`
      SELECT tt.code, ut.level
      FROM user_technologies ut
      JOIN technology_types tt ON tt.id = ut.technology_type_id
      WHERE ut.user_id = $1
      ORDER BY tt.code
    `, [USER_ID]);
    console.log('\n=== Tecnologias ===');
    console.table(techs.rows);

    const ships = await c.query(`
      SELECT st.code, ps.quantity
      FROM planet_ships ps
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE ps.planet_id = $1 AND ps.quantity > 0
    `, [planet.rows[0].id]);
    console.log('\n=== Naves en planeta principal ===');
    console.table(ships.rows);
  }

  await c.end();
})().catch(e => { console.error('❌', e); process.exit(1); });
