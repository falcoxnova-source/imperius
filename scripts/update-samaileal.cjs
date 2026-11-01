const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Find user
  const user = await c.query("SELECT id, username, email FROM profiles WHERE email = 'samaileal01@gmail.com'");
  console.log('USER:', JSON.stringify(user.rows, null, 2));

  if (user.rows.length === 0) {
    console.log('User not found!');
    await c.end();
    return;
  }

  const userId = user.rows[0].id;

  // 2. Get planets
  const planets = await c.query('SELECT id, name, is_main_planet, galaxy, solar_system, position FROM planets WHERE user_id = $1', [userId]);
  console.log('PLANETS:', JSON.stringify(planets.rows, null, 2));

  // 3. Get building types
  const btypes = await c.query('SELECT id, code, name FROM building_types ORDER BY id');
  console.log('BUILDING_TYPES:', JSON.stringify(btypes.rows, null, 2));

  // 4. Get technology types
  const ttypes = await c.query('SELECT id, code, name FROM technology_types ORDER BY id');
  console.log('TECH_TYPES:', JSON.stringify(ttypes.rows, null, 2));

  // 5. Get current buildings on main planet
  const mainPlanet = planets.rows.find(p => p.is_main_planet) || planets.rows[0];
  if (mainPlanet) {
    const buildings = await c.query(`
      SELECT pb.building_type_id, bt.code, bt.name, pb.level 
      FROM planet_buildings pb 
      JOIN building_types bt ON bt.id = pb.building_type_id 
      WHERE pb.planet_id = $1 ORDER BY pb.building_type_id
    `, [mainPlanet.id]);
    console.log('CURRENT BUILDINGS:', JSON.stringify(buildings.rows, null, 2));

    const resources = await c.query('SELECT * FROM planet_resources WHERE planet_id = $1', [mainPlanet.id]);
    console.log('CURRENT RESOURCES:', JSON.stringify(resources.rows, null, 2));
  }

  // 6. Get current technologies
  const techs = await c.query(`
    SELECT ut.technology_type_id, tt.code, tt.name, ut.level 
    FROM user_technologies ut 
    JOIN technology_types tt ON tt.id = ut.technology_type_id 
    WHERE ut.user_id = $1 ORDER BY ut.technology_type_id
  `, [userId]);
  console.log('CURRENT TECHS:', JSON.stringify(techs.rows, null, 2));

  // 7. Get building requirements for nanite_factory and terraformer
  const buildReqs = await c.query(`
    SELECT br.*, bt.code as building_code, bt2.code as req_building_code, tt.code as req_tech_code
    FROM building_requirements br
    JOIN building_types bt ON bt.id = br.building_type_id
    LEFT JOIN building_types bt2 ON bt2.id = br.required_building_id
    LEFT JOIN technology_types tt ON tt.id = br.required_tech_id
    WHERE bt.code IN ('nanite_factory', 'terraformer')
  `);
  console.log('BUILDING_REQUIREMENTS:', JSON.stringify(buildReqs.rows, null, 2));

  // 8. Get ship requirements for deathstar
  const shipReqs = await c.query(`
    SELECT sr.*, st.code as ship_code, bt.code as req_building_code, tt.code as req_tech_code
    FROM ship_requirements sr
    JOIN ship_types st ON st.id = sr.ship_type_id
    LEFT JOIN building_types bt ON bt.id = sr.required_building_id
    LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
    WHERE st.code = 'deathstar'
  `);
  console.log('DEATHSTAR_REQUIREMENTS:', JSON.stringify(shipReqs.rows, null, 2));

  // 9. Get tech requirements for the technologies needed
  const techReqs = await c.query(`
    SELECT tr.*, tt.code as tech_code, bt.code as req_building_code, tt2.code as req_tech_code
    FROM technology_requirements tr
    JOIN technology_types tt ON tt.id = tr.technology_type_id
    LEFT JOIN building_types bt ON bt.id = tr.required_building_id
    LEFT JOIN technology_types tt2 ON tt2.id = tr.required_tech_id
    WHERE tt.code IN ('energy_tech', 'shielding_tech', 'hyperspace_tech', 'hyperspace_drive', 'graviton_tech', 'computer_tech')
  `);
  console.log('TECH_REQUIREMENTS:', JSON.stringify(techReqs.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
