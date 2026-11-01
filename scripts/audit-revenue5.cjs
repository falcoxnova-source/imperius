const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function audit() {
  await c.connect();
  const RATE = 10000;

  // Total user balances
  console.log('=== TOTAL USER BALANCES ===');
  const totalBal = await c.query(`
    SELECT SUM(fxu_balance) as total_fxu, SUM(usdt_balance) as total_usdt,
           COUNT(*) FILTER (WHERE fxu_balance > 0 OR usdt_balance > 0) as users_with_balance
    FROM profiles
  `);
  console.table(totalBal.rows);

  // Revenue recorded
  const totalRev = await c.query(`
    SELECT SUM(amount)::numeric(20,2) as total_fxu, (SUM(amount) / ${RATE})::numeric(20,4) as total_usd
    FROM admin_revenue WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
  `);
  console.log('\nTOTAL RECORDED REVENUE:', totalRev.rows[0]);

  // Screenshot shows "Retiros 35,451 $3.55" - this is WAY more than the 3.64 FXU recorded
  // Let's check: are withdrawal fees recorded properly?

  console.log('\n=== WITHDRAWAL FEE RECORDS ===');
  const wdFeeRev = await c.query(`
    SELECT id, amount, description, created_at
    FROM admin_revenue WHERE revenue_type = 'withdrawal_fee'
    AND created_at >= '2026-03-30' AND created_at < '2026-04-06'
    ORDER BY amount DESC LIMIT 10
  `);
  console.log(JSON.stringify(wdFeeRev.rows.slice(0, 5), null, 2));

  // How many FXU in withdrawal_fee total?
  const wdTotal = await c.query(`
    SELECT SUM(amount)::numeric(20,8) as total, COUNT(*) as count
    FROM admin_revenue WHERE revenue_type = 'withdrawal_fee'
    AND created_at >= '2026-03-30' AND created_at < '2026-04-06'
  `);
  console.log('Withdrawal fee total in admin_revenue:', wdTotal.rows[0]);

  // Check actual withdrawals and calculate what fee SHOULD be
  console.log('\n=== ACTUAL WITHDRAWALS THIS WEEK ===');
  const withdrawals = await c.query(`
    SELECT tx_type, token_type, COUNT(*) as count,
           SUM(amount)::numeric(20,4) as total_amount,
           SUM(fxu_amount)::numeric(20,4) as total_fxu
    FROM wallet_transactions
    WHERE tx_type = 'withdrawal' AND status = 'confirmed'
    AND created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY tx_type, token_type
  `);
  console.table(withdrawals.rows);

  // Fee should be 10% of what was REQUESTED (gross amount)
  // If someone withdraws 1 USDT with 10% fee, they get 0.9 USDT, fee is 0.1 USDT
  // In FXU terms that's 1000 FXU fee per 1 USDT withdrawn
  
  // Let's look at the withdrawal function
  console.log('\n=== WITHDRAWAL RELATED FUNCTIONS ===');
  const funcs = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE proname LIKE '%withdraw%' OR proname LIKE '%retir%'
    ORDER BY proname
  `);
  funcs.rows.forEach(f => console.log(`  ${f.proname}`));

  // Check process_usdt_withdrawal or similar
  console.log('\n=== SEARCHING FOR USDT WITHDRAWAL FUNCTION ===');
  const wdFunc = await c.query(`
    SELECT proname, LEFT(prosrc, 2000) as src_preview
    FROM pg_proc 
    WHERE proname LIKE '%withdraw%usdt%' OR proname LIKE '%usdt%withdraw%'
    OR proname LIKE '%process%withdraw%'
  `);
  wdFunc.rows.forEach(f => {
    console.log(`\n--- Function: ${f.proname} ---`);
    console.log(f.src_preview);
  });

  // Check the weekly revenue function
  console.log('\n=== WEEKLY REVENUE FUNCTION ===');
  const weeklyFunc = await c.query(`
    SELECT proname, LEFT(prosrc, 3000) as src_preview
    FROM pg_proc 
    WHERE proname LIKE '%weekly%revenue%' OR proname LIKE '%revenue%snapshot%'
    OR proname LIKE '%get_admin_revenue%'
  `);
  weeklyFunc.rows.forEach(f => {
    console.log(`\n--- Function: ${f.proname} ---`);
    console.log(f.src_preview);
  });

  // Expenses
  console.log('\n=== EXPENSES THIS WEEK ===');
  const expenses = await c.query(`
    SELECT expense_type, COUNT(*) as count, SUM(amount)::numeric(20,2) as total_fxu
    FROM admin_expenses
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY expense_type ORDER BY total_fxu DESC
  `);
  console.table(expenses.rows);

  // Check weekly_revenue_snapshots
  console.log('\n=== WEEKLY SNAPSHOTS ===');
  const snaps = await c.query(`
    SELECT week_number, week_start, week_end, revenue_data, total_fxu, total_usd
    FROM weekly_revenue_snapshots 
    ORDER BY week_start DESC LIMIT 3
  `);
  snaps.rows.forEach(s => {
    console.log(`\nWeek ${s.week_number}: ${s.week_start} to ${s.week_end}`);
    console.log(`  Total: ${s.total_fxu} FXU ($${s.total_usd} USD)`);
    if (s.revenue_data) {
      console.log('  Breakdown:', JSON.stringify(s.revenue_data, null, 2));
    }
  });

  await c.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
