const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // 1. Get the LIVE phalanx_scan function source
  const func = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'phalanx_scan'`);
  if (func.rows.length === 0) {
    console.log('❌ phalanx_scan function NOT FOUND in database!');
    await client.end();
    return;
  }
  console.log('=== LIVE phalanx_scan function ===');
  console.log(func.rows[0].prosrc);
  
  // 2. Check function signature
  const sig = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) as args,
           p.prosecdef as security_definer,
           pg_get_function_result(p.oid) as returns
    FROM pg_proc p WHERE p.proname = 'phalanx_scan'
  `);
  console.log('\n=== Function signature ===');
  console.log(sig.rows);
  
  // 3. Check who has phalanx built
  const phalanx = await client.query(`
    SELECT pr.username, p.name, p.galaxy, p.solar_system, p.position, pb.level,
      POWER(pb.level, 2) - 1 as range
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id AND bt.code = 'sensor_phalanx'
    JOIN planets p ON p.id = pb.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    WHERE pb.level > 0
    ORDER BY pb.level DESC
  `);
  console.log('\n=== Players with Sensor Phalanx ===');
  phalanx.rows.forEach(r => {
    console.log(`  ${r.username} | ${r.name} [${r.galaxy}:${r.solar_system}:${r.position}] | Level ${r.level} | Range: ${r.range} systems`);
  });
  
  // 4. Check RLS policies on fleets table that might block phalanx
  const rls = await client.query(`
    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as qual,
           pg_get_expr(polwithcheck, polrelid) as with_check
    FROM pg_policy
    WHERE polrelid = 'fleets'::regclass
  `);
  console.log('\n=== RLS policies on fleets table ===');
  rls.rows.forEach(r => console.log(r));
  
  // 5. Check if SECURITY DEFINER is set (important for bypassing RLS)
  const secdef = await client.query(`
    SELECT prosecdef FROM pg_proc WHERE proname = 'phalanx_scan'
  `);
  console.log('\n=== Security Definer? ===', secdef.rows[0]?.prosecdef);
  
  // 6. Check if any recent migration might have dropped/recreated the function
  // Check grants
  const grants = await client.query(`
    SELECT has_function_privilege('authenticated', 'phalanx_scan(uuid, integer, integer, integer)', 'execute') as can_execute
  `);
  console.log('\n=== Can authenticated role execute phalanx_scan? ===', grants.rows[0]?.can_execute);

  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
