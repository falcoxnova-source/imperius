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

  // 1. Check attack_log for anything involving Zeratul
  console.log('=== ATTACK_LOG COLUMNS ===');
  const alCols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'attack_log' ORDER BY ordinal_position
  `);
  console.log(alCols.rows.map(r => r.column_name).join(', '));

  console.log('\n=== ATTACK_LOG INVOLVING ZERATUL ===');
  const al = await c.query(`
    SELECT * FROM attack_log 
    WHERE attacker_id = $1 OR defender_id = $1
    ORDER BY attack_time DESC
    LIMIT 20
  `, [userId]);
  console.log(JSON.stringify(al.rows, null, 2));

  // 2. Check fleet_restoration_log
  console.log('\n=== FLEET_RESTORATION_LOG COLUMNS ===');
  const frlCols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'fleet_restoration_log' ORDER BY ordinal_position
  `);
  console.log(frlCols.rows.map(r => r.column_name).join(', '));

  console.log('\n=== FLEET_RESTORATION_LOG FOR ZERATUL ===');
  const frl = await c.query(`
    SELECT * FROM fleet_restoration_log 
    WHERE fleet_id IN (SELECT id FROM fleets WHERE user_id = $1)
    ORDER BY restored_at DESC
    LIMIT 20
  `, [userId]);
  console.log(JSON.stringify(frl.rows, null, 2));

  // 3. Check ALL fleets ever for Zeratul - completed or not
  console.log('\n=== ALL FLEETS FOR ZERATUL (COMPLETED) ===');
  const allFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_completed, f.is_returning,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.created_at, f.arrival_time,
           (SELECT json_agg(json_build_object('ship', st.code, 'qty', fs.quantity))
            FROM fleet_ships fs JOIN ship_types st ON st.id = fs.ship_type_id
            WHERE fs.fleet_id = f.id) as ships
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND f.is_completed = true
    ORDER BY f.created_at DESC
    LIMIT 30
  `, [userId]);
  for (const f of allFleets.rows) {
    console.log(`  ${f.id.substring(0,8)} | ${f.mission_type} | ${f.origin}->${f.target} | created: ${f.created_at} | ships: ${JSON.stringify(f.ships)}`);
  }

  // 4. Check ACTIVE fleets
  console.log('\n=== ALL ACTIVE FLEETS FOR ZERATUL ===');
  const activeFleets = await c.query(`
    SELECT f.id, f.mission_type, f.is_completed, f.is_returning,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.created_at, f.arrival_time,
           (SELECT json_agg(json_build_object('ship', st.code, 'qty', fs.quantity))
            FROM fleet_ships fs JOIN ship_types st ON st.id = fs.ship_type_id
            WHERE fs.fleet_id = f.id) as ships
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND f.is_completed = false
    ORDER BY f.created_at DESC
  `, [userId]);
  for (const f of activeFleets.rows) {
    console.log(`  ${f.id.substring(0,8)} | ${f.mission_type} | ${f.origin}->${f.target} | ret:${f.is_returning} | arr: ${f.arrival_time} | ships: ${JSON.stringify(f.ships)}`);
  }

  // 5. Check messages/reports
  console.log('\n=== MESSAGES TABLE ===');
  const msgTables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name LIKE '%message%' OR table_name LIKE '%report%' OR table_name LIKE '%espionage%'
  `);
  console.log('Message/Report tables:', msgTables.rows.map(r => r.table_name));

  // 6. Check battle_reports if any defender_id matches
  console.log('\n=== BATTLE REPORTS WHERE ZERATUL WAS ATTACKED ===');
  const br = await c.query(`
    SELECT * FROM battle_reports 
    WHERE defender_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [userId]);
  console.log('Count:', br.rowCount);
  if (br.rows.length > 0) {
    console.log(JSON.stringify(br.rows, null, 2));
  }

  // 7. Count total ever fleets
  const totalFleets = await c.query(`
    SELECT COUNT(*) as total, 
           COUNT(*) FILTER (WHERE is_completed) as completed,
           COUNT(*) FILTER (WHERE NOT is_completed) as active,
           COUNT(*) FILTER (WHERE mission_type = 'deploy') as deploys,
           COUNT(*) FILTER (WHERE mission_type = 'transport') as transports,
           COUNT(*) FILTER (WHERE mission_type = 'attack') as attacks,
           COUNT(*) FILTER (WHERE mission_type = 'expedition') as expeditions
    FROM fleets WHERE user_id = $1
  `, [userId]);
  console.log('\n=== FLEET COUNTS ===');
  console.log(JSON.stringify(totalFleets.rows[0], null, 2));

  // 8. Check account_interaction_log
  console.log('\n=== ACCOUNT_INTERACTION_LOG COLUMNS ===');
  const ailCols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'account_interaction_log' ORDER BY ordinal_position
  `);
  console.log(ailCols.rows.map(r => r.column_name).join(', '));

  console.log('\n=== ACCOUNT_INTERACTION_LOG FOR ZERATUL ===');
  const ail = await c.query(`
    SELECT * FROM account_interaction_log 
    WHERE user_id = $1 OR target_user_id = $1
    ORDER BY id DESC
    LIMIT 10
  `, [userId]);
  console.log(JSON.stringify(ail.rows, null, 2));

  // 9. Check the process_fleet_arrival to understand deploy logic
  console.log('\n=== FULL SHIP INVENTORY (ON PLANETS + IN FLEETS) ===');
  const inventory = await c.query(`
    WITH planet_inv AS (
      SELECT st.code, SUM(ps.quantity) as on_planets
      FROM planet_ships ps
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE ps.planet_id IN (SELECT id FROM planets WHERE user_id = $1)
      GROUP BY st.code
    ),
    fleet_inv AS (
      SELECT st.code, SUM(fs.quantity) as in_fleets
      FROM fleet_ships fs
      JOIN fleets f ON f.id = fs.fleet_id
      JOIN ship_types st ON st.id = fs.ship_type_id
      WHERE f.user_id = $1 AND f.is_completed = false
      GROUP BY st.code
    )
    SELECT COALESCE(p.code, f.code) as code,
           COALESCE(p.on_planets, 0) as on_planets,
           COALESCE(f.in_fleets, 0) as in_fleets,
           COALESCE(p.on_planets, 0) + COALESCE(f.in_fleets, 0) as total
    FROM planet_inv p
    FULL OUTER JOIN fleet_inv f ON f.code = p.code
    ORDER BY code
  `, [userId]);
  for (const row of inventory.rows) {
    console.log(`  ${row.code}: ${row.on_planets} on planets + ${row.in_fleets} in fleets = ${row.total} total`);
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
