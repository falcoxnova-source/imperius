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

  // 1. Get the FULL battle message about [2:22:5] vs Lolio
  console.log('=== BATTLE MESSAGES AT [2:22:5] ===');
  const battleMsgs = await c.query(`
    SELECT id, subject, body, created_at
    FROM messages
    WHERE recipient_id = $1 
      AND (body::text LIKE '%2:22:5%' OR subject LIKE '%2:22:5%')
    ORDER BY created_at DESC
    LIMIT 10
  `, [userId]);
  for (const m of battleMsgs.rows) {
    console.log(`\n--- [${m.created_at}] ${m.subject} ---`);
    console.log(typeof m.body === 'string' ? m.body : JSON.stringify(m.body, null, 2));
  }

  // 2. Get ALL deploy fleets to [2:22:5] EVER
  console.log('\n\n=== ALL FLEETS TO [2:22:5] ===');
  const deploysTo225 = await c.query(`
    SELECT f.id, f.mission_type, f.is_completed, f.is_returning,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.created_at, f.arrival_time
    FROM fleets f
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 
      AND f.target_galaxy = 2 AND f.target_system = 22 AND f.target_position = 5
    ORDER BY f.created_at DESC
  `, [userId]);
  for (const f of deploysTo225.rows) {
    console.log(`  ${f.id.substring(0,8)} | ${f.mission_type} | ${f.origin} -> 2:22:5 | completed:${f.is_completed} ret:${f.is_returning} | ${f.created_at}`);
  }

  // 3. Check battle_reports at [2:22:5] more carefully
  console.log('\n=== BATTLE REPORTS AT COORDINATES 2:22:5 ===');
  const br = await c.query(`
    SELECT id, attacker_id, defender_id, result, rounds,
           attacker_losses_metal, attacker_losses_crystal,
           defender_losses_metal, defender_losses_crystal,
           debris_metal, debris_crystal, 
           loot_metal, loot_crystal, loot_deuterium,
           created_at,
           CASE WHEN LENGTH(report_data::text) > 500 THEN LEFT(report_data::text, 500) || '...' ELSE report_data::text END as data_preview
    FROM battle_reports
    WHERE coordinates = '2:22:5'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('Count:', br.rowCount);
  for (const r of br.rows) {
    console.log(`\n  ID: ${r.id.substring(0,8)} | ${r.result} | ${r.rounds} rounds | ${r.created_at}`);
    console.log(`  Attacker: ${r.attacker_id?.substring(0,8)} | Defender: ${r.defender_id?.substring(0,8)}`);
    console.log(`  Atk losses: M${r.attacker_losses_metal} C${r.attacker_losses_crystal}`);
    console.log(`  Def losses: M${r.defender_losses_metal} C${r.defender_losses_crystal}`);
    console.log(`  Data: ${r.data_preview}`);
  }

  // 4. Check who owns [2:22:5]
  console.log('\n=== PLANET AT [2:22:5] ===');
  const planet225 = await c.query(`
    SELECT p.id, p.name, p.user_id, pr.username
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.galaxy = 2 AND p.solar_system = 22 AND p.position = 5
  `);
  console.log(JSON.stringify(planet225.rows[0], null, 2));

  // 5. Check if Zeratul had ships deployed at [2:22:5] that were in battle
  // The stuck fleet 56b48bce had 10 star_destroyers, but maybe there were earlier deploys
  // that already delivered ships to [2:22:5]
  
  // 6. Check planet_ships at [2:22:5] for Zeratul's ships (deployed_by user)
  // Actually planet_ships are per-planet, deployed fleet ships might be tracked differently
  
  // 7. Check if there's a deployed_fleets or stationed_fleet table
  console.log('\n=== TABLES WITH "station" or "deploy" ===');
  const stTables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND (table_name LIKE '%station%' OR table_name LIKE '%deployed%')
  `);
  console.log(stTables.rows.map(r => r.table_name));

  // 8. Check the full report_data from the battle at [2:22:5] vs Lolio
  console.log('\n=== FULL BATTLE REPORT DATA vs LOLIO at 2:22:5 ===');
  const fullBr = await c.query(`
    SELECT report_data
    FROM battle_reports
    WHERE coordinates = '2:22:5'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  if (fullBr.rows.length > 0) {
    console.log(JSON.stringify(fullBr.rows[0].report_data, null, 2));
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
