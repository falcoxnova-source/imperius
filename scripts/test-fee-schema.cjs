const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  
  // Find the points column
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    ORDER BY ordinal_position
  `);
  console.log('Profiles columns:', cols.rows.map(r => r.column_name).join(', '));

  // Check how get_market_fee_for_user determines ranking
  const funcDef = await client.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'get_market_fee_for_user'
  `);
  console.log('\n=== get_market_fee_for_user BODY ===');
  console.log(funcDef.rows[0].def);

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
