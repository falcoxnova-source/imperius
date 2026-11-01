const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const functions = [
    'is_user_plus',
    'purchase_plus_subscription',
    'get_plus_status',
    'get_my_market_fee',
    'get_market_fee_for_user',
    'calculate_fxu_cost_building',
    'calculate_fxu_cost_research',
    'calculate_fxu_cost_shipyard',
    'calculate_fxu_cost_fleet',
    'secure_abandon_colony',
    'instant_complete_research',
    'purchase_market_listing'
  ];

  for (const fn of functions) {
    const res = await client.query(
      `SELECT prosrc FROM pg_proc WHERE proname = $1 LIMIT 1`, [fn]
    );
    if (res.rows.length > 0) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`FUNCTION: ${fn}`);
      console.log(`${'='.repeat(60)}`);
      console.log(res.rows[0].prosrc);
    } else {
      console.log(`\n*** FUNCTION NOT FOUND: ${fn} ***`);
    }
  }

  // Check plus_plans table
  const plans = await client.query('SELECT * FROM plus_plans ORDER BY price_usd');
  console.log(`\n${'='.repeat(60)}`);
  console.log('PLUS_PLANS TABLE:');
  console.log(`${'='.repeat(60)}`);
  console.table(plans.rows);

  // Check plus_subscriptions table structure
  const cols = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'plus_subscriptions' 
    ORDER BY ordinal_position
  `);
  console.log(`\n${'='.repeat(60)}`);
  console.log('PLUS_SUBSCRIPTIONS COLUMNS:');
  console.log(`${'='.repeat(60)}`);
  console.table(cols.rows);

  // Check active subscriptions
  const active = await client.query('SELECT COUNT(*) as count FROM plus_subscriptions WHERE is_active = true');
  console.log(`\nActive subscriptions: ${active.rows[0].count}`);

  await client.end();
}

main().catch(console.error);
