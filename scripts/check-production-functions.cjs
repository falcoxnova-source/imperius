const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  
  const functions = [
    'calculate_fxu_cost_fleet',
    'calculate_fxu_cost_building',
    'calculate_fxu_cost_research',
    'calculate_fxu_cost_shipyard',
    'purchase_market_listing',
    'secure_abandon_colony'
  ];

  for (const fname of functions) {
    const r = await client.query(
      `SELECT proname, pg_get_functiondef(oid) as def 
       FROM pg_proc 
       WHERE proname = $1 
       AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
      [fname]
    );
    if (r.rows.length > 0) {
      console.log('\n========================================');
      console.log('FUNCTION: ' + fname);
      console.log('========================================');
      console.log(r.rows[0].def);
    } else {
      console.log('\n[NOT FOUND] ' + fname);
    }
  }

  // Also check if is_user_plus or get_market_fee_for_user already exist
  const helperFns = ['is_user_plus', 'get_market_fee_for_user', 'get_my_market_fee', 'get_market_fee_percent'];
  for (const fname of helperFns) {
    const r = await client.query(
      `SELECT proname FROM pg_proc 
       WHERE proname = $1 
       AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
      [fname]
    );
    console.log('\n[HELPER] ' + fname + ': ' + (r.rows.length > 0 ? 'EXISTS' : 'NOT FOUND'));
  }

  // Check plus_plans current state
  const plans = await client.query('SELECT code, name, price_usdt, price_fxu, duration_months FROM plus_plans ORDER BY price_usdt');
  console.log('\n========================================');
  console.log('PLUS_PLANS:');
  console.log('========================================');
  plans.rows.forEach(r => console.log(`  ${r.code}: $${r.price_usdt}, ${r.price_fxu} FXU, ${r.duration_months} months, "${r.name}"`));

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
