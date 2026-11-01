const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

const userId = 'e11e6baa-c599-440c-aaaa-b98008182b4b';
const planetId = '4d373acd-322c-4ea4-8529-9301f13815d9';

(async () => {
  await c.connect();

  // Check user_technologies columns
  const utCols = await c.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'user_technologies' ORDER BY ordinal_position
  `);
  console.log('=== user_technologies COLUMNS ===');
  utCols.rows.forEach(r => console.log(r.column_name));

  // Get user technologies with correct column
  const ut = await c.query(`SELECT * FROM user_technologies WHERE user_id = $1 LIMIT 3`, [userId]);
  if (ut.rows.length > 0) {
    console.log('\n=== SAMPLE user_technologies ===');
    console.log(Object.keys(ut.rows[0]));
  }

  const utAll = await c.query(`
    SELECT ut.*, tt.code, tt.name
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = $1
    ORDER BY tt.code
  `, [userId]);
  console.log('\n=== USER TECHNOLOGIES ===');
  utAll.rows.forEach(t => console.log(`  ${t.code} (${t.name}) = nivel ${t.level}`));

  // Summary of what's needed:
  // Terraformer requires: 
  //   1. energy_tech level 12 (tech id 1)
  //   2. nanite_factory level 1 (building id 10)
  console.log('\n=== TERRAFORMER REQUIREMENTS SUMMARY ===');
  
  // Check energy_tech
  const energyTech = utAll.rows.find(t => t.code === 'energy_tech');
  console.log(`energy_tech: ${energyTech ? 'nivel ' + energyTech.level : 'NO TIENE'} (necesita nivel 12)`);

  // Check nanite_factory
  const nanite = await c.query(`
    SELECT pb.level FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = $1 AND bt.code = 'nanite_factory'
  `, [planetId]);
  console.log(`nanite_factory: ${nanite.rows.length > 0 ? 'nivel ' + nanite.rows[0].level : 'NO TIENE'} (necesita nivel 1)`);

  await c.end();
})();
