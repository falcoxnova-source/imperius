const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // 1. Top slow queries (pg_stat_statements)
  try {
    const q1 = await c.query(`
      SELECT query, calls, total_exec_time::bigint as total_ms, 
             (total_exec_time/calls)::integer as avg_ms,
             rows
      FROM pg_stat_statements 
      WHERE calls > 10
      ORDER BY total_exec_time DESC 
      LIMIT 20
    `);
    console.log('=== TOP 20 SLOWEST QUERIES (by total time) ===');
    q1.rows.forEach((r, i) => {
      console.log(`\n[${i+1}] avg=${r.avg_ms}ms calls=${r.calls} total=${r.total_ms}ms rows=${r.rows}`);
      console.log(`    ${r.query.substring(0, 200).replace(/\n/g, ' ')}`);
    });
  } catch(e) {
    console.log('pg_stat_statements not available:', e.message);
  }

  // 2. Table bloat - tables that need VACUUM
  const q2 = await c.query(`
    SELECT schemaname, relname, 
           n_live_tup, n_dead_tup, 
           n_mod_since_analyze,
           last_vacuum, last_autovacuum, last_analyze,
           pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as size
    FROM pg_stat_user_tables 
    WHERE n_dead_tup > 1000 OR n_live_tup > 10000
    ORDER BY n_dead_tup DESC
    LIMIT 20
  `);
  console.log('\n\n=== TABLE BLOAT (dead tuples) ===');
  q2.rows.forEach(r => {
    const ratio = r.n_live_tup > 0 ? (r.n_dead_tup / r.n_live_tup * 100).toFixed(1) : '0';
    console.log(`  ${r.relname}: live=${r.n_live_tup} dead=${r.n_dead_tup} (${ratio}%) size=${r.size} last_vacuum=${r.last_autovacuum || r.last_vacuum || 'NEVER'}`);
  });

  // 3. Sequential scans on large tables (missing indexes)
  const q3 = await c.query(`
    SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
           n_live_tup,
           pg_size_pretty(pg_total_relation_size('public.' || relname)) as size
    FROM pg_stat_user_tables 
    WHERE schemaname = 'public' AND seq_scan > 100 AND n_live_tup > 1000
    ORDER BY seq_tup_read DESC
    LIMIT 15
  `);
  console.log('\n\n=== SEQUENTIAL SCANS (potential missing indexes) ===');
  q3.rows.forEach(r => {
    const ratio = (r.idx_scan > 0) ? (r.seq_scan / (r.seq_scan + r.idx_scan) * 100).toFixed(1) : '100';
    console.log(`  ${r.relname}: seq_scans=${r.seq_scan} idx_scans=${r.idx_scan} (${ratio}% seq) rows=${r.n_live_tup} size=${r.size}`);
  });

  // 4. Unused indexes (wasting space + slowing writes)
  const q4 = await c.query(`
    SELECT s.relname as table, s.indexrelname as index, 
           s.idx_scan, pg_size_pretty(pg_relation_size(s.indexrelid)) as size
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON s.indexrelid = i.indexrelid
    WHERE s.idx_scan < 10 
      AND NOT i.indisunique 
      AND NOT i.indisprimary
      AND s.schemaname = 'public'
      AND pg_relation_size(s.indexrelid) > 65536
    ORDER BY pg_relation_size(s.indexrelid) DESC
    LIMIT 15
  `);
  console.log('\n\n=== UNUSED INDEXES (wasting space + slowing writes) ===');
  q4.rows.forEach(r => console.log(`  ${r.table}.${r.index}: scans=${r.idx_scan} size=${r.size}`));

  // 5. Connection count
  const q5 = await c.query(`
    SELECT state, count(*) as cnt 
    FROM pg_stat_activity 
    GROUP BY state ORDER BY cnt DESC
  `);
  console.log('\n\n=== CONNECTIONS ===');
  q5.rows.forEach(r => console.log(`  ${r.state || 'NULL'}: ${r.cnt}`));

  // 6. Cache hit ratio
  const q6 = await c.query(`
    SELECT sum(heap_blks_read) as read, sum(heap_blks_hit) as hit,
           CASE WHEN sum(heap_blks_hit) > 0 THEN
             round(sum(heap_blks_hit)::numeric / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100, 2)
           ELSE 0 END as hit_ratio
    FROM pg_statio_user_tables
  `);
  console.log('\n\n=== CACHE HIT RATIO ===');
  console.log(`  ${q6.rows[0].hit_ratio}% (target: >99%)`);

  // 7. Check optimized_global_queue_processor - runs every minute
  const q7 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'optimized_global_queue_processor'
  `);
  console.log('\n\n=== optimized_global_queue_processor (runs EVERY MINUTE) ===');
  if (q7.rows.length > 0) {
    console.log(q7.rows[0].def.substring(0, 2000));
    if (q7.rows[0].def.length > 2000) console.log('... (truncated)');
  } else {
    console.log('  NOT FOUND');
  }

  // 8. Largest tables by size
  const q8 = await c.query(`
    SELECT relname, 
           pg_size_pretty(pg_total_relation_size('public.' || relname)) as total_size,
           pg_size_pretty(pg_relation_size('public.' || relname)) as table_size,
           pg_size_pretty(pg_total_relation_size('public.' || relname) - pg_relation_size('public.' || relname)) as index_size,
           n_live_tup as rows
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size('public.' || relname) DESC
    LIMIT 15
  `);
  console.log('\n\n=== TOP 15 LARGEST TABLES ===');
  q8.rows.forEach(r => console.log(`  ${r.relname}: total=${r.total_size} (table=${r.table_size} idx=${r.index_size}) rows=${r.rows}`));

  // 9. Check RLS policies count per table (heavy RLS = slow)
  const q9 = await c.query(`
    SELECT tablename, count(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
    HAVING count(*) > 3
    ORDER BY count(*) DESC
  `);
  console.log('\n\n=== TABLES WITH MANY RLS POLICIES (>3) ===');
  q9.rows.forEach(r => console.log(`  ${r.tablename}: ${r.policy_count} policies`));

  // 10. Check process_user_pending_fleets - called every 5s per user
  const q10 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'process_user_pending_fleets'
  `);
  console.log('\n\n=== process_user_pending_fleets ===');
  if (q10.rows.length > 0) {
    const lines = q10.rows[0].def.split('\n');
    console.log(lines.slice(0, 40).join('\n'));
    if (lines.length > 40) console.log(`... (${lines.length - 40} more lines)`);
  }

  await c.end();
}
main().catch(console.error);
