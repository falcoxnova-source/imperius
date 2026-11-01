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

  const userId = '361fbc06-8d5b-41c5-8e76-e3afee01f342'; // Zeratul
  const acsId = '2758afc0-f3e8-4be1-8b43-eaa32cf80b54';

  console.log('=== CURRENT DB TIME ===');
  const now = await c.query('SELECT NOW()');
  console.log(now.rows[0].now);

  console.log('\n=== ACTIVE FLEETS (ZERATUL) ===');
  const fleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_acs, f.acs_id, f.is_returning, f.is_completed,
           f.departure_time, f.arrival_time, f.return_time,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND f.is_completed = false
    ORDER BY f.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(fleets.rows, null, 2));

  console.log('\n=== SHIPS IN EACH ACTIVE FLEET ===');
  for (const f of fleets.rows) {
    const ships = await c.query(`
      SELECT st.code, st.name, fs.quantity
      FROM fleet_ships fs
      JOIN ship_types st ON st.id = fs.ship_type_id
      WHERE fs.fleet_id = $1
      ORDER BY fs.quantity DESC
    `, [f.id]);
    console.log(`\nFleet ${f.id} [${f.mission_type}] ${f.origin} -> ${f.target} | ACS=${f.is_acs}`);
    console.log(JSON.stringify(ships.rows, null, 2));
  }

  console.log('\n=== ACS-f6b8933c participants and fleets ===');
  const parts = await c.query(`
    SELECT ap.acs_id, ap.fleet_id, ap.user_id, pr.username
    FROM acs_participants ap
    LEFT JOIN profiles pr ON pr.id = ap.user_id
    WHERE ap.acs_id = $1
    ORDER BY ap.joined_at
  `, [acsId]);
  console.log(JSON.stringify(parts.rows, null, 2));

  const acsFleets = await c.query(`
    SELECT f.id, f.user_id, pr.username, f.mission_type, f.is_acs, f.acs_id,
           f.is_completed, f.is_returning,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target
    FROM fleets f
    LEFT JOIN profiles pr ON pr.id = f.user_id
    WHERE f.acs_id = $1
  `, [acsId]);
  console.log(JSON.stringify(acsFleets.rows, null, 2));

  console.log('\n=== CHECK suspect fleet near ACS time (22:08) ===');
  const suspect = await c.query(`
    SELECT id, mission_type, is_acs, acs_id, is_completed, is_returning,
           departure_time, arrival_time, return_time,
           target_galaxy || ':' || target_system || ':' || target_position as target
    FROM fleets
    WHERE user_id = $1
      AND created_at BETWEEN '2026-03-15T21:30:00Z' AND '2026-03-15T22:20:00Z'
    ORDER BY created_at
  `, [userId]);
  console.log(JSON.stringify(suspect.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
