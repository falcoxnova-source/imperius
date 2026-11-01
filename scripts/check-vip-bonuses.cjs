const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1) Check ALL functions that reference "plus" or "vip" for bonus logic
  console.log('=== Functions referencing plus_subscriptions ===');
  const fns1 = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%plus_subscription%' ORDER BY proname");
  console.log(fns1.rows.map(r => r.proname).join('\n'));

  // 2) Check flight time calculation - does it consider VIP?
  console.log('\n=== Functions with flight_time or vuelo ===');
  const fns2 = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%flight_time%' OR prosrc ILIKE '%flight_speed%' OR proname ILIKE '%flight%' OR proname ILIKE '%fleet_speed%' ORDER BY proname");
  console.log(fns2.rows.map(r => r.proname).join('\n'));

  // 3) Check research time calculation - does it consider VIP?
  console.log('\n=== Functions with research_time ===');
  const fns3 = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%research_time%' OR prosrc ILIKE '%research_duration%' OR proname ILIKE '%research%' ORDER BY proname");
  console.log(fns3.rows.map(r => r.proname).join('\n'));

  // 4) Get the officer bonuses function - what does it return?
  console.log('\n=== get_user_officer_bonuses ===');
  const fn4 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='get_user_officer_bonuses' LIMIT 1");
  if (fn4.rows.length) console.log(fn4.rows[0].prosrc);

  // 5) Check the send_fleet / dispatch_fleet function for flight time
  console.log('\n=== Functions with send or dispatch fleet ===');
  const fns5 = await c.query("SELECT proname FROM pg_proc WHERE proname ILIKE '%send%fleet%' OR proname ILIKE '%dispatch%fleet%' OR proname ILIKE '%launch%fleet%' ORDER BY proname");
  console.log(fns5.rows.map(r => r.proname).join('\n'));

  // 6) Check start_research for VIP bonus
  console.log('\n=== secure_start_research (VIP check excerpt) ===');
  const fn6 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_start_research' LIMIT 1");
  if (fn6.rows.length) {
    const src = fn6.rows[0].prosrc;
    // Look for plus/vip references
    const plusIdx = src.indexOf('plus');
    const vipIdx = src.indexOf('vip');
    const timeIdx = src.indexOf('time');
    console.log('Contains "plus":', plusIdx > -1);
    console.log('Contains "vip":', vipIdx > -1);
    // Find the time calculation section
    const researchTimeIdx = src.indexOf('research_time');
    if (researchTimeIdx > -1) {
      console.log('\nResearch time section:');
      console.log(src.substring(Math.max(0, researchTimeIdx - 300), researchTimeIdx + 500));
    }
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
