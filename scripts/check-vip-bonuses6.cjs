const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Get the full build time and VIP section of secure_add_to_building_queue
  const fn = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_building_queue' LIMIT 1");
  const src = fn.rows[0].prosrc;
  
  // Find where build_time is calculated and where is_user_plus is checked
  const plusIdx = src.indexOf('is_user_plus');
  if (plusIdx > -1) {
    console.log('=== VIP section in secure_add_to_building_queue ===');
    console.log(src.substring(Math.max(0, plusIdx - 400), plusIdx + 400));
  }

  // Also find the v_build_time calculation
  const calcIdx = src.indexOf('v_build_time :=');
  if (calcIdx > -1) {
    console.log('\n=== Build time calculation ===');
    console.log(src.substring(calcIdx, calcIdx + 600));
  }

  // Now check calculate_planet_resources more thoroughly - find ALL the mine_bonus usage
  const fn2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_planet_resources' LIMIT 1");
  const src2 = fn2.rows[0].prosrc;

  // Find where production is multiplied by mine_bonus
  const prodIdx = src2.indexOf('v_base_metal_production := FLOOR(v_base_metal_production');
  if (prodIdx > -1) {
    console.log('\n=== Production multiplication in calculate_planet_resources ===');
    console.log(src2.substring(prodIdx, prodIdx + 300));
  }

  // Check if there's a separate VIP bonus being added to mine_bonus
  const bonusSetIdx = src2.indexOf('v_mine_bonus');
  let searchIdx = 0;
  console.log('\n=== All v_mine_bonus references ===');
  while (true) {
    searchIdx = src2.indexOf('v_mine_bonus', searchIdx);
    if (searchIdx === -1) break;
    console.log(`  pos ${searchIdx}: ${src2.substring(searchIdx, searchIdx + 80)}`);
    searchIdx++;
  }

  // Summary of all 3 VIP bonuses
  console.log('\n\n========== SUMMARY ==========');
  console.log('1) -10% research time (VIP): secure_start_research contains is_user_plus =', 
    (await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_start_research' LIMIT 1")).rows[0].prosrc.includes('is_user_plus'));
  console.log('2) -10% flight time (VIP): secure_send_fleet contains is_user_plus =',
    (await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_send_fleet' LIMIT 1")).rows[0].prosrc.includes('is_user_plus'));
  console.log('3) -10% build time (VIP): secure_add_to_building_queue contains is_user_plus =', src.includes('is_user_plus'));
  console.log('4) +10% production (VIP): calculate_planet_resources contains is_user_plus =', src2.includes('is_user_plus'));

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
