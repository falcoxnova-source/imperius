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

  // 1. Get the snapshot functions
  const funcs = ['get_weekly_revenue_snapshots', 'admin_take_weekly_snapshot_now', 'get_current_week_revenue'];
  for (const fn of funcs) {
    const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn]);
    if (res.rows.length > 0) {
      console.log(`\n=== ${fn} ===`);
      console.log(res.rows[0].prosrc);
    } else {
      console.log(`\n=== ${fn} === NOT FOUND`);
    }
  }

  // 2. Check admin_revenue for withdrawal_fee - what values are stored?
  const rev = await c.query(`
    SELECT amount, description, created_at 
    FROM admin_revenue 
    WHERE revenue_type = 'withdrawal_fee' 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.log('\n=== Recent withdrawal_fee entries in admin_revenue ===');
  rev.rows.forEach(r => console.log(`  ${r.amount} | ${r.description} | ${r.created_at}`));

  // 3. Check wallet_transactions for USDT withdrawals
  const wt = await c.query(`
    SELECT amount, fxu_amount, token_type, status, created_at 
    FROM wallet_transactions 
    WHERE tx_type = 'withdrawal' 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.log('\n=== Recent withdrawals in wallet_transactions ===');
  wt.rows.forEach(r => console.log(`  amount=${r.amount} fxu_amount=${r.fxu_amount} token=${r.token_type} status=${r.status} | ${r.created_at}`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
