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

  // 1. Check if points_update_queue table exists
  const tbl = await c.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'points_update_queue'
    ) as exists
  `);
  console.log('points_update_queue table exists:', tbl.rows[0].exists);

  // 2. Check which trigger functions exist
  for (const fn of [
    'queue_points_update_for_planet_table',
    'queue_points_update_for_user_table',
    'queue_points_update_for_fleet_ships',
    'queue_points_update_for_fleet',
    'batch_update_player_points'
  ]) {
    const r = await c.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = $1
      ) as exists
    `, [fn]);
    console.log(`Function ${fn}:`, r.rows[0].exists);
  }

  // 3. Check current triggers - what function do they call?
  const trigs = await c.query(`
    SELECT t.tgname, c.relname, p.proname as function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE t.tgname LIKE '%point%'
    ORDER BY c.relname, t.tgname
  `);
  console.log('\nCurrent point triggers:');
  trigs.rows.forEach(r => console.log(`  ${r.relname}.${r.tgname} -> ${r.function_name}`));

  // 4. Check pg_cron jobs
  const jobs = await c.query(`SELECT jobid, jobname, schedule FROM cron.job ORDER BY jobid`);
  console.log('\npg_cron jobs:');
  jobs.rows.forEach(r => console.log(`  [${r.jobid}] "${r.jobname}" schedule="${r.schedule}"`));

  // 5. Check _http_response size
  const http = await c.query(`
    SELECT pg_size_pretty(pg_total_relation_size('net._http_response')) as size,
           count(*) as rows FROM net._http_response
  `);
  console.log(`\n_http_response: ${http.rows[0].size} (${http.rows[0].rows} rows)`);

  // 6. Check index
  const idx = await c.query(`
    SELECT indexname FROM pg_indexes 
    WHERE tablename = 'fleet_ships' AND indexname = 'idx_fleet_ships_fleet_id'
  `);
  console.log(`\nidx_fleet_ships_fleet_id exists:`, idx.rows.length > 0);

  await c.end();
}
main().catch(console.error);
