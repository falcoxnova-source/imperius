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

  // Find functions that modify fxu_balance
  const r1 = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc ILIKE '%fxu_balance%' 
    AND proname NOT LIKE 'check_%'
    ORDER BY proname
  `);
  console.log('Functions that touch fxu_balance:');
  for (const row of r1.rows) {
    console.log(`  ${row.proname}`);
  }

  // Check the trigger on profiles
  const r2 = await c.query(`
    SELECT tgname, tgtype, 
           (SELECT proname FROM pg_proc WHERE oid = tgfoid) as func_name
    FROM pg_trigger 
    WHERE tgrelid = 'profiles'::regclass
    AND NOT tgisinternal
    ORDER BY tgname
  `);
  console.log('\nTriggers on profiles:');
  for (const row of r2.rows) {
    console.log(`  ${row.tgname} → ${row.func_name}`);
  }

  // Check the function that blocks direct fxu_balance modification
  const r3 = await c.query(`
    SELECT proname, prosrc FROM pg_proc 
    WHERE prosrc ILIKE '%FXU002%' OR prosrc ILIKE '%Direct modification of fxu_balance%'
  `);
  console.log('\nFunction with FXU002 error:');
  for (const row of r3.rows) {
    console.log(`  ${row.proname}`);
    console.log(row.prosrc.substring(0, 500));
  }

  // Find add_fxu or similar function
  const r4 = await c.query(`
    SELECT proname, prosrc FROM pg_proc 
    WHERE proname ILIKE '%add%fxu%' OR proname ILIKE '%credit%fxu%' OR proname ILIKE '%give%fxu%'
    OR proname ILIKE '%admin%fxu%' OR proname ILIKE '%adjust%'
    ORDER BY proname
  `);
  console.log('\nFXU credit functions:');
  for (const row of r4.rows) {
    console.log(`  ${row.proname}:`);
    console.log(`    ${row.prosrc.substring(0, 300)}`);
    console.log('---');
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
