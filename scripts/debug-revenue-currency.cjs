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

  // Get FULL take_weekly_revenue_snapshot source
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'take_weekly_revenue_snapshot'");
  console.log('=== take_weekly_revenue_snapshot FULL ===');
  console.log(r1.rows[0].prosrc);

  // Check for other USDT-denominated revenue types
  const r2 = await c.query(`
    SELECT DISTINCT revenue_type, 
      CASE WHEN description LIKE '%(USDT)%' THEN 'USDT' ELSE 'FXU' END as currency,
      COUNT(*) as cnt,
      SUM(amount) as total
    FROM admin_revenue
    GROUP BY revenue_type, CASE WHEN description LIKE '%(USDT)%' THEN 'USDT' ELSE 'FXU' END
    ORDER BY revenue_type, currency
  `);
  console.log('\n=== Revenue types by currency ===');
  for (const row of r2.rows) {
    console.log(`  ${row.revenue_type.padEnd(22)} ${row.currency} | count: ${row.cnt} | total: ${row.total}`);
  }

  // Check retirement/withdrawal descriptions
  const r3 = await c.query(`
    SELECT description FROM admin_revenue 
    WHERE revenue_type = 'withdrawal_fee' LIMIT 3
  `);
  console.log('\n=== withdrawal_fee sample descriptions ===');
  for (const row of r3.rows) console.log(`  ${row.description}`);

  // Check swap_fee descriptions  
  const r4 = await c.query(`
    SELECT description FROM admin_revenue 
    WHERE revenue_type = 'swap_fee' LIMIT 3
  `);
  console.log('\n=== swap_fee sample descriptions ===');
  for (const row of r4.rows) console.log(`  ${row.description}`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
