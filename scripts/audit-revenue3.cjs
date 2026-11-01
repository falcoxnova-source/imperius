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

  const RATE = 10000; // 1 USDT = 10,000 FXU

  // 1. Revenue by type this week
  console.log('=== ADMIN REVENUE THIS WEEK (by type) ===');
  const rev = await c.query(`
    SELECT revenue_type, SUM(amount) as total_fxu, SUM(amount) / ${RATE} as total_usd, COUNT(*) as count
    FROM admin_revenue
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY revenue_type
    ORDER BY total_fxu DESC
  `);
  console.table(rev.rows);

  const totalRev = await c.query(`
    SELECT SUM(amount) as total_fxu, SUM(amount) / ${RATE} as total_usd
    FROM admin_revenue
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
  `);
  console.log('TOTAL REVENUE (recorded):', totalRev.rows[0]);

  // 2. Now let's see ALL FXU that was spent by users (debited from user_wallets) this week
  console.log('\n=== USER WALLET DEBITS (internal_transfers) ===');
  const transfers = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'internal_transfers' ORDER BY ordinal_position
  `);
  console.table(transfers.rows);

  // 3. Check user_wallets structure
  console.log('\n=== USER_WALLETS COLUMNS ===');
  const uwCols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'user_wallets' ORDER BY ordinal_position
  `);
  console.table(uwCols.rows);

  // 4. Total balance across ALL user wallets
  console.log('\n=== TOTAL USER WALLET BALANCES ===');
  const totalBal = await c.query(`
    SELECT SUM(balance_fxu) as total_fxu, SUM(balance_usdt) as total_usdt,
           COUNT(*) as wallets_count
    FROM user_wallets
  `);
  console.table(totalBal.rows);

  // 5. Total deposits vs withdrawals (wallet_transactions)
  console.log('\n=== DEPOSITS vs WITHDRAWALS (confirmed, this week) ===');
  const depWithd = await c.query(`
    SELECT tx_type, token_type, COUNT(*) as count, 
           SUM(amount) as total_amount, SUM(fxu_amount) as total_fxu
    FROM wallet_transactions
    WHERE status = 'confirmed' AND created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY tx_type, token_type
    ORDER BY tx_type, token_type
  `);
  console.table(depWithd.rows);

  // 6. Check if withdrawal fee is registered as revenue
  console.log('\n=== WITHDRAWAL FEES - are they tracked in admin_revenue? ===');
  const withdrawRevenue = await c.query(`
    SELECT COUNT(*) as count, SUM(amount) as total
    FROM admin_revenue
    WHERE revenue_type IN ('withdrawal', 'withdrawal_fee', 'retiro', 'retiros', 'Retiros')
    AND created_at >= '2026-03-30'
  `);
  console.table(withdrawRevenue.rows);

  // 7. Check deposit amounts - are they registered?
  console.log('\n=== DEPOSIT REVENUE - is it tracked? ===');
  const depositRevenue = await c.query(`
    SELECT COUNT(*) as count, SUM(amount) as total
    FROM admin_revenue
    WHERE revenue_type IN ('deposit', 'deposits', 'Depositar', 'deposito')
    AND created_at >= '2026-03-30'
  `);
  console.table(depositRevenue.rows);

  // 8. Let's check what swap_fee looks like vs swap transactions
  console.log('\n=== SWAP ANALYSIS ===');
  const swapRevCount = await c.query(`
    SELECT COUNT(*) as revenue_count, SUM(amount) as revenue_total_fxu
    FROM admin_revenue
    WHERE revenue_type = 'swap_fee' AND created_at >= '2026-03-30'
  `);
  console.log('Swap fees in admin_revenue:', swapRevCount.rows[0]);

  // 9. Look for FXU game spending functions
  console.log('\n=== ALL REVENUE TYPES (this week) with detailed amounts ===');
  const allRev = await c.query(`
    SELECT revenue_type, 
           COUNT(*) as tx_count, 
           SUM(amount)::numeric(20,2) as total_fxu,
           (SUM(amount) / ${RATE})::numeric(20,4) as total_usd
    FROM admin_revenue
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY revenue_type
    ORDER BY total_fxu DESC
  `);
  console.table(allRev.rows);

  // 10. Check expenses too
  console.log('\n=== ADMIN EXPENSES THIS WEEK ===');
  const expenses = await c.query(`
    SELECT expense_type, COUNT(*) as count, SUM(amount)::numeric(20,2) as total_fxu,
           (SUM(amount) / ${RATE})::numeric(20,4) as total_usd
    FROM admin_expenses
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY expense_type
    ORDER BY total_fxu DESC
  `);
  console.table(expenses.rows);

  // 11. What is admin wallet USDT balance? Check if it's tracked separately
  console.log('\n=== ADMIN WALLET USDT INFO ===');
  const adminWallet = await c.query(`
    SELECT * FROM admin_withdrawals ORDER BY created_at DESC LIMIT 3
  `);
  console.log('Recent admin_withdrawals:');
  console.log(JSON.stringify(adminWallet.rows, null, 2));

  await c.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
