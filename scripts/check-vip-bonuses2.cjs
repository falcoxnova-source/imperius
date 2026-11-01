const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1) Get full secure_start_research - focus on time calculation and plus check
  console.log('=== secure_start_research FULL ===');
  const fn1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_start_research' LIMIT 1");
  if (fn1.rows.length) console.log(fn1.rows[0].prosrc);

  // 2) Get fleet_calc_flight_time
  console.log('\n\n=== fleet_calc_flight_time ===');
  const fn2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='fleet_calc_flight_time' LIMIT 1");
  if (fn2.rows.length) console.log(fn2.rows[0].prosrc);

  // 3) Get secure_send_fleet - look for plus/vip flight time bonus
  console.log('\n\n=== secure_send_fleet (plus/vip excerpts) ===');
  const fn3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_send_fleet' LIMIT 1");
  if (fn3.rows.length) {
    const src = fn3.rows[0].prosrc;
    console.log('Contains "plus":', src.includes('plus'));
    console.log('Contains "vip":', src.includes('vip'));
    console.log('Contains "is_user_plus":', src.includes('is_user_plus'));
    // Find flight time section
    const ftIdx = src.indexOf('flight_time');
    if (ftIdx > -1) {
      console.log('\nFlight time section:');
      console.log(src.substring(Math.max(0, ftIdx - 400), ftIdx + 600));
    }
  }

  // 4) Get calculate_planet_resources - check if VIP +10% production is applied
  console.log('\n\n=== calculate_planet_resources (plus/vip excerpts) ===');
  const fn4 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_planet_resources' LIMIT 1");
  if (fn4.rows.length) {
    const src = fn4.rows[0].prosrc;
    console.log('Contains "plus":', src.includes('plus'));
    console.log('Contains "vip":', src.includes('vip'));
    console.log('Contains "is_user_plus":', src.includes('is_user_plus'));
    // Check mine_bonus section
    const bonusIdx = src.indexOf('mine_bonus');
    if (bonusIdx > -1) {
      console.log('\nMine bonus section:');
      console.log(src.substring(Math.max(0, bonusIdx - 200), bonusIdx + 500));
    }
  }

  // 5) Check is_user_plus function
  console.log('\n\n=== is_user_plus ===');
  const fn5 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='is_user_plus' LIMIT 1");
  if (fn5.rows.length) console.log(fn5.rows[0].prosrc);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
