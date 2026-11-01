const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();

  // ALL revenue types in admin_revenue
  const { rows: types } = await c.query(`
    SELECT revenue_type, 
           COUNT(*) as transactions,
           COUNT(DISTINCT related_user_id) as unique_users,
           SUM(amount) as total_amount,
           MIN(amount) as min_amount,
           MAX(amount) as max_amount,
           MIN(created_at)::date as first_date,
           MAX(created_at)::date as last_date
    FROM admin_revenue
    GROUP BY revenue_type
    ORDER BY total_amount DESC
  `);

  console.log('=== ALL revenue_type in admin_revenue ===\n');
  console.log('Type'.padEnd(25), 'Txns'.padStart(6), 'Users'.padStart(6), 'Total FXU'.padStart(15), 'Min'.padStart(10), 'Max'.padStart(12), 'First'.padStart(12), 'Last'.padStart(12));
  console.log('-'.repeat(110));
  
  let grandTotal = 0;
  for (const r of types) {
    const total = parseFloat(r.total_amount);
    grandTotal += total;
    console.log(
      r.revenue_type.padEnd(25),
      String(r.transactions).padStart(6),
      String(r.unique_users).padStart(6),
      total.toFixed(2).padStart(15),
      parseFloat(r.min_amount).toFixed(2).padStart(10),
      parseFloat(r.max_amount).toFixed(2).padStart(12),
      String(r.first_date).padStart(12),
      String(r.last_date).padStart(12)
    );
  }
  console.log('-'.repeat(110));
  console.log('GRAND TOTAL'.padEnd(25), ''.padStart(6), ''.padStart(6), grandTotal.toFixed(2).padStart(15));

  // Current function includes these types:
  const currentTypes = [
    'instant_build', 'instant_research', 'instant_ship',
    'officer_fxu', 'supply_box', 'fleet_acceleration',
    'expedition_fee', 'swap_fee', 'transfer_fee',
    'plus_subscription'
  ];
  
  console.log('\n=== Types currently in get_user_lifetime_fxu_spent ===');
  currentTypes.forEach(t => console.log('  ✅', t));
  
  const allTypes = types.map(r => r.revenue_type);
  const notIncluded = allTypes.filter(t => !currentTypes.includes(t));
  if (notIncluded.length > 0) {
    console.log('\n=== Types NOT in the function (excluded) ===');
    notIncluded.forEach(t => console.log('  ❌', t));
  }

  // Also check: what are swap_fee and transfer_fee exactly?
  console.log('\n=== Sample swap_fee descriptions ===');
  const { rows: swapSamples } = await c.query(`
    SELECT description, amount, created_at::date 
    FROM admin_revenue WHERE revenue_type = 'swap_fee' 
    ORDER BY created_at DESC LIMIT 5
  `);
  swapSamples.forEach(r => console.log('  ', parseFloat(r.amount).toFixed(2), '-', r.description));

  console.log('\n=== Sample transfer_fee descriptions ===');
  const { rows: transferSamples } = await c.query(`
    SELECT description, amount, created_at::date 
    FROM admin_revenue WHERE revenue_type = 'transfer_fee' 
    ORDER BY created_at DESC LIMIT 5
  `);
  transferSamples.forEach(r => console.log('  ', parseFloat(r.amount).toFixed(2), '-', r.description));

  console.log('\n=== Sample expedition_fee descriptions ===');
  const { rows: expSamples } = await c.query(`
    SELECT description, amount, created_at::date 
    FROM admin_revenue WHERE revenue_type = 'expedition_fee' 
    ORDER BY created_at DESC LIMIT 5
  `);
  expSamples.forEach(r => console.log('  ', parseFloat(r.amount).toFixed(2), '-', r.description));

  console.log('\n=== Sample officer_fxu descriptions ===');
  const { rows: offSamples } = await c.query(`
    SELECT description, amount, created_at::date 
    FROM admin_revenue WHERE revenue_type = 'officer_fxu' 
    ORDER BY created_at DESC LIMIT 5
  `);
  offSamples.forEach(r => console.log('  ', parseFloat(r.amount).toFixed(2), '-', r.description));

  console.log('\n=== Sample market_fee descriptions ===');
  const { rows: mktSamples } = await c.query(`
    SELECT description, amount, created_at::date 
    FROM admin_revenue WHERE revenue_type = 'market_fee' 
    ORDER BY created_at DESC LIMIT 5
  `);
  mktSamples.forEach(r => console.log('  ', parseFloat(r.amount).toFixed(2), '-', r.description));

  await c.end();
})();
