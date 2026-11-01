const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to database');

  // 1. Show current values
  const before = await client.query(
    `SELECT code, name, max_level FROM building_types ORDER BY category, code`
  );
  console.log('\n=== BEFORE ===');
  console.table(before.rows);

  // 2. Update max_level to 255 for all regular buildings
  //    EXCLUDING: lunar_base(8), sensor_phalanx(7), jump_gate(1) - these keep their special limits
  const result = await client.query(`
    UPDATE building_types 
    SET max_level = 255 
    WHERE code IN (
      'metal_mine', 'crystal_mine', 'deuterium_synthesizer',
      'solar_plant', 'fusion_reactor',
      'metal_storage', 'crystal_storage', 'deuterium_tank',
      'robotics_factory', 'nanite_factory', 'shipyard', 
      'research_lab', 'missile_silo', 'terraformer', 'alliance_depot'
    )
    RETURNING code, name, max_level
  `);
  console.log('\n=== UPDATED ===');
  console.table(result.rows);
  console.log(`Updated: ${result.rowCount} buildings to max_level = 255`);

  // 3. Verify final state
  const after = await client.query(
    `SELECT code, name, max_level FROM building_types ORDER BY category, code`
  );
  console.log('\n=== AFTER ===');
  console.table(after.rows);

  await client.end();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); client.end(); });
