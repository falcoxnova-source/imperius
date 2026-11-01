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
  const mainPlanetId = '8e18ccae-caf4-400a-be01-b884eae96090'; // [1:332:13]

  // 1. Current complete ship inventory on planets
  console.log('=== CURRENT SHIP INVENTORY ON PLANETS ===');
  const inv = await c.query(`
    SELECT p.galaxy || ':' || p.solar_system || ':' || p.position as coords,
           p.name, st.code, ps.quantity
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE p.user_id = $1 AND ps.quantity > 0
    ORDER BY p.galaxy, p.solar_system, p.position, st.code
  `, [userId]);
  for (const row of inv.rows) {
    console.log(`  [${row.coords}] ${row.name}: ${row.code} = ${row.quantity}`);
  }

  // 2. Ships in active fleets
  console.log('\n=== SHIPS IN ACTIVE FLEETS ===');
  const fleetShips = await c.query(`
    SELECT f.id, f.mission_type, 
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.is_returning, f.arrival_time,
           st.code, fs.quantity
    FROM fleet_ships fs
    JOIN fleets f ON f.id = fs.fleet_id
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE f.user_id = $1 AND f.is_completed = false
    ORDER BY f.id, st.code
  `, [userId]);
  for (const row of fleetShips.rows) {
    console.log(`  Fleet ${row.id.substring(0,8)} | ${row.mission_type} -> ${row.target} | ret:${row.is_returning} | arr:${row.arrival_time} | ${row.code} = ${row.quantity}`);
  }

  // 3. Check fleet 6869bc07 specifically - did it complete successfully?
  console.log('\n=== FLEET 6869bc07 STATUS ===');
  const fleet = await c.query(`
    SELECT f.*, p.galaxy || ':' || p.solar_system || ':' || p.position as origin_coords
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.id = '6869bc07-d9e4-4c9b-ad4e-5dc3b3f8f8fd'
  `);
  if (fleet.rows.length > 0) {
    const f = fleet.rows[0];
    console.log(`  mission: ${f.mission_type}, completed: ${f.is_completed}, returning: ${f.is_returning}`);
    console.log(`  origin: ${f.origin_coords}, target: ${f.target_galaxy}:${f.target_system}:${f.target_position}`);
    console.log(`  created: ${f.created_at}, arrival: ${f.arrival_time}`);
    console.log(`  cargo: metal=${f.cargo_metal}, crystal=${f.cargo_crystal}, deut=${f.cargo_deuterium}`);
  }

  // 4. Check fleet_ships for that fleet (should be null/empty if completed)
  const fs6869 = await c.query(`
    SELECT fs.*, st.code FROM fleet_ships fs 
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE fs.fleet_id = '6869bc07-d9e4-4c9b-ad4e-5dc3b3f8f8fd'
  `);
  console.log(`  fleet_ships remaining: ${fs6869.rowCount}`);
  for (const r of fs6869.rows) console.log(`    ${r.code} = ${r.quantity}`);

  // 5. Check messages for Zeratul - maybe combat reports or fleet returns
  console.log('\n=== MESSAGES COLUMNS ===');
  const msgCols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'messages'
    ORDER BY ordinal_position
  `);
  console.log(msgCols.rows.map(r => r.column_name).join(', '));

  // 6. Search messages for large_cargo or combat
  console.log('\n=== RECENT MESSAGES FOR ZERATUL ===');
  const msgs = await c.query(`
    SELECT id, type, subject, created_at,
           CASE WHEN LENGTH(body::text) > 200 THEN LEFT(body::text, 200) || '...' ELSE body::text END as body_preview
    FROM messages
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 30
  `, [userId]);
  for (const m of msgs.rows) {
    console.log(`  [${m.created_at}] type:${m.type} subj:${m.subject}`);
    console.log(`    body: ${m.body_preview}`);
  }

  // 7. Search for any battle reports involving Zeratul as attacker
  console.log('\n=== BATTLE REPORTS WHERE ZERATUL IS ATTACKER ===');
  const brAtk = await c.query(`
    SELECT id, attacker_id, defender_id, winner, created_at,
           attacker_losses, defender_losses
    FROM battle_reports 
    WHERE attacker_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [userId]);
  console.log('Count:', brAtk.rowCount);
  for (const r of brAtk.rows) {
    console.log(`  ${r.id.substring(0,8)} | winner: ${r.winner} | ${r.created_at}`);
    console.log(`    atk_losses: ${JSON.stringify(r.attacker_losses)}`);
    console.log(`    def_losses: ${JSON.stringify(r.defender_losses)}`);
  }

  // 8. Grand total
  console.log('\n=== GRAND TOTAL SHIPS ===');
  const total = await c.query(`
    WITH planet_inv AS (
      SELECT st.code, SUM(ps.quantity) as qty
      FROM planet_ships ps
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE ps.planet_id IN (SELECT id FROM planets WHERE user_id = $1)
      GROUP BY st.code
    ),
    fleet_inv AS (
      SELECT st.code, SUM(fs.quantity) as qty
      FROM fleet_ships fs
      JOIN fleets f ON f.id = fs.fleet_id
      JOIN ship_types st ON st.id = fs.ship_type_id
      WHERE f.user_id = $1 AND f.is_completed = false
      GROUP BY st.code
    )
    SELECT COALESCE(p.code, f.code) as code,
           COALESCE(p.qty, 0) as planets,
           COALESCE(f.qty, 0) as fleets,
           COALESCE(p.qty, 0) + COALESCE(f.qty, 0) as total
    FROM planet_inv p FULL OUTER JOIN fleet_inv f ON f.code = p.code
    WHERE COALESCE(p.qty, 0) + COALESCE(f.qty, 0) > 0
    ORDER BY code
  `, [userId]);
  for (const r of total.rows) {
    console.log(`  ${r.code}: ${r.planets} planets + ${r.fleets} fleets = ${r.total} total`);
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
