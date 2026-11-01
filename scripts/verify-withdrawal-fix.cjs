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

  // Re-check all functions have the conversion
  const funcs = ['get_daily_revenue', 'get_weekly_revenue', 'get_monthly_revenue', 
                 'get_platform_financial_stats', 'get_revenue_summary', 'get_revenue_by_type',
                 'get_recent_revenue', 'get_weekly_revenue_snapshots', 'take_weekly_revenue_snapshot'];
  
  console.log('=== Verification: all functions have withdrawal_fee conversion ===\n');
  let allGood = true;
  for (const fn of funcs) {
    const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn]);
    if (res.rows.length > 0) {
      const src = res.rows[0].prosrc;
      const hasConversion = src.includes("'withdrawal_fee'") && src.includes('10000');
      console.log(`  ${hasConversion ? '✅' : '❌'} ${fn}`);
      if (!hasConversion) allGood = false;
    }
  }

  console.log(`\n${allGood ? '✅ ALL FUNCTIONS FIXED' : '❌ SOME FUNCTIONS STILL NEED FIX'}`);

  // Show example: what a 10 USDT withdrawal fee looks like now
  console.log('\n=== Example: Recent withdrawal_fee entries ===');
  const recent = await c.query(`
    SELECT amount as usdt_amount, 
           amount * 10000 as fxu_equivalent,
           (amount * 10000 * 0.0001) as usd_display,
           created_at
    FROM admin_revenue 
    WHERE revenue_type = 'withdrawal_fee'
    ORDER BY created_at DESC LIMIT 5
  `);
  recent.rows.forEach(r => {
    console.log(`  ${Number(r.usdt_amount).toFixed(4)} USDT → ${Number(r.fxu_equivalent).toLocaleString()} FXU → display: $${Number(r.usd_display).toFixed(2)} USD ✅`);
  });

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
