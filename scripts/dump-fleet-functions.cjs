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

  // Get the FULL process_fleet_arrival function source
  console.log('=== FULL process_fleet_arrival SOURCE ===');
  const res1 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'
  `);
  if (res1.rows.length > 0) {
    const lines = res1.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  console.log('\n\n=== FULL secure_send_fleet SOURCE ===');
  const res2 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'secure_send_fleet'
  `);
  if (res2.rows.length > 0) {
    const lines = res2.rows[0].prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
  }

  // Check for recent transport fleets
  console.log('\n\n=== RECENT TRANSPORT FLEETS (last 20) ===');
  const res3 = await client.query(`
    SELECT f.id, f.user_id, f.mission_type, f.is_returning, f.is_completed,
           f.origin_planet_id, f.target_galaxy, f.target_system, f.target_position,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.created_at, f.arrival_time, f.return_time,
           (SELECT json_agg(json_build_object('ship_type_id', fs.ship_type_id, 'quantity', fs.quantity))
            FROM fleet_ships fs WHERE fs.fleet_id = f.id) as ships
    FROM fleets f
    WHERE f.mission_type = 'transport'
    ORDER BY f.created_at DESC
    LIMIT 20
  `);
  console.log(JSON.stringify(res3.rows, null, 2));

  // Check if there are any triggers on fleet_ships or planet_ships
  console.log('\n\n=== TRIGGERS ON fleet_ships ===');
  const res4 = await client.query(`
    SELECT tgname, tgtype, proname
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE c.relname = 'fleet_ships'
  `);
  console.log(JSON.stringify(res4.rows, null, 2));

  console.log('\n\n=== TRIGGERS ON planet_ships ===');
  const res5 = await client.query(`
    SELECT tgname, tgtype, proname
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE c.relname = 'planet_ships'
  `);
  console.log(JSON.stringify(res5.rows, null, 2));

  await client.end();
}

main().catch(console.error);
