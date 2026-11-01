const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const adminId = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6';

  // Key question: What's the total FXU that SHOULD have been credited to admin this week?
  // vs what's actually in admin wallet?

  // 1. Sum all admin_revenue this week (FXU only, excluding withdrawal_fee which is USDT)
  const revFxu = await c.query(`
    SELECT SUM(amount) as total 
    FROM admin_revenue 
    WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)::timestamptz
    AND revenue_type != 'withdrawal_fee'
  `);
  console.log('Total FXU logged in admin_revenue this week (exc. withdrawal_fee):', revFxu.rows[0].total);

  // 2. But market_fee only records the ADMIN portion (50%), 
  //    and fleet_acceleration/accelerate_fleet records total but only 51% goes to admin
  //    Let me check: is the amount in admin_revenue the FULL fee or just admin's share?

  // For market_fee: the revenue record says "admin XX%" so it's already the admin portion
  // For fleet_acceleration: need to check
  
  const accelSample = await c.query(`
    SELECT amount, description 
    FROM admin_revenue 
    WHERE revenue_type = 'fleet_acceleration' 
    ORDER BY created_at DESC LIMIT 3
  `);
  console.log('\nFleet acceleration revenue samples:');
  accelSample.rows.forEach(r => console.log(`  ${r.amount} | ${r.description}`));

  const mktSample = await c.query(`
    SELECT amount, description 
    FROM admin_revenue 
    WHERE revenue_type = 'market_fee' 
    ORDER BY created_at DESC LIMIT 3
  `);
  console.log('\nMarket fee revenue samples:');
  mktSample.rows.forEach(r => console.log(`  ${r.amount} | ${r.description}`));

  // 3. Check: Does accelerate_fleet record the FULL amount or just admin's 51%?
  const accelFunc = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'accelerate_fleet'`);
  const src = accelFunc.rows[0].prosrc;
  const lines = src.split('\n');
  console.log('\n=== accelerate_fleet - revenue recording lines ===');
  for (const line of lines) {
    if (line.toLowerCase().includes('revenue') || line.toLowerCase().includes('record_admin')) {
      console.log(line.trim());
    }
  }

  // 4. What does record_admin_revenue actually get for fleet accel? 
  // Is it the full amount or the admin share?
  console.log('\n=== accelerate_fleet - jackpot vs admin split ===');
  for (const line of lines) {
    if (line.includes('v_jackpot') || line.includes('v_revenue') || line.includes('v_admin') || 
        line.includes('51') || line.includes('49') || line.includes('contribute_to_jackpot')) {
      console.log(line.trim());
    }
  }

  // 5. Admin balance now vs total revenue that should have been credited
  const adminBal = await c.query(`SELECT fxu_balance FROM profiles WHERE id = $1`, [adminId]);
  console.log('\n=== Summary ===');
  console.log('Admin FXU balance now:', adminBal.rows[0].fxu_balance);
  console.log('Total FXU in admin_revenue this week:', revFxu.rows[0].total);

  // 6. When did the admin balance get reset to 0?
  // The admin balance was reset at some point today. Revenue AFTER that should be in wallet.
  // Let's sum revenue from the last ~3 hours (since reset was probably in this session)

  // Actually, let's look at what the FXU protection trigger logs show
  // OR: let's check the market_fee split - does admin_revenue record admin's share or total?

  // 7. Check plus_subscription - is 100K going to admin?
  const plusSample = await c.query(`
    SELECT amount, description 
    FROM admin_revenue 
    WHERE revenue_type = 'plus_subscription' 
    AND created_at >= DATE_TRUNC('week', CURRENT_DATE)::timestamptz
  `);
  console.log('\nPlus subscription entries this week:');
  plusSample.rows.forEach(r => console.log(`  ${r.amount} | ${r.description}`));

  // Check purchase_plus_subscription function
  const plusFunc = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'`);
  if (plusFunc.rows.length > 0) {
    const plusSrc = plusFunc.rows[0].prosrc;
    console.log('\n=== purchase_plus_subscription - admin credit lines ===');
    const plusLines = plusSrc.split('\n');
    for (const line of plusLines) {
      if (line.includes('admin') || line.includes('revenue') || line.includes('jackpot') || line.includes('fxu_balance +')) {
        console.log(line.trim());
      }
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
