const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Check admin_process_all_pending_buildings
  console.log('=== admin_process_all_pending_buildings (lunar_base excerpt) ===');
  const fn1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='admin_process_all_pending_buildings' LIMIT 1");
  if (fn1.rows.length) {
    const src = fn1.rows[0].prosrc;
    // Find lunar_base section
    const idx = src.indexOf('lunar_base');
    if (idx > -1) console.log(src.substring(Math.max(0, idx - 200), idx + 300));
    else console.log('No lunar_base reference found in body');
  }

  // Check admin_process_pending_buildings_batch
  console.log('\n=== admin_process_pending_buildings_batch (lunar_base excerpt) ===');
  const fn2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='admin_process_pending_buildings_batch' LIMIT 1");
  if (fn2.rows.length) {
    const src = fn2.rows[0].prosrc;
    const idx = src.indexOf('lunar_base');
    if (idx > -1) console.log(src.substring(Math.max(0, idx - 200), idx + 300));
    else console.log('No lunar_base reference found in body');
  }

  // Check secure_demolish_building
  console.log('\n=== secure_demolish_building (lunar_base excerpt) ===');
  const fn3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_demolish_building' LIMIT 1");
  if (fn3.rows.length) {
    const src = fn3.rows[0].prosrc;
    const idx = src.indexOf('lunar_base');
    if (idx > -1) console.log(src.substring(Math.max(0, idx - 300), idx + 400));
    else console.log('No lunar_base reference found in body');
  }

  // Also check how moons are created - what initial fields_max do they get?
  console.log('\n=== Functions that create moons ===');
  const moonFns = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%planet_type%moon%' AND prosrc ILIKE '%INSERT%planets%'");
  console.log('Functions:', moonFns.rows.map(r => r.proname).join(', '));

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
