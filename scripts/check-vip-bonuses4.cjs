const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Get FULL calculate_planet_resources to look for mine_bonus assignment
  const fn = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_planet_resources' LIMIT 1");
  const src = fn.rows[0].prosrc;

  // Find where mine_bonus is assigned (after officer bonuses)
  const bonusAssignIdx = src.indexOf("v_mine_bonus := COALESCE");
  if (bonusAssignIdx > -1) {
    console.log('=== mine_bonus assignment section ===');
    console.log(src.substring(bonusAssignIdx, bonusAssignIdx + 500));
  }

  // Search for any "plus" or "is_user_plus" anywhere
  console.log('\n=== Searching for plus/vip in calculate_planet_resources ===');
  let idx = 0;
  while (true) {
    idx = src.indexOf('plus', idx);
    if (idx === -1) break;
    console.log(`Found "plus" at position ${idx}: ...${src.substring(Math.max(0,idx-30), idx+50)}...`);
    idx++;
  }
  idx = 0;
  while (true) {
    idx = src.indexOf('vip', idx);
    if (idx === -1) break;
    console.log(`Found "vip" at position ${idx}: ...${src.substring(Math.max(0,idx-30), idx+50)}...`);
    idx++;
  }

  // If no plus found, check if mine_bonus only comes from officers
  const officerIdx = src.indexOf('get_user_officer_bonuses');
  if (officerIdx > -1) {
    console.log('\n=== Officer bonus section ===');
    console.log(src.substring(officerIdx, officerIdx + 400));
  }

  // Check all functions that use is_user_plus
  console.log('\n=== ALL functions calling is_user_plus ===');
  const fns = await c.query("SELECT proname FROM pg_proc WHERE prosrc ILIKE '%is_user_plus%' ORDER BY proname");
  console.log(fns.rows.map(r => r.proname).join('\n'));

  // Check the building time function for VIP bonus
  console.log('\n=== Functions with building_time or construction_time ===');
  const fns2 = await c.query("SELECT proname FROM pg_proc WHERE proname ILIKE '%start_building%' OR proname ILIKE '%queue_building%' OR proname ILIKE '%add_to_building%' ORDER BY proname");
  console.log(fns2.rows.map(r => r.proname).join('\n'));

  // Check the main building queue function for VIP bonus  
  console.log('\n=== secure_start_building or add_to_building_queue ===');
  for (const fname of ['secure_start_building', 'add_to_building_queue', 'start_building', 'queue_building']) {
    const f = await c.query("SELECT prosrc FROM pg_proc WHERE proname=$1 LIMIT 1", [fname]);
    if (f.rows.length) {
      const s = f.rows[0].prosrc;
      console.log(`\n${fname}: contains "plus"=${s.includes('plus')}, "is_user_plus"=${s.includes('is_user_plus')}`);
      // Show time calculation part
      const timeIdx = s.indexOf('build_time');
      if (timeIdx > -1) {
        console.log(s.substring(Math.max(0, timeIdx - 200), timeIdx + 400));
      }
    }
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
