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

  // 1. Get join_acs_with_fleet function source
  console.log('=== join_acs_with_fleet FULL SOURCE ===');
  const fn1 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'join_acs_with_fleet'
  `);
  if (fn1.rows.length > 0) console.log(fn1.rows[0].prosrc);

  // 2. Get join_acs_attack function source
  console.log('\n\n=== join_acs_attack FULL SOURCE ===');
  const fn2 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'join_acs_attack'
  `);
  if (fn2.rows.length > 0) console.log(fn2.rows[0].prosrc);

  // 3. Get send_fleet function source (the one that creates fleets and subtracts ships)
  console.log('\n\n=== send_fleet FULL SOURCE ===');
  const fn3 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'send_fleet'
  `);
  if (fn3.rows.length > 0) console.log(fn3.rows[0].prosrc);

  // 4. Get process_fleet_arrival relevant parts for ACS
  console.log('\n\n=== process_fleet_arrival FULL SOURCE ===');
  const fn4 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'
  `);
  if (fn4.rows.length > 0) console.log(fn4.rows[0].prosrc);

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
