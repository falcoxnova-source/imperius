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
  console.log('Connected to database.\n');

  // a) Ship types - first discover columns
  console.log('=== A) SHIP TYPES COLUMNS ===');
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ship_types' ORDER BY ordinal_position
  `);
  console.log('Columns:', cols.rows.map(r => r.column_name).join(', '));

  console.log('\n=== A) SHIP TYPES ===');
  const shipTypes = await client.query(`
    SELECT * FROM ship_types ORDER BY id
  `);
  console.table(shipTypes.rows);

  // b) Bot ships count per bot
  console.log('\n=== B) BOT SHIPS COUNT PER BOT ===');
  const botShips = await client.query(`
    SELECT p.username, ps.ship_type_id, st.code, ps.quantity
    FROM planet_ships ps
    JOIN planets pl ON pl.id = ps.planet_id
    JOIN profiles p ON p.id = pl.user_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE p.is_bot = true AND ps.quantity > 0
    ORDER BY p.username, ps.ship_type_id
    LIMIT 60
  `);
  console.table(botShips.rows);

  // c) Bot resources
  console.log('\n=== C) BOT RESOURCES ===');
  const botRes = await client.query(`
    SELECT p.username, pr.metal, pr.crystal, pr.deuterium
    FROM planet_resources pr
    JOIN planets pl ON pl.id = pr.planet_id
    JOIN profiles p ON p.id = pl.user_id
    WHERE p.is_bot = true
    ORDER BY p.username
    LIMIT 25
  `);
  console.table(botRes.rows);

  // d) Bot technologies - discover schema first
  console.log('\n=== D) user_technologies COLUMNS ===');
  const utCols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'user_technologies' ORDER BY ordinal_position
  `);
  console.log('Columns:', utCols.rows.map(r => r.column_name).join(', '));

  console.log('\n=== D) BOT TECHNOLOGIES ===');
  const botTech = await client.query(`
    SELECT p.username, tt.code, ut.level, ut.is_researching, ut.research_end_time
    FROM user_technologies ut
    JOIN profiles p ON p.id = ut.user_id
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE p.is_bot = true AND ut.level > 0
    ORDER BY p.username, tt.code
    LIMIT 80
  `);
  console.table(botTech.rows);

  // e) Active fleets per bot
  console.log('\n=== E) BOT ACTIVE FLEETS ===');
  const activeFleets = await client.query(`
    SELECT p.username, COUNT(f.id) as active_fleets
    FROM profiles p
    LEFT JOIN fleets f ON f.user_id = p.id AND f.is_completed = false
    WHERE p.is_bot = true
    GROUP BY p.username
    ORDER BY p.username
  `);
  console.table(activeFleets.rows);

  // f) Fleet speed setting
  console.log('\n=== F) FLEET SPEED SETTING ===');
  const fleetSpeed = await client.query(`
    SELECT fleet_speed FROM admin_speed_settings LIMIT 1
  `);
  console.table(fleetSpeed.rows);

  // g) get_fleet_speed function source
  console.log('\n=== G) get_fleet_speed FUNCTION SOURCE ===');
  const fnSrc = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'get_fleet_speed'
  `);
  if (fnSrc.rows.length > 0) {
    console.log(fnSrc.rows[0].prosrc);
  } else {
    console.log('Function get_fleet_speed NOT FOUND');
  }

  await client.end();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
