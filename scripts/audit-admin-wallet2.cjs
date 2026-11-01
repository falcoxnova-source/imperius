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

  // 1. Get FULL source of accelerate_fleet
  console.log('========================================');
  console.log('1. FULL accelerate_fleet source');
  console.log('========================================');
  const res1 = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'accelerate_fleet'`);
  console.log(res1.rows[0].prosrc);

  // 2. Get FULL source of purchase_plus_subscription
  console.log('\n========================================');
  console.log('2. FULL purchase_plus_subscription source');
  console.log('========================================');
  const res2 = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'`);
  console.log(res2.rows[0].prosrc);

  // 3. Get FULL source of purchase_supply_box  
  console.log('\n========================================');
  console.log('3. FULL purchase_supply_box source');
  console.log('========================================');
  const res3 = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_supply_box'`);
  console.log(res3.rows[0].prosrc);

  // 4. Check officer purchase functions
  console.log('\n========================================');
  console.log('4. Officer purchase functions');
  console.log('========================================');
  const res4 = await client.query(`SELECT proname, prosrc FROM pg_proc WHERE proname ILIKE '%officer%' AND prosrc ILIKE '%fxu%'`);
  res4.rows.forEach(r => {
    console.log(`\n--- ${r.proname} ---`);
    console.log(r.prosrc);
  });

  // 5. Check instant_complete_ship or instant ship functions  
  console.log('\n========================================');
  console.log('5. Instant ship functions');
  console.log('========================================');
  const res5 = await client.query(`SELECT proname, prosrc FROM pg_proc WHERE proname ILIKE '%instant%ship%'`);
  res5.rows.forEach(r => {
    console.log(`\n--- ${r.proname} ---`);
    console.log(r.prosrc);
  });

  // 6. MATH CHECK: How much FXU was deducted from users vs credited to admin?
  console.log('\n========================================');
  console.log('6. MATH CHECK: Revenue recorded vs admin balance');
  console.log('========================================');
  
  // Total recorded in admin_revenue (this is what SHOULD have gone to admin)
  const totalRevenue = await client.query(`SELECT SUM(amount) as total FROM admin_revenue`);
  console.log(`Total admin_revenue records: ${parseFloat(totalRevenue.rows[0].total).toFixed(2)} FXU`);
  
  // Total in jackpot
  const jackpotRes = await client.query(`SELECT * FROM jackpot_pool ORDER BY id LIMIT 1`);
  if (jackpotRes.rows.length > 0) {
    console.log(`Jackpot pool: ${JSON.stringify(jackpotRes.rows[0])}`);
  }
  
  // Admin current balance
  const adminBal = await client.query(`SELECT fxu_balance FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1`);
  console.log(`Admin current fxu_balance: ${parseFloat(adminBal.rows[0].fxu_balance).toFixed(2)} FXU`);

  // Total jackpot contributions
  const jackpotTotal = await client.query(`SELECT SUM(amount) as total FROM jackpot_contributions`);
  console.log(`Total jackpot contributions: ${parseFloat(jackpotTotal.rows[0]?.total || 0).toFixed(2)} FXU`);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
