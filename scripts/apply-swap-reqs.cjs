const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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

  // Apply migration
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260409100000_swap_nova_nodra_requirements.sql'),
    'utf8'
  );

  console.log('Applying swap migration...');
  await client.query(sql);
  console.log('✅ Migration applied\n');

  // Verify
  const ships = await client.query(`
    SELECT id, code, name FROM ship_types 
    WHERE code IN ('nova', 'destruccion_masiva')
    ORDER BY code
  `);

  for (const ship of ships.rows) {
    console.log(`=== ${ship.name} (${ship.code}) ===`);
    const reqs = await client.query(`
      SELECT 
        COALESCE(bt.name, '') as building,
        COALESCE(bt.code, '') as building_code,
        sr.required_building_level,
        COALESCE(tt.name, '') as tech,
        COALESCE(tt.code, '') as tech_code,
        sr.required_tech_level
      FROM ship_requirements sr
      LEFT JOIN building_types bt ON bt.id = sr.required_building_id
      LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
      WHERE sr.ship_type_id = $1
      ORDER BY sr.id
    `, [ship.id]);

    reqs.rows.forEach(r => {
      if (r.building_code) {
        console.log(`  🏗️  ${r.building} Level ${r.required_building_level}`);
      }
      if (r.tech_code) {
        console.log(`  🔬 ${r.tech} Level ${r.required_tech_level}`);
      }
    });
    console.log('');
  }

  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
