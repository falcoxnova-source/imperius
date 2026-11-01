const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // 1. CRITICAL: Check if our new triggers are still ENABLED after global processor runs
  const q1 = await c.query(`
    SELECT t.tgname, c.relname, t.tgenabled,
      CASE t.tgenabled 
        WHEN 'O' THEN 'ENABLED (origin)' 
        WHEN 'D' THEN '❌ DISABLED' 
        WHEN 'R' THEN 'ENABLED (replica)' 
        WHEN 'A' THEN 'ENABLED (always)' 
      END as status
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname IN ('trigger_building_points', 'trigger_fleet_points', 'trigger_defense_points',
                        'trigger_research_points', 'trigger_fleet_change_points', 'trigger_fleet_ships_change_points')
    ORDER BY c.relname
  `);
  console.log('=== TRIGGER ENABLED STATUS (CRITICAL CHECK) ===');
  q1.rows.forEach(r => console.log(`  ${r.relname}.${r.tgname}: ${r.status}`));

  // 2. Get FULL optimized_global_queue_processor to see ENABLE/DISABLE
  const q2 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'optimized_global_queue_processor'
  `);
  if (q2.rows.length > 0) {
    const def = q2.rows[0].def;
    // Find all DISABLE/ENABLE TRIGGER lines
    const lines = def.split('\n');
    console.log('\n=== DISABLE/ENABLE TRIGGER LINES IN optimized_global_queue_processor ===');
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes('disable trigger') || line.toLowerCase().includes('enable trigger')) {
        console.log(`  Line ${i}: ${line.trim()}`);
      }
    });
  }

  // 3. Check how messages are queried from frontend
  const q3 = await c.query(`
    SELECT query, calls, (total_exec_time/calls)::integer as avg_ms
    FROM pg_stat_statements
    WHERE query ILIKE '%messages%' AND query ILIKE '%recipient%'
    AND calls > 1000
    ORDER BY calls DESC LIMIT 5
  `);
  console.log('\n=== TOP MESSAGES QUERIES BY CALL COUNT ===');
  q3.rows.forEach((r, i) => {
    console.log(`[${i+1}] calls=${r.calls} avg=${r.avg_ms}ms`);
    console.log(`    ${r.query.substring(0, 300).replace(/\n/g, ' ')}`);
  });

  await c.end();
}
main().catch(console.error);
