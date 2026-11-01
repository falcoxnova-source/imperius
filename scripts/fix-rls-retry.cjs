const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // Retry RLS policy changes with short lock_timeout
  console.log('Setting lock_timeout to 10s...');
  await c.query(`SET lock_timeout = '10s'`);

  const steps = [
    {
      name: 'Drop old OR-based SELECT policy',
      sql: `DROP POLICY IF EXISTS "Users can view own messages" ON messages`
    },
    {
      name: 'Create policy: received messages',
      sql: `CREATE POLICY "Users can view received messages" ON messages FOR SELECT TO authenticated USING (recipient_id = auth.uid())`
    },
    {
      name: 'Create policy: sent messages',
      sql: `CREATE POLICY "Users can view sent messages" ON messages FOR SELECT TO authenticated USING (sender_id = auth.uid())`
    }
  ];

  for (const { name, sql } of steps) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`[Attempt ${attempt}] ${name}...`);
      try {
        await c.query(sql);
        console.log('  ✓ OK');
        break;
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
        if (attempt < 5) {
          console.log('  Waiting 3s before retry...');
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }
  }

  // Verify
  const p = await c.query(`
    SELECT policyname, qual FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'messages' AND cmd = 'SELECT'
  `);
  console.log('\n=== FINAL SELECT POLICIES ===');
  p.rows.forEach(r => console.log(`  "${r.policyname}": ${r.qual}`));

  const expected = p.rows.length === 2 
    && p.rows.some(r => r.policyname.includes('received'))
    && p.rows.some(r => r.policyname.includes('sent'));
  console.log(`\nPolicies correct: ${expected ? '✅ YES' : '❌ NO - check above'}`);

  await c.end();
}
main().catch(console.error);
