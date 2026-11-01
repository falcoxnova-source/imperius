const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Get exact source of calculate_monthly_market_limit
  const r1 = await client.query(`
    SELECT pg_get_functiondef(oid) as full_def
    FROM pg_proc WHERE proname = 'calculate_monthly_market_limit'
  `);
  console.log('=== calculate_monthly_market_limit FULL DEF ===');
  console.log(r1.rows[0].full_def);

  // Also get get_my_monthly_market_sales full def
  const r2 = await client.query(`
    SELECT pg_get_functiondef(oid) as full_def
    FROM pg_proc WHERE proname = 'get_my_monthly_market_sales'
  `);
  console.log('\n=== get_my_monthly_market_sales FULL DEF ===');
  console.log(r2.rows[0].full_def);

  // Also get get_user_lifetime_fxu_spent full def
  const r3 = await client.query(`
    SELECT pg_get_functiondef(oid) as full_def
    FROM pg_proc WHERE proname = 'get_user_lifetime_fxu_spent'
  `);
  console.log('\n=== get_user_lifetime_fxu_spent FULL DEF ===');
  console.log(r3.rows[0].full_def);

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
