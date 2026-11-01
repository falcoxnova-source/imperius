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

  // 1. Admin wallet balance
  console.log('=== ADMIN WALLET (wallet_config) ===');
  const wc = await c.query(`SELECT * FROM wallet_config LIMIT 5`);
  console.table(wc.rows);

  // 2. Admin revenue this week (week 14)
  console.log('\n=== ADMIN REVENUE (this week: 2026-03-30 to 2026-04-05) ===');
  const rev = await c.query(`
    SELECT revenue_type, SUM(amount_fxu) as total_fxu, SUM(amount_usd) as total_usd, COUNT(*) as count
    FROM admin_revenue
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY revenue_type
    ORDER BY total_fxu DESC
  `);
  console.table(rev.rows);

  // 3. Total revenue this week
  const totalRev = await c.query(`
    SELECT SUM(amount_fxu) as total_fxu, SUM(amount_usd) as total_usd
    FROM admin_revenue
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
  `);
  console.log('\nTotal revenue this week:', totalRev.rows[0]);

  // 4. Wallet transactions this week (actual money flow)
  console.log('\n=== WALLET TRANSACTIONS SUMMARY (this week) ===');
  const wt = await c.query(`
    SELECT transaction_type, SUM(amount) as total_amount, SUM(fee) as total_fee, 
           SUM(admin_fee) as total_admin_fee, COUNT(*) as count
    FROM wallet_transactions
    WHERE created_at >= '2026-03-30' AND created_at < '2026-04-06'
    GROUP BY transaction_type
    ORDER BY total_amount DESC
  `);
  console.table(wt.rows);

  // 5. Check weekly_revenue_snapshots
  console.log('\n=== WEEKLY REVENUE SNAPSHOTS ===');
  const snaps = await c.query(`
    SELECT * FROM weekly_revenue_snapshots
    ORDER BY week_start DESC LIMIT 5
  `);
  console.table(snaps.rows);

  // 6. Check admin_revenue columns
  console.log('\n=== ADMIN REVENUE TABLE STRUCTURE ===');
  const cols = await c.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'admin_revenue'
    ORDER BY ordinal_position
  `);
  console.table(cols.rows);

  // 7. Check wallet_transactions columns
  console.log('\n=== WALLET TRANSACTIONS TABLE STRUCTURE ===');
  const wtCols = await c.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'wallet_transactions'
    ORDER BY ordinal_position
  `);
  console.table(wtCols.rows);

  // 8. All revenue types ever recorded
  console.log('\n=== ALL REVENUE TYPES EVER ===');
  const allTypes = await c.query(`
    SELECT revenue_type, COUNT(*) as count, SUM(amount_fxu) as total_fxu
    FROM admin_revenue
    GROUP BY revenue_type
    ORDER BY total_fxu DESC
  `);
  console.table(allTypes.rows);

  // 9. All wallet transaction types
  console.log('\n=== ALL WALLET TRANSACTION TYPES ===');
  const allWtTypes = await c.query(`
    SELECT transaction_type, COUNT(*) as count, SUM(amount) as total_amount, 
           SUM(fee) as total_fees, SUM(admin_fee) as total_admin_fees
    FROM wallet_transactions
    GROUP BY transaction_type
    ORDER BY total_amount DESC
  `);
  console.table(allWtTypes.rows);

  await c.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
