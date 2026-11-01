const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

const userId = 'e11e6baa-c599-440c-aaaa-b98008182b4b';

(async () => {
  await c.connect();

  // Find terraformer building type
  const bt = await c.query(`
    SELECT * FROM building_types WHERE code ILIKE '%terraform%' OR name ILIKE '%terraform%'
  `);
  console.log('=== TERRAFORMER BUILDING TYPE ===');
  bt.rows.forEach(r => console.log(JSON.stringify(r)));

  if (bt.rows.length > 0) {
    const terraId = bt.rows[0].id;

    // Check requirements
    const reqs = await c.query(`
      SELECT br.*, 
             bt2.code as req_building_code, bt2.name as req_building_name,
             t.code as req_tech_code, t.name as req_tech_name
      FROM building_requirements br
      LEFT JOIN building_types bt2 ON bt2.id = br.required_building_id
      LEFT JOIN (SELECT id, code, name FROM building_types) t ON t.id = br.required_tech_id
      WHERE br.building_type_id = $1
    `, [terraId]);
    console.log('\n=== TERRAFORMER REQUIREMENTS ===');
    reqs.rows.forEach(r => console.log(JSON.stringify(r)));
  }

  // Check tech tables
  const techTables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND (table_name ILIKE '%tech%' OR table_name ILIKE '%research%')
    ORDER BY table_name
  `);
  console.log('\n=== TECH/RESEARCH TABLES ===');
  techTables.rows.forEach(r => console.log(r.table_name));

  // User's planets
  const planets = await c.query(`
    SELECT id, name, galaxy, solar_system, position, fields_used, fields_max
    FROM planets WHERE user_id = $1 ORDER BY is_main_planet DESC
  `, [userId]);
  console.log('\n=== USER PLANETS ===');
  planets.rows.forEach(p => console.log(`${p.name} [${p.galaxy}:${p.solar_system}:${p.position}] fields=${p.fields_used}/${p.fields_max} id=${p.id}`));

  // User's buildings on main planet
  if (planets.rows.length > 0) {
    const mainPlanetId = planets.rows[0].id;
    const buildings = await c.query(`
      SELECT bt.code, bt.name, pb.level
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = $1
      ORDER BY bt.code
    `, [mainPlanetId]);
    console.log(`\n=== BUILDINGS ON ${planets.rows[0].name} ===`);
    buildings.rows.forEach(b => console.log(`  ${b.code} (${b.name}) = nivel ${b.level}`));
  }

  await c.end();
})();
