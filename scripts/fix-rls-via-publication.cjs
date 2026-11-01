const { Client } = require('pg');

// Try session mode (port 5432) first for DDL, fallback to transaction mode (6543)
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
  statement_timeout: 30000,
  lock_timeout: 15000,
});

async function run() {
  await client.connect();
  console.log('Connected.\n');

  try {
    // Step 1: Check current policies
    console.log('=== CURRENT SELECT POLICIES ===');
    const { rows: before } = await client.query(`
      SELECT policyname, qual FROM pg_policies 
      WHERE schemaname='public' AND tablename='messages' AND cmd='SELECT'
      ORDER BY policyname
    `);
    before.forEach(r => console.log(`  ${r.policyname}: ${r.qual}`));

    // Step 2: Remove messages from realtime publication to release lock
    console.log('\n[1/4] Removing messages from supabase_realtime publication...');
    try {
      await client.query('ALTER PUBLICATION supabase_realtime DROP TABLE public.messages');
      console.log('  ✅ Removed from publication');
    } catch (e) {
      if (e.message.includes('is not part of')) {
        console.log('  ⚠️ messages was not in publication (already removed)');
      } else {
        throw e;
      }
    }

    // Small delay to let replication slot release
    await new Promise(r => setTimeout(r, 2000));

    // Step 3: Drop old OR policy + create new received policy
    console.log('[2/4] Dropping old OR policy...');
    await client.query('DROP POLICY IF EXISTS "Users can view own messages" ON messages');
    console.log('  ✅ Dropped "Users can view own messages"');

    console.log('[3/4] Creating received messages policy...');
    // Drop first in case it exists from a previous attempt
    await client.query('DROP POLICY IF EXISTS "Users can view received messages" ON messages');
    await client.query(`
      CREATE POLICY "Users can view received messages" ON messages
        FOR SELECT TO authenticated
        USING (recipient_id = auth.uid())
    `);
    console.log('  ✅ Created "Users can view received messages"');

    // Ensure sent policy exists too
    const { rows: sentCheck } = await client.query(`
      SELECT 1 FROM pg_policies 
      WHERE schemaname='public' AND tablename='messages' 
        AND policyname='Users can view sent messages'
    `);
    if (sentCheck.length === 0) {
      console.log('  Creating "Users can view sent messages"...');
      await client.query(`
        CREATE POLICY "Users can view sent messages" ON messages
          FOR SELECT TO authenticated
          USING (sender_id = auth.uid())
      `);
      console.log('  ✅ Created');
    } else {
      console.log('  ✓ "Users can view sent messages" already exists');
    }

    // Step 4: Re-add messages to realtime publication
    console.log('[4/4] Re-adding messages to supabase_realtime publication...');
    try {
      await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE public.messages');
      console.log('  ✅ Re-added to publication');
    } catch (e) {
      if (e.message.includes('already member')) {
        console.log('  ⚠️ Already in publication');
      } else {
        throw e;
      }
    }

    // Verify final state
    console.log('\n=== FINAL SELECT POLICIES ===');
    const { rows: after } = await client.query(`
      SELECT policyname, qual FROM pg_policies 
      WHERE schemaname='public' AND tablename='messages' AND cmd='SELECT'
      ORDER BY policyname
    `);
    after.forEach(r => console.log(`  ${r.policyname}: ${r.qual}`));

    const hasOld = after.some(r => r.policyname === 'Users can view own messages');
    const hasReceived = after.some(r => r.policyname === 'Users can view received messages');
    const hasSent = after.some(r => r.policyname === 'Users can view sent messages');

    console.log('\n=== RESULT ===');
    if (!hasOld && hasReceived && hasSent) {
      console.log('🎉 SUCCESS! RLS policy split complete.');
      console.log('   Old OR policy removed, 2 separate policies active.');
      console.log('   Expected CPU reduction: ~50% on messages queries.');
    } else {
      console.log('⚠️ Unexpected state:');
      console.log(`   Old OR policy: ${hasOld ? 'STILL EXISTS' : 'removed'}`);
      console.log(`   Received policy: ${hasReceived ? 'exists' : 'MISSING'}`);
      console.log(`   Sent policy: ${hasSent ? 'exists' : 'MISSING'}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    
    // Try to re-add messages to publication if we removed it
    console.log('\n⚠️ Attempting to re-add messages to publication (safety)...');
    try {
      await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE public.messages');
      console.log('  ✅ Re-added to publication');
    } catch (e2) {
      if (e2.message.includes('already member')) {
        console.log('  ✓ Already in publication');
      } else {
        console.log('  ⚠️ Could not re-add:', e2.message);
      }
    }
  }

  await client.end();
}

run().catch(console.error);
