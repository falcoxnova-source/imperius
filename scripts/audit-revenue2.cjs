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

  // 1. admin_revenue structure
  console.log('=== ADMIN REVENUE COLUMNS ===');
  const cols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'admin_revenue' ORDER BY ordinal_position
  `);
  console.table(cols.rows);

  // 2. wallet_transactions structure
  console.log('\n=== WALLET TRANSACTIONS COLUMNS ===');
  const wtCols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'wallet_transactions' ORDER BY ordinal_position
  `);
  console.table(wtCols.rows);

  // 3. Sample admin_revenue
  console.log('\n=== RECENT ADMIN REVENUE (sample 5) ===');
  const sample = await c.query(`SELECT * FROM admin_revenue ORDER BY created_at DESC LIMIT 5`);
  console.log(JSON.stringify(sample.rows, null, 2));

  // 4. Sample wallet_transactions
  console.log('\n=== RECENT WALLET TRANSACTIONS (sample 5) ===');
  const wt = await c.query(`SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT 5`);
  console.log(JSON.stringify(wt.rows, null, 2));

  // 5. admin_expenses structure
  console.log('\n=== ADMIN EXPENSES COLUMNS ===');
  const expCols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'admin_expenses' ORDER BY ordinal_position
  `);
  console.table(expCols.rows);

  await c.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
