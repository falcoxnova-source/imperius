const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Full CRON function - first 50 lines and last 50 lines
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor' AND pronamespace='public'::regnamespace");
  const src = r1.rows[0]?.prosrc || '';
  const lines = src.split('\n');
  console.log('=== CRON: Total lines:', lines.length, '===');
  console.log('--- First 30 lines ---');
  lines.slice(0, 30).forEach((l, i) => console.log(`${i+1}: ${l}`));
  console.log('--- Last 30 lines ---');
  lines.slice(-30).forEach((l, i) => console.log(`${lines.length - 30 + i + 1}: ${l}`));
  
  // 2. Does the cron call calculate_planet_resources at ALL?
  console.log('\n=== CRON: Searching for resource-related patterns ===');
  const patterns = ['resource', 'metal', 'crystal', 'deuterium', 'production', 'storage', 'bonus', 'officer', 'geologist', 'calculate', 'mine'];
  for (const pat of patterns) {
    const count = lines.filter(l => l.toLowerCase().includes(pat)).length;
    if (count > 0) console.log(`  "${pat}": ${count} lines`);
  }

  // 3. secure_add_to_shipyard_queue full source (around build_time area)
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace");
  const src2 = r2.rows[0]?.prosrc || '';
  const lines2 = src2.split('\n');
  console.log('\n=== secure_add_to_shipyard_queue: Lines 140-170 ===');
  lines2.slice(139, 170).forEach((l, i) => console.log(`${140+i}: ${l}`));
  
  // 4. Check VIP users count
  const r4 = await c.query("SELECT COUNT(*) as cnt FROM plus_subscriptions WHERE is_active = true AND expires_at > now()");
  console.log('\n=== Active VIP users:', r4.rows[0]?.cnt, '===');

  // 5. Check if is_user_plus works correctly for a known VIP user
  const r5 = await c.query("SELECT ps.user_id, p.username, ps.expires_at FROM plus_subscriptions ps JOIN profiles p ON p.id = ps.user_id WHERE ps.is_active = true AND ps.expires_at > now() LIMIT 5");
  console.log('\n=== Sample VIP users ===');
  r5.rows.forEach(r => console.log(`  ${r.username}: expires ${r.expires_at}`));

  // 6. Test is_user_plus for a VIP user
  if (r5.rows.length > 0) {
    const testUserId = r5.rows[0].user_id;
    const r6 = await c.query("SELECT is_user_plus($1) as result", [testUserId]);
    console.log(`\n=== is_user_plus('${r5.rows[0].username}'):`, r6.rows[0]?.result, '===');
  }

  // 7. Check which migrations modified secure_add_to_shipyard_queue AFTER VIP patch
  console.log('\n=== Migrations touching shipyard queue (from filenames) ===');
  // We'll search in pg_proc for creation timestamp instead
  
  // 8. Check how resources update - is there a trigger or function that calls calculate_planet_resources?
  const r8 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='process_resource_update_on_action' AND pronamespace='public'::regnamespace");
  console.log('\n=== process_resource_update_on_action ===');
  console.log('Exists:', r8.rows.length > 0);
  if (r8.rows[0]) {
    console.log('Has calculate_planet_resources:', r8.rows[0].prosrc.includes('calculate_planet_resources'));
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
