const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Get complete_building_queue_item
  console.log('=== complete_building_queue_item ===');
  const fn1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='complete_building_queue_item' LIMIT 1");
  if (fn1.rows.length) console.log(fn1.rows[0].prosrc);

  // Get process_building_queue_internal  
  console.log('\n=== process_building_queue_internal ===');
  const fn2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='process_building_queue_internal' LIMIT 1");
  if (fn2.rows.length) console.log(fn2.rows[0].prosrc);

  // Get optimized_global_queue_processor (also mentions lunar_base)
  console.log('\n=== optimized_global_queue_processor ===');
  const fn3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor' LIMIT 1");
  if (fn3.rows.length) console.log(fn3.rows[0].prosrc);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
