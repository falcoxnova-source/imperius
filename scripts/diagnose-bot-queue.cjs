const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected.\n');

  // 1. Check for bot buildings stuck in queue with end_time in the past
  const { rows: stuck } = await client.query(`
    SELECT bq.id, bq.planet_id, bq.building_type_id, bt.code, bq.target_level,
           bq.build_time, bq.queue_position, bq.start_time, bq.end_time,
           p.username, p.is_bot,
           (bq.end_time < now()) as is_expired,
           EXTRACT(EPOCH FROM (now() - bq.end_time))::int as seconds_overdue
    FROM building_queue bq
    JOIN planets pl ON pl.id = bq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE p.is_bot = true
    ORDER BY bq.end_time
  `);
  console.log('=== ALL Bot Building Queue Items (' + stuck.length + ') ===');
  stuck.forEach(r => {
    console.log('  ' + r.username + ' | ' + r.code + ' lvl' + r.target_level +
      ' | pos=' + r.queue_position +
      ' | end=' + (r.end_time ? new Date(r.end_time).toISOString() : 'null') +
      ' | expired=' + r.is_expired +
      ' | overdue=' + r.seconds_overdue + 's');
  });

  // 2. Check cron job status
  const { rows: crons } = await client.query(`
    SELECT jobname, schedule, command, active
    FROM cron.job
    WHERE command ILIKE '%optimized_global_queue%'
       OR command ILIKE '%bot_ai_tick%'
    ORDER BY jobname
  `);
  console.log('\n=== Relevant Cron Jobs ===');
  crons.forEach(r => {
    console.log('  ' + r.jobname + ' | schedule=' + r.schedule + ' | active=' + r.active + ' | cmd=' + r.command.substring(0, 80));
  });

  // 3. Check recent cron run history
  try {
    // First check what columns exist
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'cron' AND table_name = 'job_run_details'
      ORDER BY ordinal_position
    `);
    console.log('\n=== cron.job_run_details columns ===');
    console.log('  ' + cols.map(c => c.column_name).join(', '));

    const { rows: cronRuns } = await client.query(`
      SELECT jrd.*, j.jobname
      FROM cron.job_run_details jrd
      JOIN cron.job j ON j.jobid = jrd.jobid
      WHERE j.jobname IN ('optimized-queue-processor', 'bot-ai-tick')
      ORDER BY jrd.start_time DESC
      LIMIT 10
    `);
    console.log('\n=== Recent Cron Runs (last 10) ===');
    cronRuns.forEach(r => {
      const msg = r.return_message ? r.return_message.substring(0, 120) : 'null';
      console.log('  ' + r.jobname + ' | ' + r.status + ' | ' + r.start_time + ' | msg=' + msg);
    });
  } catch (e) {
    console.log('\n=== Cron run details error: ' + e.message + ' ===');
  }

  // 4. Check the live function source for the building section
  const { rows: fnRows } = await client.query(
    "SELECT prosrc FROM pg_proc WHERE proname = 'optimized_global_queue_processor' AND pronargs = 0"
  );
  if (fnRows.length > 0) {
    const src = fnRows[0].prosrc;
    // Find the building queue section
    const buildIdx = src.indexOf('BUILDING QUEUE');
    const shipIdx = src.indexOf('SHIPYARD QUEUE');
    if (buildIdx > -1 && shipIdx > -1) {
      console.log('\n=== LIVE Function - Building Queue Section ===');
      console.log(src.substring(buildIdx, shipIdx));
    } else {
      console.log('\n=== LIVE Function (first 2000 chars) ===');
      console.log(src.substring(0, 2000));
    }
  } else {
    console.log('\n!!! optimized_global_queue_processor function NOT FOUND !!!');
  }

  // 5. Check if any non-bot buildings are also stuck
  const { rows: allStuck } = await client.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE p.is_bot = true) as bot_count,
           COUNT(*) FILTER (WHERE p.is_bot IS NOT TRUE) as human_count
    FROM building_queue bq
    JOIN planets pl ON pl.id = bq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    WHERE bq.end_time IS NOT NULL AND bq.end_time < now()
  `);
  console.log('\n=== Expired Building Queue Summary ===');
  console.log('  Total expired:', allStuck[0].total, '| Bot:', allStuck[0].bot_count, '| Human:', allStuck[0].human_count);

  // 6. Also check ALL building_queue items (not just bot)
  const { rows: allQ } = await client.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE bq.end_time IS NOT NULL AND bq.end_time < now()) as expired,
           COUNT(*) FILTER (WHERE bq.end_time IS NULL) as no_end_time,
           COUNT(*) FILTER (WHERE bq.end_time IS NOT NULL AND bq.end_time > now()) as still_building
    FROM building_queue bq
  `);
  console.log('\n=== Full Building Queue Status ===');
  console.log('  Total:', allQ[0].total, '| Expired:', allQ[0].expired, '| No end_time:', allQ[0].no_end_time, '| Still building:', allQ[0].still_building);

  // 7. Check current time on server
  const { rows: [timeRow] } = await client.query("SELECT now() as server_now, current_setting('timezone') as tz");
  console.log('\n=== Server Time ===');
  console.log('  now():', timeRow.server_now, '| timezone:', timeRow.tz);

  // 8. Check bot planet_buildings (to see if any buildings were ever completed)
  const { rows: botBuildings } = await client.query(`
    SELECT p.username, bt.code, pb.level
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id AND pl.planet_type = 'planet'
    JOIN planet_buildings pb ON pb.planet_id = pl.id
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE p.is_bot = true AND pb.level > 0
    ORDER BY p.username, bt.code
    LIMIT 30
  `);
  console.log('\n=== Bot Completed Buildings (' + botBuildings.length + ') ===');
  botBuildings.forEach(r => {
    console.log('  ' + r.username + ' | ' + r.code + ': ' + r.level);
  });

  // 9. Manually attempt to run the queue processor and check result
  console.log('\n=== Running optimized_global_queue_processor() manually ===');
  const { rows: [procResult] } = await client.query('SELECT optimized_global_queue_processor() as result');
  console.log('Result:', JSON.stringify(procResult.result, null, 2));

  // 10. Check queue again after manual run
  const { rows: afterRun } = await client.query(`
    SELECT bq.id, bt.code, bq.target_level, bq.end_time, p.username, p.is_bot,
           (bq.end_time < now()) as is_expired
    FROM building_queue bq
    JOIN planets pl ON pl.id = bq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE p.is_bot = true
    ORDER BY bq.end_time
  `);
  console.log('\n=== Bot Queue AFTER manual processor run (' + afterRun.length + ') ===');
  afterRun.forEach(r => {
    console.log('  ' + r.username + ' | ' + r.code + ' lvl' + r.target_level +
      ' | end=' + (r.end_time ? new Date(r.end_time).toISOString() : 'null') +
      ' | expired=' + r.is_expired);
  });

  await client.end();
  console.log('\nDone.');
}

main().catch(e => {
  console.error('Fatal:', e.message);
  client.end();
  process.exit(1);
});
