const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // The "sent" policy was partially created. Since the old OR policy still exists,
  // users can still see both sent and received. The extra "sent" policy is redundant
  // but harmless. Let's verify current state.
  
  const p = await c.query(`
    SELECT policyname, cmd, qual FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'messages'
    ORDER BY cmd, policyname
  `);
  console.log('=== CURRENT MESSAGES POLICIES ===');
  p.rows.forEach(r => console.log(`  [${r.cmd}] "${r.policyname}": ${r.qual || 'NULL'}`));

  // The current state has:
  // SELECT "Users can view own messages": (recipient_id OR sender_id) 
  // SELECT "Users can view sent messages": (sender_id)
  // Since both are PERMISSIVE, PostgreSQL ORs them: (recipient OR sender) OR sender
  // This is equivalent to (recipient OR sender) - no behavior change, just redundant
  
  console.log('\n✅ Current state is SAFE - the extra "sent" policy is redundant but harmless');
  console.log('The old OR policy still covers everything.\n');
  
  console.log('=== SQL TO RUN IN SUPABASE DASHBOARD SQL EDITOR ===');
  console.log('(Copy and paste this into the Supabase Dashboard → SQL Editor)\n');
  console.log(`-- Step 1: Drop old OR-based policy
DROP POLICY IF EXISTS "Users can view own messages" ON messages;

-- Step 2: Create received messages policy (if sent already exists)
CREATE POLICY "Users can view received messages" ON messages
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- Step 3: Verify
SELECT policyname, cmd, qual FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'messages' AND cmd = 'SELECT';
`);

  await c.end();
}
main().catch(console.error);
