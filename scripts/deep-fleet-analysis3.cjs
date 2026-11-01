const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // 1. Check old send_fleet function
  console.log('=== OLD send_fleet FUNCTION ===');
  const res1 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'send_fleet'
  `);
  if (res1.rows.length > 0) {
    const lines = res1.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  // 2. Check if send_fleet is callable via RPC (check policies)
  console.log('\n=== Is send_fleet still accessible? ===');
  const res2 = await client.query(`
    SELECT p.proname, n.nspname, p.prosecdef,
           has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_can_execute
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname IN ('send_fleet', 'secure_send_fleet')
    AND n.nspname = 'public'
  `);
  console.log(JSON.stringify(res2.rows, null, 2));

  // 3. Check for any completed transport where origin != target owner 
  // (to check if transport to ALLIED planet has different behavior)
  console.log('\n=== Transport to OTHER player planets (last 7 days) ===');
  const res3 = await client.query(`
    SELECT f.id, f.user_id, pr.username as sender,
           p_target.user_id as target_owner, pr2.username as target_owner_name,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target_coords,
           f.is_completed, f.is_returning,
           f.created_at
    FROM fleets f
    JOIN profiles pr ON f.user_id = pr.id
    JOIN planets p_target ON p_target.galaxy = f.target_galaxy 
      AND p_target.solar_system = f.target_system 
      AND p_target.position = f.target_position
      AND p_target.planet_type = COALESCE(f.target_type, 'planet')
    LEFT JOIN profiles pr2 ON p_target.user_id = pr2.id
    WHERE f.mission_type = 'transport'
    AND p_target.user_id != f.user_id
    AND f.created_at > NOW() - INTERVAL '7 days'
    ORDER BY f.created_at DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(res3.rows, null, 2));

  // 4. Check for any active (non-completed) transport fleets where fleet_ships 
  // quantity doesn't match what was originally sent
  // We can check active fleets to see if their fleet_ships look normal
  console.log('\n=== Active transport fleet_ships analysis ===');
  const res4 = await client.query(`
    SELECT f.id, pr.username, f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           fs.ship_type_id, st.name as ship_name, fs.quantity,
           f.is_returning, f.created_at
    FROM fleets f
    JOIN fleet_ships fs ON fs.fleet_id = f.id
    JOIN ship_types st ON fs.ship_type_id = st.id
    JOIN profiles pr ON f.user_id = pr.id
    WHERE f.mission_type = 'transport'
    AND f.is_completed = false
    ORDER BY f.created_at DESC
    LIMIT 30
  `);
  console.log(JSON.stringify(res4.rows, null, 2));

  // 5. Check which player "Gisler" is
  console.log('\n=== Player Gisler ===');
  const res5 = await client.query(`
    SELECT id, username FROM profiles WHERE username ILIKE '%gisler%'
  `);
  console.log(JSON.stringify(res5.rows, null, 2));

  await client.end();
}

main().catch(console.error);
