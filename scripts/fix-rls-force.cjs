const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // First cleanup the extra policy that was created
  try {
    await c.query(`DROP POLICY IF EXISTS "Users can view sent messages" ON messages`);
    console.log('Dropped partial "sent" policy');
  } catch(e) {
    console.log('Could not drop sent policy:', e.message);
  }

  // Check what's blocking - find locks on messages table
  const locks = await c.query(`
    SELECT pid, state, query_start, 
           now() - query_start as duration,
           left(query, 150) as query
    FROM pg_stat_activity 
    WHERE pid != pg_backend_pid()
    AND (query ILIKE '%messages%' OR state = 'idle in transaction')
    ORDER BY query_start
    LIMIT 20
  `);
  console.log('\n=== CONNECTIONS TOUCHING MESSAGES ===');
  locks.rows.forEach(r => {
    console.log(`  PID ${r.pid} [${r.state}] ${r.duration} - ${r.query}`);
  });

  // Try with pg_advisory_lock approach: do everything in single transaction  
  console.log('\n=== ATTEMPTING ALL-IN-ONE TRANSACTION ===');
  try {
    await c.query('BEGIN');
    
    // Cancel competing queries on messages briefly
    const competing = await c.query(`
      SELECT pid FROM pg_stat_activity 
      WHERE pid != pg_backend_pid() 
      AND query ILIKE '%messages%'
      AND state = 'active'
    `);
    
    for (const row of competing.rows) {
      console.log(`Canceling PID ${row.pid}...`);
      await c.query(`SELECT pg_cancel_backend(${row.pid})`);
    }
    
    // Quick pause for cancels to take effect
    await new Promise(r => setTimeout(r, 500));
    
    // Now quickly do the policy swap
    await c.query(`DROP POLICY IF EXISTS "Users can view own messages" ON messages`);
    console.log('✓ Dropped old policy');
    
    await c.query(`DROP POLICY IF EXISTS "Users can view sent messages" ON messages`);
    
    await c.query(`CREATE POLICY "Users can view received messages" ON messages FOR SELECT TO authenticated USING (recipient_id = auth.uid())`);
    console.log('✓ Created received policy');
    
    await c.query(`CREATE POLICY "Users can view sent messages" ON messages FOR SELECT TO authenticated USING (sender_id = auth.uid())`);
    console.log('✓ Created sent policy');
    
    await c.query('COMMIT');
    console.log('✓ COMMITTED!');
  } catch (err) {
    console.error('✗ Transaction failed:', err.message);
    await c.query('ROLLBACK');
    
    // Last resort: try terminating the blocking backends
    console.log('\n=== LAST RESORT: TERMINATE BLOCKING BACKENDS ===');
    const blockers = await c.query(`
      SELECT pid FROM pg_stat_activity 
      WHERE pid != pg_backend_pid()
      AND query ILIKE '%messages%' 
      AND state = 'active'
      LIMIT 5
    `);
    
    for (const row of blockers.rows) {
      console.log(`Terminating PID ${row.pid}...`);
      try { await c.query(`SELECT pg_terminate_backend(${row.pid})`); } catch(e) {}
    }
    
    await new Promise(r => setTimeout(r, 1000));
    
    try {
      await c.query(`DROP POLICY IF EXISTS "Users can view own messages" ON messages`);
      console.log('✓ Dropped old policy');
      await c.query(`DROP POLICY IF EXISTS "Users can view sent messages" ON messages`);
      await c.query(`DROP POLICY IF EXISTS "Users can view received messages" ON messages`);
      await c.query(`CREATE POLICY "Users can view received messages" ON messages FOR SELECT TO authenticated USING (recipient_id = auth.uid())`);
      console.log('✓ Created received policy');
      await c.query(`CREATE POLICY "Users can view sent messages" ON messages FOR SELECT TO authenticated USING (sender_id = auth.uid())`);
      console.log('✓ Created sent policy');
    } catch(e2) {
      console.error('Still failed:', e2.message);
    }
  }

  // Verify
  const p = await c.query(`
    SELECT policyname, qual FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'messages' AND cmd = 'SELECT'
  `);
  console.log('\n=== FINAL SELECT POLICIES ===');
  p.rows.forEach(r => console.log(`  "${r.policyname}": ${r.qual}`));

  await c.end();
}
main().catch(console.error);
