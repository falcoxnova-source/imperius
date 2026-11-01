const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function investigate() {
  await c.connect();
  const ACS_ID = 'f6887d40-d50e-430c-b90f-0340a36ba6f5';
  const BATTLE_ID = '32f678a0-de13-43f2-901b-dca64e565a8c';

  // 1. ACS participants
  console.log('=== ACS PARTICIPANTS ===');
  const participants = await c.query(`
    SELECT ap.fleet_id, ap.user_id, pr.username
    FROM acs_participants ap
    LEFT JOIN profiles pr ON ap.user_id = pr.id
    WHERE ap.acs_id = $1
  `, [ACS_ID]);
  console.table(participants.rows);

  // 2. Check fleet ships for these fleets
  for (const p of participants.rows) {
    console.log(`\n=== FLEET SHIPS for ${p.username} (fleet ${p.fleet_id}) ===`);
    const ships = await c.query(`
      SELECT fs.ship_type_id, st.name, fs.quantity
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = $1
      ORDER BY st.name
    `, [p.fleet_id]);
    console.table(ships.rows);

    const fleet = await c.query(`
      SELECT id, mission_type, is_returning, is_completed, is_acs, acs_id,
             arrival_time, return_time,
             cargo_metal, cargo_crystal, cargo_deuterium,
             target_galaxy, target_system, target_position,
             origin_planet_id, created_at
      FROM fleets WHERE id = $1
    `, [p.fleet_id]);
    console.log(`Fleet status:`, fleet.rows[0]);
  }

  // 3. Battle report data - attacker_remaining
  console.log('\n=== BATTLE REPORT DATA ===');
  const report = await c.query(`
    SELECT report_data FROM battle_reports WHERE id = $1
  `, [BATTLE_ID]);

  if (report.rows[0]) {
    const rd = report.rows[0].report_data;
    
    console.log('\nResult:', rd.result);
    console.log('Rounds:', rd.rounds);
    
    console.log('\n--- Attacker Remaining ---');
    if (rd.attacker_remaining) {
      rd.attacker_remaining.forEach(u => {
        console.log(`  ${u.name}: ${u.quantity}/${u.initial_quantity} fleet_id=${u.fleet_id || 'N/A'} is_defense=${u.is_defense}`);
      });
    }
    
    console.log('\n--- Defender Remaining ---');
    if (rd.defender_remaining) {
      rd.defender_remaining.forEach(u => {
        console.log(`  ${u.name}: ${u.quantity}/${u.initial_quantity} is_defense=${u.is_defense} source=${u.source || 'N/A'}`);
      });
    }
    
    console.log('\n--- Destroyed Defenses ---');
    if (rd.destroyed_defenses) {
      console.log(JSON.stringify(rd.destroyed_defenses, null, 2));
    }
    
    console.log('\n--- Fleet Contributions ---');
    if (rd.fleet_contributions) {
      console.log(JSON.stringify(rd.fleet_contributions, null, 2));
    }
  }

  // 4. Check defender's current planet defenses at [2:14:7]
  console.log('\n=== WEZLER PLANET [2:14:7] CURRENT DEFENSES ===');
  const defenses = await c.query(`
    SELECT dt.name, pd.quantity, dt.id as defense_type_id
    FROM planet_defenses pd
    JOIN defense_types dt ON pd.defense_type_id = dt.id
    JOIN planets p ON pd.planet_id = p.id
    WHERE p.galaxy = 2 AND p.solar_system = 14 AND p.position = 7
    ORDER BY dt.name
  `);
  console.table(defenses.rows);

  // 5. Check defender's current planet ships at [2:14:7]
  console.log('\n=== WEZLER PLANET [2:14:7] CURRENT SHIPS ===');
  const ships = await c.query(`
    SELECT st.name, ps.quantity
    FROM planet_ships ps
    JOIN ship_types st ON ps.ship_type_id = st.id
    JOIN planets p ON ps.planet_id = p.id
    WHERE p.galaxy = 2 AND p.solar_system = 14 AND p.position = 7 AND ps.quantity > 0
    ORDER BY st.name
  `);
  console.table(ships.rows);

  await c.end();
}

investigate().catch(e => { console.error(e); process.exit(1); });
