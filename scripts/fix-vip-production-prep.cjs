const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1) Verify: calculate_and_sync_resources_internal - does it calculate production independently?
  console.log('=== calculate_and_sync_resources_internal ===');
  const fn1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_and_sync_resources_internal' LIMIT 1");
  if (fn1.rows.length) {
    const src = fn1.rows[0].prosrc;
    console.log('Calls calculate_planet_resources:', src.includes('calculate_planet_resources'));
    console.log('Has its own mine_bonus:', src.includes('mine_bonus'));
    if (!src.includes('calculate_planet_resources')) {
      // It does its own calculation - show relevant parts
      const idx = src.indexOf('mine_bonus');
      if (idx > -1) console.log(src.substring(Math.max(0, idx-200), idx+400));
    } else {
      console.log('(delegates to calculate_planet_resources - will inherit the fix)');
    }
  }

  // 2) Get the EXACT current function signature and attributes of calculate_planet_resources
  console.log('\n=== calculate_planet_resources metadata ===');
  const meta = await c.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as result_type, 
           p.provolatile, p.prosecdef, p.proisstrict
    FROM pg_proc p WHERE p.proname = 'calculate_planet_resources' LIMIT 1
  `);
  console.log(meta.rows[0]);

  // 3) Get the EXACT source around the mine_bonus assignment to make a precise replacement
  const fn2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_planet_resources' LIMIT 1");
  const src = fn2.rows[0].prosrc;
  
  // Find the exact section to modify
  const searchStr = "v_mine_bonus := COALESCE((v_officer_bonuses->>'mineProduction')::numeric, 0);\nv_energy_bonus";
  const idx = src.indexOf("v_mine_bonus := COALESCE");
  if (idx > -1) {
    console.log('\n=== EXACT section to modify (pos ' + idx + ') ===');
    console.log('---START---');
    console.log(src.substring(idx, idx + 200));
    console.log('---END---');
  }

  // 4) Get a VIP user with homeworld to test after fix
  console.log('\n=== VIP test user data ===');
  const testData = await c.query(`
    SELECT pr2.username, p.id as planet_id, p.name, 
           res.metal_per_hour, res.crystal_per_hour, res.deuterium_per_hour
    FROM plus_subscriptions ps
    JOIN profiles pr2 ON pr2.id = ps.user_id
    JOIN planets p ON p.user_id = ps.user_id
    JOIN planet_resources res ON res.planet_id = p.id
    WHERE ps.is_active = true AND ps.expires_at > now()
    ORDER BY res.metal_per_hour DESC
    LIMIT 3
  `);
  for (const r of testData.rows) {
    console.log(`  ${r.username} - ${r.name}: metal=${r.metal_per_hour}/h, crystal=${r.crystal_per_hour}/h, deut=${r.deuterium_per_hour}/h (planet_id: ${r.planet_id})`);
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
