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

  // 1. calculate_planet_resources
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_planet_resources' AND pronamespace='public'::regnamespace");
  const src1 = r1.rows[0]?.prosrc || '';
  console.log('=== calculate_planet_resources ===');
  console.log('Has is_user_plus:', src1.includes('is_user_plus'));
  console.log('Has VIP comment:', src1.includes('VIP Plus'));
  console.log('Has mine_bonus:', src1.includes('v_mine_bonus'));

  // 2. secure_send_fleet
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_send_fleet' AND pronamespace='public'::regnamespace");
  const src2 = r2.rows[0]?.prosrc || '';
  console.log('\n=== secure_send_fleet ===');
  console.log('Has VIP flight time:', src2.includes('VIP Plus: -10% flight time'));
  console.log('Has is_user_plus:', src2.includes('is_user_plus'));

  // 3. secure_add_to_building_queue
  const r3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_building_queue' AND pronamespace='public'::regnamespace");
  const src3 = r3.rows[0]?.prosrc || '';
  console.log('\n=== secure_add_to_building_queue ===');
  console.log('Has VIP construction:', src3.includes('VIP Plus: -10% construction time'));
  console.log('Has is_user_plus:', src3.includes('is_user_plus'));

  // 4. secure_add_to_shipyard_queue
  const r4 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace");
  const src4 = r4.rows[0]?.prosrc || '';
  console.log('\n=== secure_add_to_shipyard_queue ===');
  console.log('Has VIP shipyard:', src4.includes('VIP Plus: -10% shipyard'));
  console.log('Has is_user_plus:', src4.includes('is_user_plus'));

  // 5. secure_start_research
  const r5 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_start_research' AND pronamespace='public'::regnamespace");
  const src5 = r5.rows[0]?.prosrc || '';
  console.log('\n=== secure_start_research ===');
  console.log('Has VIP research:', src5.includes('VIP Plus: -10% research time'));
  console.log('Has is_user_plus:', src5.includes('is_user_plus'));

  // 6. optimized_global_queue_processor (CRON)
  const r6 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor' AND pronamespace='public'::regnamespace");
  const src6 = r6.rows[0]?.prosrc || '';
  console.log('\n=== optimized_global_queue_processor (CRON) ===');
  console.log('Has is_user_plus:', src6.includes('is_user_plus'));
  console.log('Has VIP/vip keyword:', src6.includes('vip') || src6.includes('VIP'));
  console.log('Has mine_bonus:', src6.includes('mine_bonus'));
  console.log('Calls calculate_planet_resources:', src6.includes('calculate_planet_resources'));
  console.log('Has inline resource calc:', src6.includes('v_metal_production') || src6.includes('metal_mine'));

  // 7. join_acs_with_fleet
  const r7 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='join_acs_with_fleet' AND pronamespace='public'::regnamespace");
  const src7 = r7.rows[0]?.prosrc || '';
  console.log('\n=== join_acs_with_fleet ===');
  console.log('Has VIP flight time:', src7.includes('VIP Plus: -10% flight time'));
  console.log('Has is_user_plus:', src7.includes('is_user_plus'));

  // 8. Check how many VIP users exist
  const r8 = await c.query("SELECT COUNT(*) as total_vip FROM plus_subscriptions WHERE status='active' AND expires_at > now()");
  console.log('\n=== Active VIP subscribers ===');
  console.log('Count:', r8.rows[0]?.total_vip);

  // 9. Check is_user_plus function exists
  const r9 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='is_user_plus' AND pronamespace='public'::regnamespace");
  console.log('\n=== is_user_plus function ===');
  console.log('Exists:', r9.rows.length > 0);
  if (r9.rows[0]) {
    console.log('Source:', r9.rows[0].prosrc.substring(0, 300));
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
