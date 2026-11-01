const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='plus_subscriptions' ORDER BY ordinal_position");
  console.log('plus_subscriptions columns:', r.rows.map(x => x.column_name));
  
  const r2 = await c.query("SELECT * FROM plus_subscriptions LIMIT 3");
  console.log('\nSample rows:', JSON.stringify(r2.rows, null, 2));
  
  // Also check is_user_plus function body
  const r3 = await c.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'is_user_plus'");
  console.log('\nis_user_plus body:');
  console.log(r3.rows[0].def);
  
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
