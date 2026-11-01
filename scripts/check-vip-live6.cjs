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

  // 1. Get ALL overloads of calculate_and_sync_resources
  const r1 = await c.query(`
    SELECT p.proname, p.pronargs, pg_get_function_arguments(p.oid) as args, 
           length(p.prosrc) as src_length, p.prosrc
    FROM pg_proc p 
    WHERE p.proname LIKE 'calculate_and_sync_resources%' 
    AND p.pronamespace = 'public'::regnamespace
    ORDER BY p.pronargs
  `);
  console.log('=== calculate_and_sync_resources overloads ===');
  for (const row of r1.rows) {
    console.log(`\n--- ${row.proname}(${row.args}) [${row.src_length} chars] ---`);
    console.log('Calls calculate_planet_resources:', row.prosrc.includes('calculate_planet_resources'));
    console.log('Has VIP:', row.prosrc.includes('is_user_plus') || row.prosrc.includes('VIP'));
    console.log('Has mine_bonus:', row.prosrc.includes('mine_bonus'));
    // Print first 80 lines
    const lines = row.prosrc.split('\n');
    if (lines.length < 100) {
      console.log(row.prosrc);
    } else {
      lines.slice(0, 80).forEach((l, i) => console.log(`${i+1}: ${l}`));
    }
  }

  // 2. Check which functions secure_add_to_building_queue, secure_send_fleet, etc. call for resource sync
  for (const fname of ['secure_add_to_building_queue', 'secure_send_fleet', 'process_fleet_arrival', 'galaxy_navigate']) {
    const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace", [fname]);
    if (r.rows.length > 0) {
      const src = r.rows[0].prosrc;
      const syncCalls = [];
      if (src.includes('calculate_and_sync_resources')) syncCalls.push('calculate_and_sync_resources');
      if (src.includes('calculate_and_sync_resources_internal')) syncCalls.push('calculate_and_sync_resources_internal');
      if (src.includes('sync_planet_resources')) syncCalls.push('sync_planet_resources');
      if (src.includes('update_planet_resources')) syncCalls.push('update_planet_resources');
      if (src.includes('calculate_planet_resources')) syncCalls.push('calculate_planet_resources');
      console.log(`\n${fname} calls: ${syncCalls.join(', ') || 'NONE'}`);
    }
  }

  // 3. Test with a real VIP user - compare production with and without VIP
  const r3 = await c.query(`
    SELECT ps.user_id, p.username
    FROM plus_subscriptions ps 
    JOIN profiles p ON p.id = ps.user_id 
    WHERE ps.is_active = true AND ps.expires_at > now() 
    AND p.username != 'admin'
    LIMIT 1
  `);
  if (r3.rows.length > 0) {
    const userId = r3.rows[0].user_id;
    const username = r3.rows[0].username;
    console.log(`\n=== Testing VIP production for: ${username} ===`);
    
    // Get their homeworld
    const r4 = await c.query("SELECT id FROM planets WHERE user_id = $1 AND is_homeworld = true LIMIT 1", [userId]);
    if (r4.rows.length > 0) {
      const planetId = r4.rows[0].id;
      
      // Call calculate_planet_resources
      const r5 = await c.query("SELECT calculate_planet_resources($1) as result", [planetId]);
      const result = r5.rows[0]?.result;
      console.log('  metal_per_hour:', result?.metal_per_hour);
      console.log('  crystal_per_hour:', result?.crystal_per_hour);
      console.log('  deuterium_per_hour:', result?.deuterium_per_hour);
      
      // Get their officer bonuses to verify
      const r6 = await c.query("SELECT get_user_officer_bonuses($1) as bonuses", [userId]);
      console.log('  officer_bonuses:', JSON.stringify(r6.rows[0]?.bonuses));
      
      // Check is_user_plus
      const r7 = await c.query("SELECT is_user_plus($1) as is_vip", [userId]);
      console.log('  is_user_plus:', r7.rows[0]?.is_vip);
      
      // Get stored per_hour in table
      const r8 = await c.query("SELECT metal_per_hour, crystal_per_hour, deuterium_per_hour FROM planet_resources WHERE planet_id = $1", [planetId]);
      console.log('  Stored metal_per_hour:', r8.rows[0]?.metal_per_hour);
      console.log('  Stored crystal_per_hour:', r8.rows[0]?.crystal_per_hour);
      console.log('  Stored deuterium_per_hour:', r8.rows[0]?.deuterium_per_hour);
    }
  }

  // 4. Check what the frontend calls for resources
  // Look for RPC calls to sync resources
  console.log('\n=== Checking galaxy_navigate for resource sync ===');
  const r9 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='galaxy_navigate' AND pronamespace='public'::regnamespace");
  if (r9.rows.length > 0) {
    const src = r9.rows[0].prosrc;
    if (src.includes('calculate_planet_resources') || src.includes('sync_planet_resources') || src.includes('calculate_and_sync')) {
      console.log('Has resource sync call');
    }
    // Show resource-related lines
    src.split('\n').forEach((l, i) => {
      if (l.includes('resource') || l.includes('sync') || l.includes('calculate')) {
        console.log(`  L${i+1}: ${l.trim()}`);
      }
    });
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
