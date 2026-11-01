const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

const userId = 'e11e6baa-c599-440c-aaaa-b98008182b4b';

(async () => {
  await c.connect();

  // Check building_types for terraformer
  const bt = await c.query(`
    SELECT id, name, internal_name, category FROM building_types 
    WHERE name ILIKE '%terraform%' OR internal_name ILIKE '%terraform%'
  `);
  console.log('=== BUILDING TYPE: TERRAFORMER ===');
  bt.rows.forEach(r => console.log(r));

  // Check building_requirements for terraformer
  if (bt.rows.length > 0) {
    const terraId = bt.rows[0].id;
    const reqs = await c.query(`
      SELECT br.*, bt2.name as req_name, bt2.internal_name as req_internal
      FROM building_requirements br
      LEFT JOIN building_types bt2 ON bt2.id = br.required_building_id
      WHERE br.building_id = $1
    `, [terraId]);
    console.log('\n=== TERRAFORMER REQUIREMENTS ===');
    reqs.rows.forEach(r => console.log(r));
  }

  // Check user's current planet buildings
  const pb = await c.query(`
    SELECT pl.name as planet_name, pl.id as planet_id, bt.name, bt.internal_name, pb.level
    FROM planet_buildings pb
    JOIN planets pl ON pl.id = pb.planet_id
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pl.user_id = $1
    ORDER BY pl.name, bt.name
  `, [userId]);
  
  console.log('\n=== EDIFICIOS DEL USUARIO (gentlemediatv) ===');
  let currentPlanet = '';
  pb.rows.forEach(r => {
    if (r.planet_name !== currentPlanet) {
      currentPlanet = r.planet_name;
      console.log(`\n--- ${r.planet_name} (${r.planet_id}) ---`);
    }
    console.log(`  ${r.internal_name} (${r.name}) = nivel ${r.level}`);
  });

  // Get all building types to understand the schema
  const allBt = await c.query(`SELECT id, name, internal_name, category FROM building_types ORDER BY category, name`);
  console.log('\n=== ALL BUILDING TYPES ===');
  allBt.rows.forEach(r => console.log(`${r.id} | ${r.internal_name} | ${r.name} | cat=${r.category}`));

  await c.end();
})();
