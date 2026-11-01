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

  // 1) Find the user
  console.log('=== 1) PLAYER INFO ===');
  const user = await c.query(`
    SELECT id, username, email, created_at 
    FROM profiles 
    WHERE LOWER(email) = 'emanuelores1992@gmail.com'
  `);
  if (!user.rows.length) { console.log('USER NOT FOUND'); await c.end(); return; }
  const u = user.rows[0];
  console.log(u);
  const userId = u.id;

  // 2) Find all planets/colonies
  console.log('\n=== 2) PLANETS & COLONIES ===');
  const planets = await c.query(`
    SELECT id, name, galaxy, solar_system, position, planet_type, is_main_planet,
           metal, crystal, deuterium,
           created_at
    FROM planets
    WHERE owner_id = $1
    ORDER BY is_main_planet DESC, created_at ASC
  `, [userId]);
  planets.rows.forEach((p, i) => {
    console.log(`  [${i}] ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}] ${p.is_main_planet ? '(MAIN)' : '(colony)'} | M:${p.metal} C:${p.crystal} D:${p.deuterium}`);
  });

  // 3) Check fleet table schema
  console.log('\n=== 3) FLEET TABLE COLUMNS ===');
  const cols = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'fleets' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

  // 4) Recent fleet missions for this user (last 48h)
  console.log('\n=== 4) RECENT FLEET MISSIONS (last 48h) ===');
  const fleets = await c.query(`
    SELECT f.id, f.mission_type, f.status, 
           f.departure_time, f.arrival_time, f.return_time,
           sp.name as source_name, sp.galaxy as sg, sp.solar_system as ss, sp.position as sp2,
           tp.name as target_name, tp.galaxy as tg, tp.solar_system as ts, tp.position as tp2,
           f.metal, f.crystal, f.deuterium,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.ships, f.returning, f.is_return_trip
    FROM fleets f
    LEFT JOIN planets sp ON f.source_planet_id = sp.id
    LEFT JOIN planets tp ON f.target_planet_id = tp.id
    WHERE f.user_id = $1
      AND f.departure_time >= NOW() - INTERVAL '48 hours'
    ORDER BY f.departure_time DESC
  `, [userId]);
  
  if (!fleets.rows.length) {
    console.log('No fleets found in last 48h');
  } else {
    fleets.rows.forEach(f => {
      console.log(`\n  Fleet ${f.id.substring(0,8)}...`);
      console.log(`    Mission: ${f.mission_type} | Status: ${f.status} | Return: ${f.returning} | IsReturn: ${f.is_return_trip}`);
      console.log(`    From: ${f.source_name} [${f.sg}:${f.ss}:${f.sp2}] → To: ${f.target_name} [${f.tg}:${f.ts}:${f.tp2}]`);
      console.log(`    Depart: ${f.departure_time} | Arrive: ${f.arrival_time} | ReturnAt: ${f.return_time}`);
      console.log(`    Resources: M:${f.metal} C:${f.crystal} D:${f.deuterium}`);
      console.log(`    Cargo: M:${f.cargo_metal} C:${f.cargo_crystal} D:${f.cargo_deuterium}`);
      console.log(`    Ships: ${JSON.stringify(f.ships)}`);
    });
  }

  // 5) Check if there's a fleet_events or fleet_logs table
  console.log('\n=== 5) FLEET-RELATED TABLES ===');
  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name ILIKE '%fleet%' OR table_name ILIKE '%mission%')
    ORDER BY table_name
  `);
  console.log(tables.rows.map(r => r.table_name));

  // 6) Also check wider range - last 7 days, transport/deploy missions only
  console.log('\n=== 6) TRANSPORT/DEPLOY MISSIONS (last 7 days) ===');
  const transports = await c.query(`
    SELECT f.id, f.mission_type, f.status,
           f.departure_time, f.arrival_time,
           sp.name as source_name, tp.name as target_name,
           f.metal, f.crystal, f.deuterium,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.ships, f.returning, f.is_return_trip
    FROM fleets f
    LEFT JOIN planets sp ON f.source_planet_id = sp.id
    LEFT JOIN planets tp ON f.target_planet_id = tp.id
    WHERE f.user_id = $1
      AND f.departure_time >= NOW() - INTERVAL '7 days'
      AND f.mission_type IN ('transport', 'deploy', 'colonize', 'harvest', 3, 4)
    ORDER BY f.departure_time DESC
    LIMIT 30
  `, [userId]);
  
  if (!transports.rows.length) {
    console.log('No transport/deploy missions found');
    // Try all missions
    const all = await c.query(`
      SELECT DISTINCT mission_type FROM fleets WHERE user_id = $1 AND departure_time >= NOW() - INTERVAL '7 days'
    `, [userId]);
    console.log('Available mission types:', all.rows.map(r => r.mission_type));
  } else {
    transports.rows.forEach(f => {
      console.log(`  ${f.mission_type} | ${f.source_name} → ${f.target_name} | M:${f.metal} C:${f.crystal} D:${f.deuterium} | cargo M:${f.cargo_metal} C:${f.cargo_crystal} D:${f.cargo_deuterium} | status:${f.status} ret:${f.returning}`);
    });
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
