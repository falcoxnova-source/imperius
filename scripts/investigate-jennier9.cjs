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

  // 1. ALL battle reports where Zeratul is involved (attacker or defender)
  console.log('=== ALL BATTLE REPORTS FOR ZERATUL ===');
  const allBR = await c.query(`
    SELECT id, attacker_id, defender_id, coordinates, result, created_at,
           defender_losses_metal, defender_losses_crystal
    FROM battle_reports 
    WHERE attacker_id = $1 OR defender_id = $1
    ORDER BY created_at DESC
    LIMIT 20
  `, [userId]);
  console.log(JSON.stringify(allBR.rows, null, 2));

  // 2. Check if Zeratul ever had large_cargo by looking at report_data
  console.log('\n=== CHECK REPORT_DATA FOR LARGE_CARGO ===');
  const brWithLC = await c.query(`
    SELECT id, coordinates, created_at, result,
           report_data->'defender_initial_ships' as def_ships,
           report_data->'attacker_initial_ships' as atk_ships
    FROM battle_reports 
    WHERE (attacker_id = $1 OR defender_id = $1)
    AND (report_data::text LIKE '%large_cargo%' OR report_data::text LIKE '%Nave Grande%')
    ORDER BY created_at DESC
    LIMIT 5
  `, [userId]);
  console.log(JSON.stringify(brWithLC.rows, null, 2));

  // 3. Let me check process_fleet_arrival more carefully - particularly how it handles
  // ACS fleets that arrive. There might be a bug where it deletes fleet_ships of ACS participants
  console.log('\n=== PROCESS_FLEET_ARRIVAL - ACS SECTION ===');
  const processFleet = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival' ORDER BY oid DESC LIMIT 1
  `);
  if (processFleet.rows.length > 0) {
    const src = processFleet.rows[0].prosrc;
    // Find ACS processing section
    const acsIdx = src.indexOf("'attack'");
    if (acsIdx > -1) {
      // Print a chunk around ACS attack processing
      console.log('Attack section (first 5000 chars from attack):');
      console.log(src.substring(acsIdx, Math.min(acsIdx + 5000, src.length)));
    }
  }

  // 4. Actually, the crucial question: Did the user actually SUCCESSFULLY join the ACS?
  // Since there's NO fleet record and NO participant record, the join FAILED
  // But ships could have been subtracted if join_acs_with_fleet had a partial failure
  
  // Check: is join_acs_with_fleet wrapped in a transaction?
  // PostgreSQL functions are atomic by default, so if it fails, everything rolls back.
  // UNLESS there's a nested exception handler that swallows errors.
  
  console.log('\n=== join_acs_with_fleet - CHECK EXCEPTION HANDLERS ===');
  const joinFunc = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'join_acs_with_fleet' ORDER BY oid DESC LIMIT 1
  `);
  if (joinFunc.rows.length > 0) {
    const src = joinFunc.rows[0].prosrc;
    const exceptionIdx = src.indexOf('EXCEPTION');
    console.log('Has EXCEPTION handler:', exceptionIdx > -1);
    if (exceptionIdx > -1) {
      console.log('Exception section:', src.substring(exceptionIdx - 200, exceptionIdx + 500));
    }
    // Also check the full function for any partial commit patterns
    console.log('\nFull function source:');
    console.log(src);
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
