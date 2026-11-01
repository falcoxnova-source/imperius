const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function verify() {
  await c.connect();

  // Simulate what format_unit_report would show for the ACS battle
  // Using the actual battle data
  console.log('=== TESTING format_unit_report with actual ACS battle data ===');
  
  const result = await c.query(`
    SELECT format_unit_report(
      report_data->'initial_attacker',
      report_data->'attacker_remaining',
      'attacker'
    ) as attacker_report,
    format_unit_report(
      report_data->'initial_defender',
      report_data->'defender_remaining',
      'defender'
    ) as defender_report
    FROM battle_reports
    WHERE id = '32f678a0-de13-43f2-901b-dca64e565a8c'
  `);

  if (result.rows[0]) {
    console.log('\n=== ATTACKER REPORT (FIXED) ===');
    console.log(result.rows[0].attacker_report);
    console.log('\n=== DEFENDER REPORT (FIXED) ===');
    console.log(result.rows[0].defender_report);
  }

  // Also verify Wezler's current defenses match expected rebuild
  console.log('\n=== DEFENSE REBUILD VERIFICATION ===');
  const defenseCheck = await c.query(`
    SELECT dt.name, pd.quantity as current_qty, dt.id as type_id
    FROM planet_defenses pd
    JOIN defense_types dt ON pd.defense_type_id = dt.id
    JOIN planets p ON pd.planet_id = p.id
    WHERE p.galaxy = 2 AND p.solar_system = 14 AND p.position = 7
    AND pd.quantity > 0
    ORDER BY dt.name
  `);
  console.table(defenseCheck.rows);

  // Check if there were MORE attacks after the ACS one
  console.log('\n=== ATTACKS ON [2:14:7] AFTER THE ACS ===');
  const laterAttacks = await c.query(`
    SELECT br.id, br.result, br.created_at, pa.username as attacker
    FROM battle_reports br
    LEFT JOIN profiles pa ON br.attacker_id = pa.id
    WHERE br.coordinates = '[2:14:7]'
    AND br.created_at > '2026-03-31T22:42:00Z'
    ORDER BY br.created_at
  `);
  console.table(laterAttacks.rows);

  await c.end();
}

verify().catch(e => { console.error(e); process.exit(1); });
