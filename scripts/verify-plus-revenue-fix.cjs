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

  // Get current week Plus breakdown manually
  const r1 = await c.query(`
    SELECT 
      SUM(CASE WHEN description LIKE '%(USDT)%' THEN amount * 10000 ELSE amount END) as plus_fxu_equiv,
      SUM(CASE WHEN description LIKE '%(USDT)%' THEN amount ELSE 0 END) as usdt_raw,
      SUM(CASE WHEN description LIKE '%(FXU)%' THEN amount ELSE 0 END) as fxu_raw,
      COUNT(*) as count
    FROM admin_revenue 
    WHERE revenue_type = 'plus_subscription'
      AND created_at >= date_trunc('week', CURRENT_DATE)
  `);
  
  const plus = r1.rows[0];
  console.log('=== Plus this week (after fix) ===');
  console.log(`  FXU purchases: ${plus.fxu_raw} FXU`);
  console.log(`  USDT purchases: ${plus.usdt_raw} USDT (= ${parseFloat(plus.usdt_raw || 0) * 10000} FXU equiv)`);
  console.log(`  Total FXU equiv: ${plus.plus_fxu_equiv}`);
  console.log(`  Total USD value: $${(parseFloat(plus.plus_fxu_equiv) * 0.0001).toFixed(2)}`);

  // Simulate what the snapshot function now returns
  const r2 = await c.query(`
    SELECT revenue_type,
      SUM(
        CASE
          WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000
          WHEN description LIKE '%(USDT)%' THEN amount * 10000
          ELSE amount
        END
      ) AS type_total
    FROM admin_revenue
    WHERE created_at >= date_trunc('week', CURRENT_DATE)
    GROUP BY revenue_type
    ORDER BY type_total DESC
  `);
  
  console.log('\n=== Full week breakdown (fixed) ===');
  let grandTotal = 0;
  for (const row of r2.rows) {
    const amt = parseFloat(row.type_total);
    grandTotal += amt;
    console.log(`  ${row.revenue_type.padEnd(22)} ${amt.toLocaleString(undefined, {maximumFractionDigits: 0}).padStart(10)} FXU  $${(amt * 0.0001).toFixed(2)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${grandTotal.toLocaleString(undefined, {maximumFractionDigits: 0}).padStart(10)} FXU  $${(grandTotal * 0.0001).toFixed(2)}`);

  // Compare before/after for Plus
  console.log('\n=== BEFORE vs AFTER (Plus only) ===');
  console.log(`  BEFORE: 200,050 FXU ($20.01) ← USDT counted as FXU`);
  console.log(`  AFTER:  ${parseFloat(plus.plus_fxu_equiv).toLocaleString()} FXU ($${(parseFloat(plus.plus_fxu_equiv) * 0.0001).toFixed(2)}) ← USDT converted ×10000`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
