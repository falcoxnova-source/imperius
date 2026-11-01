const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Check a sample bot's full building state
  const r = await c.query(`
    SELECT bt.code, pb.level 
    FROM planet_buildings pb 
    JOIN building_types bt ON bt.id=pb.building_type_id 
    JOIN planets pl ON pl.id=pb.planet_id 
    JOIN profiles p ON p.id=pl.user_id 
    WHERE p.username='Carlos_GT' 
    ORDER BY bt.code
  `);
  console.log('\n=== Carlos_GT Buildings ===');
  console.table(r.rows);

  const r2 = await c.query(`
    SELECT fields_used, fields_max 
    FROM planets pl 
    JOIN profiles p ON p.id=pl.user_id 
    WHERE p.username='Carlos_GT' AND pl.planet_type='planet'
  `);
  console.log('Fields:', r2.rows[0]);

  // Check what the building decision logic would pick:
  // metal_mine=4, need to check crystal_mine, solar_plant, etc.
  // With metal_mine=4 and crystal_mine=0: crystal_mine < 1 => should build crystal_mine
  // crystal_mine cost level 0 -> base_metal=48, base_crystal=24 * POWER(1.6, 0) = 48 metal, 24 crystal
  // Bot has 6547 metal, 1751 crystal => CAN AFFORD
  
  // Check building_types for crystal_mine cost
  const r3 = await c.query(`
    SELECT code, base_metal, base_crystal, base_deuterium, cost_factor, max_level 
    FROM building_types 
    WHERE code IN ('metal_mine','crystal_mine','solar_plant','deuterium_synthesizer','robotics_factory','shipyard','research_lab')
    ORDER BY code
  `);
  console.log('\n=== Building Costs ===');
  console.table(r3.rows);

  // Check if calculate_and_sync_resources_internal exists and works
  const r4 = await c.query(`
    SELECT pl.id as planet_id, p.id as user_id
    FROM planets pl 
    JOIN profiles p ON p.id=pl.user_id 
    WHERE p.username='Carlos_GT' AND pl.planet_type='planet'
  `);
  console.log('\nPlanet/User IDs:', r4.rows[0]);

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
