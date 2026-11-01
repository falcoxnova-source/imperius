const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const adminId = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6';

  // Check schema_migrations with all columns
  console.log('=== MIGRACIONES DE HOY ===');
  try {
    const cols = await c.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
    `);
    console.log('Columnas:', cols.rows.map(r => r.column_name).join(', '));
    
    const mig = await c.query(`
      SELECT * FROM supabase_migrations.schema_migrations 
      WHERE version LIKE '202604%'
      ORDER BY version
    `);
    for (const m of mig.rows) {
      console.log(`  ${JSON.stringify(m)}`);
    }
  } catch(e) {
    console.log('  Error:', e.message);
  }

  // The REAL test: check if the PREVIOUS function version (20260323)
  // had admin USDT credit. Both file versions DON'T have it.
  // So the question is: was there a version IN BETWEEN that did?
  
  // Let's find all functions that ever modified purchase_plus_subscription
  console.log('\n=== BUSCAR SI ALGUNA VEZ SE ACREDITO USDT AL ADMIN EN PLUS ===');
  
  // The cleanest way: the user says only $10 is missing.
  // If the function NEVER credited admin USDT, ALL $60 would be missing.
  // Since only $10 is missing, maybe the previous function DID credit.
  // BUT looking at the file 20260323180000_fix_purchase_plus_fxu_context.sql,
  // it also doesn't credit admin USDT.
  
  // UNLESS: the user is tracking FXU revenue, not USDT specifically
  // Or: there was a manual fix / script that credited the first 5 purchases
  
  // Let me check: what is the EXACT admin USDT balance and what SHOULD it be
  console.log('\n=== RECONSTRUCCION EXACTA DEL ADMIN USDT ===');
  
  // All USDT inflows to admin
  // Source 1: withdrawal_fee from request_withdrawal_usdt
  const wfTotal = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM admin_revenue WHERE revenue_type = 'withdrawal_fee'
  `);
  console.log(`  Withdrawal fees (all time): $${parseFloat(wfTotal.rows[0].total).toFixed(4)}`);
  
  // Source 2: direct deposits
  const depTotal = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM wallet_transactions 
    WHERE user_id = $1 AND tx_type = 'deposit' AND status = 'confirmed'
  `, [adminId]);
  console.log(`  Depositos directos: $${parseFloat(depTotal.rows[0].total).toFixed(4)}`);
  
  // Outflows: admin's own withdrawals
  const adminWd = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM wallet_transactions 
    WHERE user_id = $1 AND tx_type = 'withdrawal' AND status = 'confirmed'
  `, [adminId]);
  console.log(`  Retiros propios: -$${parseFloat(adminWd.rows[0].total).toFixed(4)}`);
  
  // Outflows: admin swaps USDT->FXU (these spend USDT)
  // In swap_usdt_to_fxu: user's usdt_balance -= p_usdt_amount
  // We need to find admin's swaps of USDT to FXU
  // These show up in admin_revenue with description "X USDT -> Y FXU"
  const adminSwapsOut = await c.query(`
    SELECT description, created_at FROM admin_revenue 
    WHERE revenue_type = 'swap_fee' 
      AND related_user_id = $1
      AND description LIKE '%USDT -> %FXU%'
    ORDER BY created_at ASC
  `, [adminId]);
  
  let totalSwapUsdtOut = 0;
  for (const s of adminSwapsOut.rows) {
    // Parse "Swap fee: X USDT -> Y FXU (fee: Z FXU)"
    const match = s.description.match(/Swap fee: ([\d.]+) USDT/);
    if (match) {
      totalSwapUsdtOut += parseFloat(match[1]);
    }
  }
  console.log(`  Swaps USDT->FXU: -$${totalSwapUsdtOut.toFixed(4)} (${adminSwapsOut.rows.length} swaps)`);
  
  // Inflows: admin swaps FXU->USDT (these ADD USDT)  
  // In swap_fxu_to_usdt: user's usdt_balance += usdt_after_fee
  // Description: "Swap fee: X FXU -> Y USDT (fee: Z USDT = W FXU)"
  const adminSwapsIn = await c.query(`
    SELECT description, created_at FROM admin_revenue 
    WHERE revenue_type = 'swap_fee' 
      AND related_user_id = $1
      AND description LIKE '%FXU -> %USDT%'
    ORDER BY created_at ASC
  `, [adminId]);
  
  // Wait - these are SWAP FEES from OTHER users, not admin's own swaps
  // related_user_id = adminId means the ADMIN did the swap
  // But actually, swap_fee revenue is recorded with related_user_id = the user who swapped
  // So related_user_id = adminId means admin DID a swap
  
  // Actually let me check: when admin swaps FXU->USDT, admin GETS usdt_after_fee
  // Let's find how much USDT the admin received from their own swaps
  let totalSwapUsdtIn = 0;
  for (const s of adminSwapsIn.rows) {
    // Parse "Swap fee: X FXU -> Y USDT"
    const match = s.description.match(/-> ([\d.]+) USDT/);
    if (match) {
      totalSwapUsdtIn += parseFloat(match[1]);
    }
  }
  console.log(`  Swaps FXU->USDT (admin recibió): +$${totalSwapUsdtIn.toFixed(4)} (${adminSwapsIn.rows.length} swaps)`);
  
  // Plus USDT - not credited to admin (confirmed)
  console.log(`  Plus USDT (NO acreditado): +$0.0000`);
  
  // Referral commissions in USDT paid OUT from... nowhere (created for referrers)
  // These don't affect admin balance
  
  // Calculate expected balance
  const expected = parseFloat(wfTotal.rows[0].total) 
    + parseFloat(depTotal.rows[0].total) 
    - parseFloat(adminWd.rows[0].total) 
    - totalSwapUsdtOut 
    + totalSwapUsdtIn;
    
  const actual = await c.query(`SELECT usdt_balance FROM profiles WHERE id = $1`, [adminId]);
  const actualBal = parseFloat(actual.rows[0].usdt_balance);
  
  console.log(`\n  ESPERADO: $${expected.toFixed(4)}`);
  console.log(`  ACTUAL:   $${actualBal.toFixed(4)}`);
  console.log(`  DIFERENCIA: $${(actualBal - expected).toFixed(4)}`);
  
  // If the difference is ~$50 (5 previous Plus payments), then NONE were credited
  // If the difference is ~$0, then the balance is correct and Plus was never credited
  // If the difference is ~$-10, then something else is going on

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
