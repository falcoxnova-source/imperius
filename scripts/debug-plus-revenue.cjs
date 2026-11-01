const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Check admin_revenue for Plus subscriptions
  const r1 = await c.query(`
    SELECT ar.amount, ar.description, ar.created_at
    FROM admin_revenue ar
    WHERE ar.revenue_type = 'plus_subscription'
    ORDER BY ar.created_at DESC
  `);
  console.log('=== admin_revenue Plus entries ===');
  for (const row of r1.rows) {
    console.log(`  ${row.created_at} | amount: ${row.amount} | ${row.description}`);
  }

  // 2. Check admin_revenue columns - does it have a usdt_amount column?
  const r2 = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'admin_revenue' ORDER BY ordinal_position
  `);
  console.log('\n=== admin_revenue columns ===');
  for (const row of r2.rows) {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  }

  // 3. Check the weekly revenue snapshot function
  const r3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'get_weekly_revenue_snapshots'");
  if (r3.rows.length > 0) {
    console.log('\n=== get_weekly_revenue_snapshots source ===');
    console.log(r3.rows[0].prosrc);
  }

  // 4. Check if there's a currentWeekSnapshot function
  const r4 = await c.query("SELECT proname, prosrc FROM pg_proc WHERE proname LIKE '%current_week%' OR proname LIKE '%week%snapshot%' ORDER BY proname");
  console.log('\n=== Weekly snapshot functions ===');
  for (const row of r4.rows) {
    console.log(`\n--- ${row.proname} ---`);
    console.log(row.prosrc.substring(0, 600));
    console.log('...');
  }

  // 5. Sum to see the discrepancy
  const r5 = await c.query(`
    SELECT 
      SUM(amount) as total_amount,
      SUM(CASE WHEN description LIKE '%(USDT)%' THEN amount ELSE 0 END) as usdt_amounts,
      SUM(CASE WHEN description LIKE '%(FXU)%' THEN amount ELSE 0 END) as fxu_amounts,
      SUM(CASE WHEN description LIKE '%(USDT)%' THEN amount ELSE 0 END) * 1.0 as usdt_as_usd,
      SUM(CASE WHEN description LIKE '%(FXU)%' THEN amount ELSE 0 END) * 0.0001 as fxu_as_usd
    FROM admin_revenue 
    WHERE revenue_type = 'plus_subscription'
      AND created_at >= date_trunc('week', now())
  `);
  console.log('\n=== Plus this week breakdown ===');
  console.log(JSON.stringify(r5.rows[0], null, 2));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
