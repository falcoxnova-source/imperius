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

  const funcs = ['get_daily_revenue', 'get_weekly_revenue', 'get_monthly_revenue', 
                 'get_platform_financial_stats', 'get_revenue_summary', 'get_revenue_by_type', 'get_recent_revenue'];
  for (const fn of funcs) {
    const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn]);
    if (res.rows.length > 0) {
      const src = res.rows[0].prosrc;
      const hasWithdrawalConversion = src.includes('withdrawal_fee') && src.includes('10000');
      const hasAdminRevenue = src.includes('admin_revenue');
      const sumAmount = src.includes('SUM(amount)') || src.includes('sum(amount)');
      console.log(`${fn}: admin_revenue=${hasAdminRevenue}, SUM(amount)=${sumAmount}, withdrawal_conversion=${hasWithdrawalConversion}`);
      if (hasAdminRevenue && sumAmount && !hasWithdrawalConversion) {
        console.log(`  ⚠️ NEEDS FIX - aggregates admin_revenue without withdrawal_fee conversion`);
      }
    } else {
      console.log(`${fn}: NOT FOUND`);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
