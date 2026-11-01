const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Get calculate_planet_resources - THE KEY FUNCTION
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'calculate_planet_resources' LIMIT 1`);
  if (fn.rows.length) {
    console.log('=== calculate_planet_resources ===');
    console.log(fn.rows[0].prosrc);
  }

  // Also check calculate_and_sync_resources
  const fn2 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'calculate_and_sync_resources' LIMIT 1`);
  if (fn2.rows.length) {
    console.log('\n=== calculate_and_sync_resources ===');
    console.log(fn2.rows[0].prosrc);
  }

  // Also check sync_planet_resources
  const fn3 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'sync_planet_resources' LIMIT 1`);
  if (fn3.rows.length) {
    console.log('\n=== sync_planet_resources ===');
    console.log(fn3.rows[0].prosrc);
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
