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
  
  // Read and apply the migration
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260407140000_fix_phalanx_scan.sql'),
    'utf8'
  );
  
  console.log('Applying phalanx_scan fix migration...');
  await client.query(sql);
  console.log('✅ Migration applied successfully');
  
  // Verify the function was updated
  const funcRes = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'phalanx_scan'
  `);
  
  const src = funcRes.rows[0].prosrc;
  
  // Check fix 1: No more LEFT JOIN for building level
  const hasOldJoin = src.includes('LEFT JOIN planet_buildings pb ON p.id = pb.planet_id');
  const hasNewQuery = src.includes("bt.code = 'sensor_phalanx'") && src.includes('building_types bt');
  
  // Check fix 2: Uses 'error' key instead of 'reason'
  const usesError = src.includes("'error'");
  const usesReason = src.includes("'reason'");
  
  console.log('\n=== Verification ===');
  console.log('Old LEFT JOIN removed:', !hasOldJoin ? '✅' : '❌');
  console.log('New clean query present:', hasNewQuery ? '✅' : '❌');
  console.log('Uses "error" key:', usesError ? '✅' : '❌');
  console.log('Uses "reason" key:', !usesReason ? '✅ (removed)' : '❌ (still present)');
  
  // Test: call function without auth (should get error with 'error' key now)
  const testRes = await client.query(`
    SELECT phalanx_scan(
      '00000000-0000-0000-0000-000000000000'::uuid,
      1, 1, 1
    ) as result
  `);
  const result = testRes.rows[0].result;
  console.log('\nTest call result:', JSON.stringify(result));
  console.log('Has "error" key:', result.error !== undefined ? '✅' : '❌');
  console.log('Has "reason" key:', result.reason !== undefined ? '❌' : '✅ (correctly removed)');
  
  // Verify SECURITY DEFINER
  const secRes = await client.query(`
    SELECT prosecdef FROM pg_proc WHERE proname = 'phalanx_scan'
  `);
  console.log('SECURITY DEFINER:', secRes.rows[0].prosecdef ? '✅' : '❌');
  
  // Verify grant
  const grantRes = await client.query(`
    SELECT has_function_privilege('authenticated', 'phalanx_scan(uuid, integer, integer, integer)', 'EXECUTE') as can_exec
  `);
  console.log('Authenticated can execute:', grantRes.rows[0].can_exec ? '✅' : '❌');
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
