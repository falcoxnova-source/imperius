const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // 1. Messages indexes
  const q1 = await c.query(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'messages'
  `);
  console.log('=== MESSAGES INDEXES ===');
  q1.rows.forEach(r => console.log(`  ${r.indexname}: ${r.indexdef}`));

  // 2. Messages RLS policies
  const q2 = await c.query(`
    SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'messages'
  `);
  console.log('\n=== MESSAGES RLS POLICIES ===');
  q2.rows.forEach(r => console.log(`  ${r.policyname} (${r.cmd}): ${(r.qual || '').substring(0, 150)}`));

  // 3. Messages column list
  const q3 = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'messages' AND table_schema = 'public' ORDER BY ordinal_position
  `);
  console.log('\n=== MESSAGES COLUMNS ===');
  q3.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // 4. Messages age distribution
  const q4 = await c.query(`
    SELECT 
      count(*) FILTER (WHERE created_at > now() - interval '1 day') as last_1d,
      count(*) FILTER (WHERE created_at > now() - interval '7 days') as last_7d,
      count(*) FILTER (WHERE created_at > now() - interval '30 days') as last_30d,
      count(*) FILTER (WHERE created_at <= now() - interval '30 days') as older_30d,
      count(*) as total,
      count(*) FILTER (WHERE message_type = 'broadcast') as broadcast,
      count(*) FILTER (WHERE message_type = 'system') as system_msg,
      count(*) FILTER (WHERE message_type = 'combat') as combat,
      count(*) FILTER (WHERE message_type = 'espionage') as espionage,
      count(*) FILTER (WHERE message_type = 'expedition') as expedition,
      count(*) FILTER (WHERE message_type NOT IN ('broadcast','system','combat','espionage','expedition')) as other_type,
      count(*) FILTER (WHERE is_read = false) as unread
    FROM messages
  `);
  console.log('\n=== MESSAGES DISTRIBUTION ===');
  const d = q4.rows[0];
  console.log(`  Total: ${d.total}`);
  console.log(`  Last 1d: ${d.last_1d} | 7d: ${d.last_7d} | 30d: ${d.last_30d} | >30d: ${d.older_30d}`);
  console.log(`  Types: broadcast=${d.broadcast} system=${d.system_msg} combat=${d.combat} espionage=${d.espionage} expedition=${d.expedition} other=${d.other_type}`);
  console.log(`  Unread: ${d.unread}`);

  // 5. Full optimized_global_queue_processor (need the end to see if it re-enables triggers)
  const q5 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'optimized_global_queue_processor'
  `);
  if (q5.rows.length > 0) {
    const def = q5.rows[0].def;
    const lines = def.split('\n');
    // Show first 10 and last 30 lines (where ENABLE would be)
    console.log('\n=== optimized_global_queue_processor (HEAD) ===');
    console.log(lines.slice(0, 15).join('\n'));
    console.log('\n=== optimized_global_queue_processor (TAIL - re-enable?) ===');
    console.log(lines.slice(-40).join('\n'));
  }

  // 6. Frontend polling: how often are messages queried?
  // Check messages-related function calls
  const q6 = await c.query(`
    SELECT query, calls, (total_exec_time/calls)::integer as avg_ms, total_exec_time::bigint as total_ms
    FROM pg_stat_statements
    WHERE query ILIKE '%messages%' AND calls > 100
    ORDER BY total_exec_time DESC LIMIT 10
  `);
  console.log('\n=== MESSAGES-RELATED QUERIES ===');
  q6.rows.forEach((r, i) => {
    console.log(`\n[${i+1}] avg=${r.avg_ms}ms calls=${r.calls} total=${r.total_ms}ms`);
    console.log(`    ${r.query.substring(0, 250).replace(/\n/g, ' ')}`);
  });

  // 7. get_market_resource_prices function
  const q7 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_market_resource_prices'
  `);
  console.log('\n=== get_market_resource_prices ===');
  if (q7.rows.length > 0) console.log(q7.rows[0].def.substring(0, 800));

  // 8. cron.job_run_details size
  const q8 = await c.query(`
    SELECT count(*) as cnt, 
           pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as size,
           min(start_time) as oldest
    FROM cron.job_run_details
  `);
  console.log('\n=== CRON JOB RUN DETAILS ===');
  console.log(`  Rows: ${q8.rows[0].cnt} Size: ${q8.rows[0].size} Oldest: ${q8.rows[0].oldest}`);

  await c.end();
}
main().catch(console.error);
