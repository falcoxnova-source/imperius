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
  
  // Get instant_complete_research full body
  const r1 = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'instant_complete_research'`);
  console.log('=== instant_complete_research ===');
  console.log(r1.rows[0].def);
  
  // Also get calculate_fxu_cost_research to understand its signature
  const r2 = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'calculate_fxu_cost_research'`);
  console.log('\n=== calculate_fxu_cost_research ===');
  console.log(r2.rows[0].def);
  
  // Also check purchase_market_listing
  const r3 = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'purchase_market_listing'`);
  console.log('\n=== purchase_market_listing ===');
  console.log(r3.rows[0].def);
  
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
