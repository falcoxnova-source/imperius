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

  // Check functions that handle swap_fee, transfer_fee, market_fee, demolish_fee
  const funcs = ['swap_fxu_to_usdt', 'swap_usdt_to_fxu', 'transfer_fxu', 'create_market_listing', 
                 'purchase_market_listing', 'demolish_building'];
  
  for (const fn of funcs) {
    const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn]);
    if (res.rows.length > 0) {
      const src = res.rows[0].prosrc;
      // Check if it credits admin wallet (UPDATE profiles SET fxu_balance for admin)
      const creditsAdmin = src.includes('v_admin_id') && src.includes('fxu_balance + ');
      const recordsRevenue = src.includes('record_admin_revenue') || src.includes('admin_revenue');
      const hasAdminLookup = src.includes('is_admin = true');
      console.log(`${fn}:`);
      console.log(`  Records admin_revenue: ${recordsRevenue ? '✅' : '❌'}`);
      console.log(`  Finds admin user: ${hasAdminLookup ? '✅' : '❌'}`);
      console.log(`  Credits admin fxu_balance: ${creditsAdmin ? '✅' : '❌'}`);
      if (recordsRevenue && !creditsAdmin) {
        console.log(`  ⚠️⚠️ SAME BUG AS accelerate_fleet — LOGS but NEVER PAYS ADMIN ⚠️⚠️`);
      }
      console.log('');
    }
  }

  // Also check admin's current balances
  const admin = await c.query(`SELECT fxu_balance, usdt_balance FROM profiles WHERE is_admin = true ORDER BY created_at LIMIT 1`);
  console.log(`\nAdmin balances: FXU=${admin.rows[0].fxu_balance}, USDT=${admin.rows[0].usdt_balance}`);

  // Revenue this week by type
  const rev = await c.query(`
    SELECT revenue_type, 
           SUM(amount) as raw_amount,
           COUNT(*) as cnt
    FROM admin_revenue
    WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)::timestamptz
    GROUP BY revenue_type
    ORDER BY raw_amount DESC
  `);
  console.log('\nThis week revenue (raw amounts in admin_revenue):');
  rev.rows.forEach(r => console.log(`  ${r.revenue_type}: ${r.raw_amount} (${r.cnt} ops)`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
