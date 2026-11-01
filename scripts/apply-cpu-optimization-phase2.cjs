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
  console.log('Connected\n');

  const statements = [
    // 1. Split RLS SELECT policy
    {
      name: 'Drop old OR-based SELECT policy on messages',
      sql: `DROP POLICY IF EXISTS "Users can view own messages" ON messages`
    },
    {
      name: 'Create policy: Users can view received messages (recipient_id)',
      sql: `CREATE POLICY "Users can view received messages" ON messages
        FOR SELECT TO authenticated
        USING (recipient_id = auth.uid())`
    },
    {
      name: 'Create policy: Users can view sent messages (sender_id)',
      sql: `CREATE POLICY "Users can view sent messages" ON messages
        FOR SELECT TO authenticated
        USING (sender_id = auth.uid())`
    },

    // 2. Add indexes
    {
      name: 'Create idx_messages_recipient_created (for Header ORDER BY query)',
      sql: `CREATE INDEX IF NOT EXISTS idx_messages_recipient_created ON messages(recipient_id, created_at DESC)`
    },
    {
      name: 'Create idx_messages_sender_created (for sent messages query)',
      sql: `CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON messages(sender_id, created_at DESC)`
    },
    {
      name: 'Create idx_messages_recipient_type (for message_type filters)',
      sql: `CREATE INDEX IF NOT EXISTS idx_messages_recipient_type ON messages(recipient_id, message_type, created_at DESC)`
    },

    // 3. pg_cron: auto-cleanup old messages
    {
      name: 'Schedule pg_cron: cleanup-old-game-messages (3:30 AM daily)',
      sql: `SELECT cron.schedule(
        'cleanup-old-game-messages',
        '30 3 * * *',
        $$DELETE FROM public.messages 
          WHERE (
            (message_type IN ('expedition', 'espionage') AND created_at < now() - interval '14 days')
            OR (message_type = 'system' AND created_at < now() - interval '30 days')
            OR (message_type = 'combat' AND created_at < now() - interval '30 days')
          )$$
      )`
    },

    // 4. pg_cron: cleanup cron.job_run_details
    {
      name: 'Schedule pg_cron: cleanup-cron-run-details (4:30 AM daily)',
      sql: `SELECT cron.schedule(
        'cleanup-cron-run-details',
        '30 4 * * *',
        $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
      )`
    },

    // 5. Immediate cleanup: expedition/espionage > 14 days
    {
      name: 'Cleanup: expedition/espionage messages > 14 days',
      sql: `DELETE FROM messages WHERE message_type IN ('expedition', 'espionage') AND created_at < now() - interval '14 days'`
    },

    // 6. Immediate cleanup: system messages > 30 days
    {
      name: 'Cleanup: system messages > 30 days',
      sql: `DELETE FROM messages WHERE message_type = 'system' AND created_at < now() - interval '30 days'`
    },

    // 7. Immediate cleanup: combat messages > 30 days
    {
      name: 'Cleanup: combat messages > 30 days',
      sql: `DELETE FROM messages WHERE message_type = 'combat' AND created_at < now() - interval '30 days'`
    },

    // 8. Immediate cleanup: cron.job_run_details > 7 days
    {
      name: 'Cleanup: cron.job_run_details > 7 days',
      sql: `DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'`
    }
  ];

  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const { name, sql } = statements[i];
    console.log(`[${i + 1}/${statements.length}] ${name}...`);
    try {
      const result = await c.query(sql);
      console.log(`  ✓ OK (rows: ${result.rowCount})`);
      success++;
    } catch (err) {
      console.error(`  ✗ ERROR: ${err.message}`);
      failed++;
    }
  }

  // VACUUM ANALYZE (must be outside transaction, autocommit)
  console.log('\n=== VACUUM ANALYZE (separate commands) ===');
  const vacuumTables = ['messages', 'fleets', 'planet_buildings', 'planet_ships', 'planet_defenses', 'user_technologies', 'market_listings'];
  for (const table of vacuumTables) {
    console.log(`VACUUM ANALYZE ${table}...`);
    try {
      await c.query(`VACUUM ANALYZE ${table}`);
      console.log(`  ✓ OK`);
    } catch (err) {
      console.error(`  ✗ ERROR: ${err.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Results: ${success} succeeded, ${failed} failed`);
  console.log(`========================================\n`);

  // VERIFICATION
  console.log('=== VERIFICATION ===\n');

  // Check policies
  const p = await c.query(`
    SELECT policyname, cmd, qual FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'messages' AND cmd = 'SELECT'
  `);
  console.log('Messages SELECT policies:');
  p.rows.forEach(r => console.log(`  "${r.policyname}": ${r.qual}`));

  // Check indexes
  const idx = await c.query(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'messages' AND schemaname = 'public'
  `);
  console.log('\nMessages indexes:');
  idx.rows.forEach(r => console.log(`  ${r.indexname}`));

  // Check new pg_cron jobs
  const jobs = await c.query(`
    SELECT jobname, schedule FROM cron.job 
    WHERE jobname IN ('cleanup-old-game-messages', 'cleanup-cron-run-details')
  `);
  console.log('\nNew pg_cron jobs:');
  jobs.rows.forEach(r => console.log(`  "${r.jobname}" schedule="${r.schedule}"`));

  // Check messages count after cleanup
  const msgCount = await c.query(`
    SELECT count(*) as total,
           pg_size_pretty(pg_total_relation_size('public.messages')) as size
    FROM messages
  `);
  console.log(`\nMessages after cleanup: ${msgCount.rows[0].total} rows, ${msgCount.rows[0].size}`);

  // Check cron.job_run_details after cleanup
  const cronCount = await c.query(`
    SELECT count(*) as total,
           pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as size
    FROM cron.job_run_details
  `);
  console.log(`cron.job_run_details after cleanup: ${cronCount.rows[0].total} rows, ${cronCount.rows[0].size}`);

  await c.end();
  console.log('\n✅ Done!');
}

main().catch(console.error);
