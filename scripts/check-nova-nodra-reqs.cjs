const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Get Nova and Nodra ship type info
  const ships = await client.query(`
    SELECT id, code, name, metal_cost, crystal_cost, deuterium_cost, cargo_capacity
    FROM ship_types 
    WHERE code IN ('nova', 'destruccion_masiva')
    ORDER BY code
  `);
  
  console.log('=== Ship Types ===');
  ships.rows.forEach(s => {
    console.log(`${s.name} (${s.code}): Metal=${s.metal_cost} Crystal=${s.crystal_cost} Deut=${s.deuterium_cost}`);
  });

  // Get requirements for both
  for (const ship of ships.rows) {
    console.log(`\n=== Requirements for ${ship.name} (${ship.code}) ===`);
    
    const reqs = await client.query(`
      SELECT 
        sr.id,
        sr.required_building_id,
        sr.required_building_level,
        sr.required_tech_id,
        sr.required_tech_level,
        bt.code as building_code,
        bt.name as building_name,
        tt.code as tech_code,
        tt.name as tech_name
      FROM ship_requirements sr
      LEFT JOIN building_types bt ON bt.id = sr.required_building_id
      LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
      WHERE sr.ship_type_id = $1
      ORDER BY sr.id
    `, [ship.id]);

    reqs.rows.forEach(r => {
      if (r.building_code) {
        console.log(`  Building: ${r.building_name} (${r.building_code}) Level ${r.required_building_level}`);
      }
      if (r.tech_code) {
        console.log(`  Tech: ${r.tech_name} (${r.tech_code}) Level ${r.required_tech_level}`);
      }
    });
  }

  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
