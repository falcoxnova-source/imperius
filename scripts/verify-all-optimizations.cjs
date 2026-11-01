const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Check batch points is working - queue should have entries if players are active
  const q1 = await c.query(`SELECT count(*) as cnt FROM points_update_queue`);
  console.log('=== BATCH POINTS QUEUE ===');
  console.log(`  Queue entries: ${q1.rows[0].cnt}`);

  // 2. Check pg_cron job status - has it run?
  const q2 = await c.query(`
    SELECT jobid, jobname, schedule, 
           (SELECT max(start_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid) as last_run,
           (SELECT status FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY start_time DESC LIMIT 1) as last_status,
           (SELECT return_message FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY start_time DESC LIMIT 1) as last_result
    FROM cron.job j
    WHERE jobname IN ('batch-update-points', 'cleanup-http-response', 'cleanup-old-completed-fleets')
    ORDER BY jobid
  `);
  console.log('\n=== NEW PG_CRON JOBS STATUS ===');
  q2.rows.forEach(r => {
    console.log(`  [${r.jobid}] "${r.jobname}"`);
    console.log(`    Schedule: ${r.schedule}`);
    console.log(`    Last run: ${r.last_run || 'NEVER'}`);
    console.log(`    Status: ${r.last_status || 'N/A'}`);
    console.log(`    Result: ${r.last_result || 'N/A'}`);
  });

  // 3. Check market purchase function - was migration applied?
  const q3 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'purchase_market_listing'
  `);
  console.log('\n=== MARKET PURCHASE FUNCTION ===');
  if (q3.rows.length > 0) {
    const def = q3.rows[0].def;
    const hasBuyerPlanet = def.includes('p_buyer_planet_id');
    console.log(`  Has p_buyer_planet_id parameter: ${hasBuyerPlanet}`);
    if (!hasBuyerPlanet) {
      console.log('  ⚠️  Market bug fix NOT applied yet!');
    } else {
      console.log('  ✓ Market bug fix applied');
    }
  }

  // 4. Verify triggers are lightweight now
  const q4 = await c.query(`
    SELECT t.tgname, c.relname, p.proname as fn
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE t.tgname LIKE '%point%'
    ORDER BY c.relname
  `);
  console.log('\n=== TRIGGER VERIFICATION ===');
  let allQueue = true;
  q4.rows.forEach(r => {
    const isQueue = r.fn.startsWith('queue_') || r.fn === 'sync_alliance_points_on_profile_change';
    if (!isQueue) allQueue = false;
    console.log(`  ${r.relname}.${r.tgname} -> ${r.fn} ${isQueue ? '✓' : '⚠️ STILL OLD!'}`);
  });
  console.log(`  All triggers lightweight: ${allQueue ? '✓ YES' : '⚠️ NO'}`);

  // 5. Check _http_response - did cleanup work?
  const q5 = await c.query(`
    SELECT pg_size_pretty(pg_total_relation_size('net._http_response')) as size,
           count(*) as rows,
           min(created) as oldest,
           max(created) as newest
    FROM net._http_response
  `);
  console.log('\n=== _HTTP_RESPONSE TABLE ===');
  console.log(`  Size: ${q5.rows[0].size} (${q5.rows[0].rows} rows)`);
  console.log(`  Oldest: ${q5.rows[0].oldest}`);
  console.log(`  Newest: ${q5.rows[0].newest}`);

  // 6. Check points are still updating correctly - sample a recent active player
  const q6 = await c.query(`
    SELECT username, points_total, points_buildings, points_research, points_fleet, points_defense,
           updated_at, last_activity
    FROM profiles 
    WHERE last_activity > now() - interval '5 minutes'
    ORDER BY points_total DESC
    LIMIT 3
  `);
  console.log('\n=== RECENTLY ACTIVE PLAYERS (points check) ===');
  q6.rows.forEach(r => {
    console.log(`  ${r.username}: total=${r.points_total} (B:${r.points_buildings} R:${r.points_research} F:${r.points_fleet} D:${r.points_defense}) updated=${r.updated_at}`);
  });

  // 7. Verify index
  const q7 = await c.query(`
    SELECT indexname, indexdef FROM pg_indexes 
    WHERE tablename = 'fleet_ships' AND indexname = 'idx_fleet_ships_fleet_id'
  `);
  console.log('\n=== INDEX VERIFICATION ===');
  console.log(`  idx_fleet_ships_fleet_id: ${q7.rows.length > 0 ? '✓ EXISTS' : '⚠️ MISSING'}`);

  await c.end();
}

main().catch(console.error);
