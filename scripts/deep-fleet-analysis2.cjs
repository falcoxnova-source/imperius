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

  // 1. recall_stationed_fleet (different from recall_deployed_fleet!)
  console.log('=== recall_stationed_fleet ===');
  const res1 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'recall_stationed_fleet'
  `);
  if (res1.rows.length > 0) {
    const lines = res1.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  // 2. Check admin_restore_fleet
  console.log('\n=== admin_restore_fleet ===');
  const res2 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'admin_restore_fleet'
  `);
  if (res2.rows.length > 0) {
    const lines = res2.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  // 3. Check the FULL process_fleet_arrival lines 500-560 (transport + deploy)
  console.log('\n=== process_fleet_arrival lines around transport/deploy ===');
  const res3 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'
  `);
  if (res3.rows.length > 0) {
    const lines = res3.rows[0].prosrc.split('\n');
    // Show lines 500-600 (transport + deploy area + some context after)
    for (let i = 499; i < Math.min(620, lines.length); i++) {
      console.log(`${(i+1).toString().padStart(4)}: ${lines[i]}`);
    }
  }

  // 4. Find the player who reported the bug (Gisler?)
  console.log('\n=== Players with transport fleets to own planets (checking for patterns) ===');
  const res4 = await client.query(`
    SELECT 
      f.user_id,
      pr.username,
      COUNT(*) as transport_count,
      COUNT(CASE WHEN f.is_completed THEN 1 END) as completed,
      COUNT(CASE WHEN NOT f.is_completed AND f.is_returning THEN 1 END) as returning,
      COUNT(CASE WHEN NOT f.is_completed AND NOT f.is_returning THEN 1 END) as outbound
    FROM fleets f
    JOIN profiles pr ON f.user_id = pr.id
    WHERE f.mission_type = 'transport'
    AND f.created_at > NOW() - INTERVAL '7 days'
    GROUP BY f.user_id, pr.username
    ORDER BY transport_count DESC
    LIMIT 15
  `);
  console.log(JSON.stringify(res4.rows, null, 2));

  // 5. Check if there's any planet_ships with negative quantities
  console.log('\n=== Planets with NEGATIVE ship quantities ===');
  const res5 = await client.query(`
    SELECT ps.planet_id, p.name, p.galaxy, p.solar_system, p.position, 
           pr.username, ps.ship_type_id, st.name as ship_name, ps.quantity
    FROM planet_ships ps
    JOIN planets p ON ps.planet_id = p.id
    LEFT JOIN profiles pr ON p.user_id = pr.id
    LEFT JOIN ship_types st ON ps.ship_type_id = st.id
    WHERE ps.quantity < 0
    LIMIT 20
  `);
  console.log(JSON.stringify(res5.rows, null, 2));

  await client.end();
}

main().catch(console.error);
