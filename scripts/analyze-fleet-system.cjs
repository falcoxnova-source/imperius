const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await c.connect();

  // 1. Get validate_fleet_mission current body
  console.log('=== validate_fleet_mission ===');
  const { rows: vfm } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'validate_fleet_mission' AND pronamespace = 'public'::regnamespace ORDER BY pronargs DESC LIMIT 1`);
  console.log(vfm[0]?.prosrc?.substring(0, 3000));

  // 2. Get secure_send_fleet first 30 lines to see auth.uid usage
  console.log('\n\n=== secure_send_fleet (first 800 chars) ===');
  const { rows: ssf } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'secure_send_fleet' AND pronamespace = 'public'::regnamespace LIMIT 1`);
  console.log(ssf[0]?.prosrc?.substring(0, 800));

  // 3. fleet_calc_distance 
  console.log('\n\n=== fleet_calc_distance ===');
  const { rows: fcd } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'fleet_calc_distance'`);
  console.log(fcd[0]?.prosrc);

  // 4. fleet_calc_slowest_speed
  console.log('\n\n=== fleet_calc_slowest_speed ===');
  const { rows: fcs } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'fleet_calc_slowest_speed'`);
  console.log(fcs[0]?.prosrc);

  // 5. Check if validate_fleet_mission checks protection for bots
  const src = vfm[0]?.prosrc || '';
  console.log('\n\n=== KEY CHECKS ===');
  console.log('Has protection check:', src.includes('protection') || src.includes('noob'));
  console.log('Has vacation check:', src.includes('vacation'));
  console.log('Has bashing check:', src.includes('bashing'));
  console.log('Has is_bot check:', src.includes('is_bot'));

  await c.end();
}

main().catch(e => console.error(e));
