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

  // Get a VIP user's planet
  const r1 = await c.query(`
    SELECT ps.user_id, p.username, pl.id as planet_id, pl.name as planet_name
    FROM plus_subscriptions ps 
    JOIN profiles p ON p.id = ps.user_id 
    JOIN planets pl ON pl.user_id = ps.user_id
    WHERE ps.is_active = true AND ps.expires_at > now() 
    AND p.username != 'admin'
    LIMIT 1
  `);
  
  if (r1.rows.length === 0) {
    console.log('No VIP users found');
    await c.end();
    return;
  }

  const { user_id, username, planet_id, planet_name } = r1.rows[0];
  console.log(`=== Testing VIP user: ${username}, planet: ${planet_name} ===\n`);

  // 1. Check is_user_plus
  const r2 = await c.query("SELECT is_user_plus($1) as is_vip", [user_id]);
  console.log('is_user_plus:', r2.rows[0]?.is_vip);

  // 2. Get officer bonuses  
  const r3 = await c.query("SELECT get_user_officer_bonuses($1) as bonuses", [user_id]);
  console.log('officer_bonuses:', JSON.stringify(r3.rows[0]?.bonuses));

  // 3. Call calculate_planet_resources
  const r4 = await c.query("SELECT calculate_planet_resources($1) as result", [planet_id]);
  const result = r4.rows[0]?.result;
  console.log('\ncalculate_planet_resources result:');
  console.log('  metal_per_hour:', result?.metal_per_hour);
  console.log('  crystal_per_hour:', result?.crystal_per_hour);
  console.log('  deuterium_per_hour:', result?.deuterium_per_hour);

  // 4. Get stored per_hour values
  const r5 = await c.query("SELECT metal_per_hour, crystal_per_hour, deuterium_per_hour, last_update FROM planet_resources WHERE planet_id = $1", [planet_id]);
  console.log('\nStored in planet_resources:');
  console.log('  metal_per_hour:', r5.rows[0]?.metal_per_hour);
  console.log('  crystal_per_hour:', r5.rows[0]?.crystal_per_hour);
  console.log('  deuterium_per_hour:', r5.rows[0]?.deuterium_per_hour);
  console.log('  last_update:', r5.rows[0]?.last_update);

  // 5. Get mine levels to manually verify calculation
  const r6 = await c.query(`
    SELECT bt.code, pb.level FROM planet_buildings pb 
    JOIN building_types bt ON bt.id = pb.building_type_id 
    WHERE pb.planet_id = $1 
    AND bt.code IN ('metal_mine', 'crystal_mine', 'deuterium_synthesizer')
    ORDER BY bt.code
  `, [planet_id]);
  console.log('\nMine levels:');
  r6.rows.forEach(r => console.log(`  ${r.code}: level ${r.level}`));

  // 6. Manual calculation WITHOUT VIP
  const resourceSpeed = 10; // default
  for (const mine of r6.rows) {
    let base;
    if (mine.code === 'metal_mine') base = 30;
    else if (mine.code === 'crystal_mine') base = 20;
    else base = 10;
    
    const baseProduction = Math.floor(base * mine.level * Math.pow(1.1, mine.level));
    const withGeologist = r3.rows[0]?.bonuses?.mineProduction || 0;
    const withoutVIP = Math.floor(baseProduction * (1 + withGeologist));
    const withVIP = Math.floor(baseProduction * (1 + withGeologist + 0.1));
    console.log(`\n  ${mine.code} (L${mine.level}):`);
    console.log(`    base: ${baseProduction}`);
    console.log(`    without VIP (geologist ${withGeologist}): ${withoutVIP} * ${resourceSpeed} = ${withoutVIP * resourceSpeed}/h`);
    console.log(`    with VIP (+0.1): ${withVIP} * ${resourceSpeed} = ${withVIP * resourceSpeed}/h`);
  }

  // 7. Now check a NON-VIP user with similar mine levels for comparison
  const r7 = await c.query(`
    SELECT p.username, pl.id as planet_id
    FROM profiles p 
    JOIN planets pl ON pl.user_id = p.id
    LEFT JOIN plus_subscriptions ps ON ps.user_id = p.id AND ps.is_active = true AND ps.expires_at > now()
    WHERE ps.id IS NULL
    AND p.username != 'admin'
    LIMIT 1
  `);
  if (r7.rows.length > 0) {
    const nonVipPlanet = r7.rows[0].planet_id;
    const r8 = await c.query("SELECT calculate_planet_resources($1) as result", [nonVipPlanet]);
    console.log(`\n=== Non-VIP user: ${r7.rows[0].username} ===`);
    console.log('  metal_per_hour:', r8.rows[0]?.result?.metal_per_hour);
  }

  // 8. Look at which migration overwrote secure_add_to_shipyard_queue
  // Check the v_game_speed line area - the VIP bonus should come after the END IF; block
  const r9 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace");
  const shipSrc = r9.rows[0]?.prosrc || '';
  const shipLines = shipSrc.split('\n');
  console.log('\n=== secure_add_to_shipyard_queue: Lines 145-175 ===');
  shipLines.slice(144, 175).forEach((l, i) => console.log(`${145+i}: ${l}`));

  // 9. Check what the frontend uses to display resources
  // The frontend likely calls sync_planet_resources or calculate_and_sync_resources RPC

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
