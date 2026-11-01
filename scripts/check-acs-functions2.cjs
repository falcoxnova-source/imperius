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

  // 1. List ALL functions with 'acs' or 'fleet' in name
  console.log('=== FUNCTIONS WITH ACS IN NAME ===');
  const fns = await c.query(`
    SELECT proname, pg_get_function_arguments(oid) as args
    FROM pg_proc 
    WHERE proname LIKE '%acs%'
    ORDER BY proname
  `);
  for (const f of fns.rows) {
    console.log(`  ${f.proname}(${f.args})`);
  }

  // 2. Get join_acs_with_fleet source
  console.log('\n=== join_acs_with_fleet SOURCE ===');
  const fn1 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'join_acs_with_fleet'
  `);
  if (fn1.rows.length > 0) {
    console.log(fn1.rows[0].prosrc);
  } else {
    console.log('NOT FOUND');
  }

  // 3. Get join_acs_attack source
  console.log('\n=== join_acs_attack SOURCE ===');
  const fn2 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'join_acs_attack'
  `);
  if (fn2.rows.length > 0) {
    console.log(fn2.rows[0].prosrc);
  } else {
    console.log('NOT FOUND');
  }

  // 4. Get cancel_fleet source
  console.log('\n=== cancel_fleet SOURCE ===');
  const fn3 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'cancel_fleet'
  `);
  if (fn3.rows.length > 0) {
    console.log(fn3.rows[0].prosrc);
  } else {
    console.log('NOT FOUND');
  }

  // 5. Get process_acs_fleet_arrival
  console.log('\n=== process_acs_fleet_arrival SOURCE ===');
  const fn4 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_acs_fleet_arrival'
  `);
  if (fn4.rows.length > 0) {
    console.log(fn4.rows[0].prosrc);
  } else {
    console.log('NOT FOUND');
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
