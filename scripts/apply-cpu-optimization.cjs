const { Client } = require('pg');
const fs = require('fs');

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
  console.log('Connected to database');

  const sql = fs.readFileSync('supabase/migrations/20260405190000_cpu_optimization_batch_points.sql', 'utf8');
  
  // Split by statements and execute one by one
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    console.log(`\n[${i + 1}/${statements.length}] Executing: ${preview}...`);
    try {
      const result = await c.query(stmt);
      console.log(`  ✓ OK (rows affected: ${result.rowCount})`);
    } catch (err) {
      console.error(`  ✗ ERROR: ${err.message}`);
      if (err.detail) console.error(`    Detail: ${err.detail}`);
      if (err.hint) console.error(`    Hint: ${err.hint}`);
      // Don't stop on error, continue
    }
  }

  // Verify: check new triggers
  console.log('\n=== VERIFICATION ===');
  const triggers = await c.query(`
    SELECT tgname, relname, 
      CASE WHEN tgtype & 1 = 1 THEN 'ROW' ELSE 'STATEMENT' END as level
    FROM pg_trigger t
    JOIN pg_class cl ON t.tgrelid = cl.oid
    WHERE tgname LIKE '%point%'
    ORDER BY relname, tgname
  `);
  console.log('\nPoint triggers:');
  triggers.rows.forEach(r => console.log(`  ${r.relname}.${r.tgname} (${r.level})`));

  // Check pg_cron jobs
  const jobs = await c.query(`SELECT jobid, jobname, schedule FROM cron.job ORDER BY jobid`);
  console.log('\npg_cron jobs:');
  jobs.rows.forEach(r => console.log(`  [${r.jobid}] "${r.jobname}" schedule="${r.schedule}"`));

  // Check queue table exists
  const queueCheck = await c.query(`SELECT count(*) FROM points_update_queue`);
  console.log(`\npoints_update_queue rows: ${queueCheck.rows[0].count}`);

  // Check _http_response size after cleanup
  const httpSize = await c.query(`
    SELECT pg_size_pretty(pg_total_relation_size('net._http_response')) as size,
           count(*) as rows FROM net._http_response
  `);
  console.log(`\n_http_response after cleanup: ${httpSize.rows[0].size} (${httpSize.rows[0].rows} rows)`);

  await c.end();
  console.log('\nDone!');
}

main().catch(console.error);
