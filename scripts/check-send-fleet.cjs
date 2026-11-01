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

  // Get full send_fleet source 
  console.log('=== send_fleet FULL SOURCE ===');
  const fn = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'send_fleet'
  `);
  if (fn.rows.length > 0) console.log(fn.rows[0].prosrc);

  // Check if there's a CHECK constraint on planet_ships
  console.log('\n=== CHECK CONSTRAINTS ON planet_ships ===');
  const checks = await c.query(`
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'planet_ships'::regclass AND contype = 'c'
  `);
  console.log(JSON.stringify(checks.rows, null, 2));

  // Check if there's a CHECK constraint on planet_resources
  console.log('\n=== CHECK CONSTRAINTS ON planet_resources ===');
  const checks2 = await c.query(`
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'planet_resources'::regclass AND contype = 'c'
  `);
  console.log(JSON.stringify(checks2.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
