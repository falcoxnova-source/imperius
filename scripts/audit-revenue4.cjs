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

  // Where are user balances stored? Check profiles
  console.log('=== PROFILES BALANCE COLUMNS ===');
  const profCols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'profiles' AND (column_name LIKE '%balance%' OR column_name LIKE '%fxu%' OR column_name LIKE '%usdt%' OR column_name LIKE '%wallet%')
    ORDER BY ordinal_position
  `);
  console.table(profCols.rows);

  // Total user balances
  console.log('\n=== TOTAL USER BALANCES ===');
  const totalBal = await c.query(`
    SELECT SUM(balance_fxu) as total_fxu, SUM(balance_usdt) as total_usdt,
           COUNT(*) as users_with_balance
    FROM profiles WHERE balance_fxu > 0 OR balance_usdt > 0
  `);
  console.table(totalBal.rows);

  // Revenue breakdown analysis
  console.log('\n=== REVENUE BREAKDOWN (week 2026-03-30 to 2026-04-05) ===');
  const rev = await c.query(`
    SELECT revenue_type, 
           COUNT(*) as tx_count, 
           SUM(amount)::numeric(20,2) as total_fxu,
           (SUM(amount) / ${RATE})::numeric(20,4) as total_usd
    FROM admin_revenue
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY revenue_type
    ORDER BY total_fxu DESC
  `);
  console.table(rev.rows);

  const totalRev = await c.query(`
    SELECT SUM(amount)::numeric(20,2) as total_fxu, (SUM(amount) / ${RATE})::numeric(20,4) as total_usd
    FROM admin_revenue WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
  `);
  console.log('TOTAL RECORDED REVENUE:', totalRev.rows[0]);

  // Screenshot shows 518,649.89 FXU ($51.86 USD) but we see 482,202 FXU ($48.22)
  // Difference: ~36,447 FXU ($3.64)
  // Let's see what's happening with withdrawal fees (only $0.0003 recorded!)

  // Withdrawal fees analysis
  console.log('\n=== WITHDRAWAL FEE ANALYSIS ===');
  const withdrawals = await c.query(`
    SELECT wt.id, wt.amount, wt.fxu_amount, wt.token_type, wt.created_at,
           pr.username
    FROM wallet_transactions wt
    LEFT JOIN profiles pr ON wt.user_id = pr.id
    WHERE wt.tx_type = 'withdrawal' AND wt.status = 'confirmed'
    AND wt.created_at >= '2026-03-30' AND wt.created_at < '2026-04-06'
    ORDER BY wt.created_at DESC
  `);
  console.log(`Total withdrawals this week: ${withdrawals.rows.length}`);
  let totalWithdrawalAmount = 0;
  let totalWithdrawalFxu = 0;
  withdrawals.rows.forEach(w => {
    totalWithdrawalAmount += parseFloat(w.amount);
    totalWithdrawalFxu += parseFloat(w.fxu_amount);
  });
  console.log(`Total USDT withdrawn: ${totalWithdrawalAmount.toFixed(4)}`);
  console.log(`Total FXU equivalent: ${totalWithdrawalFxu.toFixed(4)}`);
  console.log(`Expected 10% fee: ${(totalWithdrawalFxu * 0.1).toFixed(2)} FXU = ${(totalWithdrawalAmount * 0.1).toFixed(4)} USDT`);

  // What USDT revenue is tracked?
  console.log('\n=== WITHDRAWAL FEE in admin_revenue ===');
  const wdFees = await c.query(`
    SELECT * FROM admin_revenue
    WHERE revenue_type = 'withdrawal_fee'
    AND created_at >= '2026-03-30' AND created_at < '2026-04-06'
    ORDER BY created_at DESC LIMIT 10
  `);
  console.log(JSON.stringify(wdFees.rows.slice(0, 3), null, 2));
  const totalWdFee = await c.query(`
    SELECT SUM(amount) as total FROM admin_revenue
    WHERE revenue_type = 'withdrawal_fee'
    AND created_at >= '2026-03-30' AND created_at < '2026-04-06'
  `);
  console.log('Total withdrawal_fee recorded:', totalWdFee.rows[0]);

  // Expenses analysis
  console.log('\n=== EXPENSES THIS WEEK ===');
  const expenses = await c.query(`
    SELECT expense_type, COUNT(*) as count, SUM(amount)::numeric(20,2) as total_fxu,
           (SUM(amount) / ${RATE})::numeric(20,4) as total_usd
    FROM admin_expenses
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY expense_type ORDER BY total_fxu DESC
  `);
  console.table(expenses.rows);

  const totalExp = await c.query(`
    SELECT SUM(amount)::numeric(20,2) as total_fxu, (SUM(amount) / ${RATE})::numeric(20,4) as total_usd
    FROM admin_expenses WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
  `);
  console.log('TOTAL EXPENSES:', totalExp.rows[0]);

  // Net revenue = revenue - expenses
  const netFxu = parseFloat(totalRev.rows[0].total_fxu) - parseFloat(totalExp.rows[0]?.total_fxu || 0);
  console.log(`\nNET: ${netFxu.toFixed(2)} FXU = $${(netFxu / RATE).toFixed(4)} USD`);

  // Now let's find what screenshot shows but DB doesn't
  // Screenshot: Swap=15614, Mercado=23388, lottery_fee=2115, Oficiales=5000, Naves=8857, Transfer=5406
  // Screenshot: Construir=20630, planet_rename=100, Retiros=35451, Plus=100020
  // Screenshot: Investigar=171, alliance_creation=500, Acelerar=300398
  
  // WAIT - screenshot shows "Retiros 35,451 $3.55" but admin_revenue only shows 3.64 FXU!!
  // That means withdrawal_fee should be ~35,451 FXU but DB records 3.64 FXU
  // OR the UI is computing it differently

  // Let's check the weekly snapshot function
  console.log('\n=== WEEKLY REVENUE SNAPSHOTS ===');
  const snaps = await c.query(`
    SELECT * FROM weekly_revenue_snapshots ORDER BY week_start DESC LIMIT 3
  `);
  console.log(JSON.stringify(snaps.rows, null, 2));

  // Check what the get_weekly_revenue function returns
  console.log('\n=== SEARCHING FOR get_weekly_revenue FUNCTION ===');
  const funcs = await c.query(`
    SELECT proname, prosrc FROM pg_proc 
    WHERE proname LIKE '%weekly%revenue%' OR proname LIKE '%revenue%week%'
    OR proname LIKE '%admin%revenue%'
  `);
  funcs.rows.forEach(f => {
    console.log(`\nFunction: ${f.proname}`);
    console.log(f.prosrc.substring(0, 500));
  });

  await c.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
