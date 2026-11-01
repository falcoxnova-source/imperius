const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // Full RLS policies for messages
  const q1 = await c.query(`
    SELECT policyname, cmd, permissive, roles, qual, with_check 
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages'
    ORDER BY cmd, policyname
  `);
  console.log('=== FULL MESSAGES RLS POLICIES ===');
  q1.rows.forEach(r => {
    console.log(`\n  Policy: "${r.policyname}"`);
    console.log(`  CMD: ${r.cmd} | Permissive: ${r.permissive} | Roles: ${r.roles}`);
    console.log(`  USING (qual): ${r.qual || 'NULL'}`);
    console.log(`  WITH CHECK: ${r.with_check || 'NULL'}`);
  });

  // Verify realtime is using messages table
  const q2 = await c.query(`
    SELECT * FROM realtime.subscription LIMIT 5
  `);
  console.log('\n=== REALTIME SUBSCRIPTIONS (sample) ===');
  console.log(`  Count: ${q2.rows.length}`);

  // Explain analyze the slowest query pattern
  const q3 = await c.query(`
    EXPLAIN (ANALYZE false, COSTS true, FORMAT TEXT)
    SELECT id, subject, message_type, is_read, created_at 
    FROM messages 
    WHERE recipient_id = '00000000-0000-0000-0000-000000000000'
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log('\n=== EXPLAIN: Header notifs query ===');
  q3.rows.forEach(r => console.log(`  ${r['QUERY PLAN']}`));

  // Explain the unread count query
  const q4 = await c.query(`
    EXPLAIN (ANALYZE false, COSTS true, FORMAT TEXT)
    SELECT count(*) FROM messages 
    WHERE recipient_id = '00000000-0000-0000-0000-000000000000' AND is_read = false
  `);
  console.log('\n=== EXPLAIN: Unread count query ===');
  q4.rows.forEach(r => console.log(`  ${r['QUERY PLAN']}`));

  // Check if messages has any triggers
  const q5 = await c.query(`
    SELECT t.tgname, p.proname
    FROM pg_trigger t 
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE c.relname = 'messages' AND NOT t.tgisinternal
  `);
  console.log('\n=== MESSAGES TRIGGERS ===');
  if (q5.rows.length === 0) console.log('  None');
  q5.rows.forEach(r => console.log(`  ${r.tgname} -> ${r.proname}`));

  await c.end();
}
main().catch(console.error);
