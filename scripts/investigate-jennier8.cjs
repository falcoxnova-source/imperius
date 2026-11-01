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

  // CRITICAL: Check if there are ANY deleted fleet records 
  // (fleets that were created then physically deleted from the table)
  // The total is 395 completed + 3 active = 398 total

  // 1. Check max fleet ID sequence to see if there are gaps
  console.log('=== FLEET COUNT FOR ZERATUL ===');
  const fleetCount = await c.query(`
    SELECT COUNT(*) as total FROM fleets WHERE user_id = $1
  `, [userId]);
  console.log('Total fleets:', fleetCount.rows[0].total);

  // 2. Check if there's a process_all_pending_fleets or cron that could have 
  // processed and DELETED fleets  
  console.log('\n=== CHECK process_fleet_arrival for DELETE behavior ===');
  const processFleet = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival' ORDER BY oid DESC LIMIT 1
  `);
  if (processFleet.rows.length > 0) {
    const src = processFleet.rows[0].prosrc;
    // Check for DELETE statements
    const deleteMatches = src.match(/DELETE\s+FROM\s+\w+/gi);
    console.log('DELETE statements in process_fleet_arrival:', deleteMatches);
    // Check for fleet_ships deletion
    const fsDeleteIdx = src.indexOf('DELETE FROM fleet_ships');
    if (fsDeleteIdx > -1) {
      console.log('fleet_ships deletion context:', src.substring(Math.max(0, fsDeleteIdx - 100), fsDeleteIdx + 200));
    }
    const fDeleteIdx = src.indexOf('DELETE FROM fleets');
    if (fDeleteIdx > -1) {
      console.log('fleets deletion context:', src.substring(Math.max(0, fDeleteIdx - 100), fDeleteIdx + 200));
    }
  }

  // 3. Check if process_all_pending_fleets deletes fleet records
  console.log('\n=== CHECK process_all_pending_fleets for DELETE ===');
  const processAll = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_all_pending_fleets' ORDER BY oid DESC LIMIT 1
  `);
  if (processAll.rows.length > 0) {
    const src = processAll.rows[0].prosrc;
    const deleteMatches = src.match(/DELETE\s+FROM\s+\w+/gi);
    console.log('DELETE statements:', deleteMatches);
  }

  // 4. Check optimized_global_queue_processor for cleanup logic
  console.log('\n=== CHECK optimized_global_queue_processor for DELETE ===');
  const queueProc = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'optimized_global_queue_processor' ORDER BY oid DESC LIMIT 1
  `);
  if (queueProc.rows.length > 0) {
    const src = queueProc.rows[0].prosrc;
    const deleteMatches = src.match(/DELETE\s+FROM\s+\w+/gi);
    console.log('DELETE statements:', deleteMatches);
    // Look for fleet cleanup
    const cleanupIdx = src.indexOf('cleanup');
    if (cleanupIdx > -1) {
      console.log('Cleanup section:', src.substring(cleanupIdx, cleanupIdx + 500));
    }
    // Also check for old fleet cleanup
    const oldFleetIdx = src.indexOf('old');
    if (oldFleetIdx > -1) {
      console.log('Old fleet section:', src.substring(Math.max(0, oldFleetIdx - 100), oldFleetIdx + 500));
    }
  }

  // 5. Check if there's a separate cleanup function
  console.log('\n=== CHECK cleanup functions ===');
  const cleanupFuncs = await c.query(`
    SELECT proname FROM pg_proc WHERE proname ILIKE '%cleanup%' OR proname ILIKE '%clean_fleet%' OR proname ILIKE '%purge%'
  `);
  console.log('Cleanup functions:', cleanupFuncs.rows.map(r => r.proname));

  // 6. Since there are NO large_cargo fleet_ships records EVER, and NO large_cargo on planets,
  // this suggests the large_cargo might have been destroyed by MAIKOL's attack on March 8
  // Let's check that battle report
  console.log('\n=== BATTLE REPORT FOR MAIKOL ATTACK ON 1:332:13 (Mar 8) ===');
  const maikol = await c.query(`
    SELECT * FROM battle_reports 
    WHERE attacker_id = '9fa72d04-58e4-4297-bcc3-11b136b42493'
    AND coordinates LIKE '%332:13%'
    ORDER BY created_at DESC LIMIT 3
  `);
  for (const br of maikol.rows) {
    console.log(`\nBattle at ${br.coordinates}, ${br.created_at}`);
    console.log('Result:', br.result);
    console.log('Defender losses metal:', br.defender_losses_metal);
    console.log('Defender losses crystal:', br.defender_losses_crystal);
    if (br.report_data) {
      const rd = typeof br.report_data === 'string' ? JSON.parse(br.report_data) : br.report_data;
      if (rd.defender_ships_lost) console.log('Defender ships lost:', JSON.stringify(rd.defender_ships_lost));
      if (rd.defender_initial_ships) console.log('Defender initial ships:', JSON.stringify(rd.defender_initial_ships));
      if (rd.defender_surviving_ships) console.log('Defender surviving ships:', JSON.stringify(rd.defender_surviving_ships));
      // Check for large_cargo specifically
      const keys = Object.keys(rd);
      console.log('Report data keys:', keys.slice(0, 30));
    }
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
