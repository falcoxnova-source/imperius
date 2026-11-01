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

  const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'take_weekly_revenue_snapshot'`);
  console.log('=== take_weekly_revenue_snapshot ===');
  console.log(res.rows[0]?.prosrc || 'NOT FOUND');

  // Also check the FXU/USDT rate
  const rate = await c.query(`SELECT fxu_cost_usdt FROM wallet_config WHERE id = 1`);
  console.log('\n=== FXU rate ===');
  console.log('fxu_cost_usdt:', rate.rows[0]?.fxu_cost_usdt);

  // Check total withdrawal_fee this week vs other types
  const wk = await c.query(`
    SELECT revenue_type, SUM(amount) as total, COUNT(*) as cnt
    FROM admin_revenue
    WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)::timestamptz
    GROUP BY revenue_type
    ORDER BY total DESC
  `);
  console.log('\n=== This week breakdown (raw) ===');
  wk.rows.forEach(r => console.log(`  ${r.revenue_type}: ${r.total} (${r.cnt} ops)`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
