const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Check force RLS
  const r = await c.query(`
    SELECT relname, relrowsecurity, relforcerowsecurity 
    FROM pg_class 
    WHERE relname IN ('twitter_social_config', 'jackpot', 'twitter_actions', 'jackpot_pools')
  `);
  console.log('\n=== RLS Status ===');
  console.table(r.rows);

  // Check RLS policies on twitter_social_config
  const p = await c.query(`
    SELECT polname, polcmd 
    FROM pg_policy 
    WHERE polrelid = (SELECT oid FROM pg_class WHERE relname = 'twitter_social_config')
  `);
  console.log('\n=== twitter_social_config policies ===');
  console.table(p.rows);

  // Try calling the function directly to see the exact error
  try {
    await c.query('SELECT admin_distribute_social_ranking_pool()');
  } catch(e) {
    console.log('\n=== Error from direct call ===');
    console.log(e.message);
  }

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
