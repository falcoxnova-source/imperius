const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Lucifrer's Plus subscription
  const plus = await c.query(`SELECT * FROM plus_subscriptions WHERE user_id='1bd7fd92-96b3-4417-870c-1679e7cbdc0a'`);
  console.log('=== Lucifrer Plus subscriptions ===');
  console.log(JSON.stringify(plus.rows, null, 2));

  // Check Phalanx: frontend interface expects origin_coords/destination_coords but backend returns origin/destination
  // Let's check the PhalanxFleet interface vs what phalanx_scan returns
  console.log('\n=== PHALANX KEY MISMATCH ===');
  console.log('Backend phalanx_scan returns:  origin, destination, ships[{type, quantity}]');
  console.log('Frontend PhalanxFleet expects: origin_coords, destination_coords, ships[{name, quantity}]');
  console.log('This mismatch means fleet data will show EMPTY origin/destination and possibly empty ships!');

  // Check if Lucifrer has a moon with sensor_phalanx
  const moons = await c.query(`
    SELECT p.id, p.name, p.galaxy, p.solar_system, p.position, pb.level as phalanx_level
    FROM planets p
    LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
    LEFT JOIN building_types bt ON pb.building_type_id = bt.id AND bt.code = 'sensor_phalanx'
    WHERE p.user_id = '1bd7fd92-96b3-4417-870c-1679e7cbdc0a'
      AND p.planet_type = 'moon'
  `);
  console.log('\n=== Lucifrer moons ===');
  console.log(moons.rows);

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
