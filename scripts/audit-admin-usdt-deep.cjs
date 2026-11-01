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

  // 1. Check how request_withdrawal_usdt works - does it deduct from admin?
  console.log('=== FUNCION request_withdrawal_usdt ===');
  const fn1 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'request_withdrawal_usdt'
  `);
  if (fn1.rows.length > 0) {
    const src = fn1.rows[0].prosrc;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('usdt_balance') || line.includes('admin') || line.includes('wallet_transactions')) {
        console.log(`  L${i+1}: ${line}`);
      }
    }
  } else {
    console.log('  Funcion no encontrada');
  }

  // 2. Check process_withdrawal edge function
  console.log('\n=== FUNCION approve_withdrawal / confirm_withdrawal ===');
  for (const fname of ['approve_withdrawal_manual', 'confirm_contract_withdrawal', 'process_admin_withdrawal']) {
    const fn = await c.query(`
      SELECT prosrc FROM pg_proc WHERE proname = $1
    `, [fname]);
    if (fn.rows.length > 0) {
      console.log(`\n--- ${fname} ---`);
      const src = fn.rows[0].prosrc;
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('usdt') || line.includes('admin') || line.includes('status') || line.includes('confirmed')) {
          console.log(`  L${i+1}: ${line}`);
        }
      }
    }
  }

  // 3. Weekly revenue breakdown: Plus entries specifically
  console.log('\n=== PLUS REVENUE ESTA SEMANA (detallado) ===');
  const plusRev = await c.query(`
    SELECT amount, description, created_at
    FROM admin_revenue 
    WHERE revenue_type = 'plus_subscription'
      AND created_at >= DATE_TRUNC('week', CURRENT_DATE)
    ORDER BY created_at DESC
  `);
  let totalPlusRaw = 0;
  for (const r of plusRev.rows) {
    const isUsdt = r.description && r.description.includes('(USDT)');
    totalPlusRaw += parseFloat(r.amount);
    const displayAmt = isUsdt 
      ? `${r.amount} USDT → convertido a ${parseFloat(r.amount) * 10000} FXU equiv` 
      : `${r.amount} FXU`;
    console.log(`  ${displayAmt} | ${r.description} | ${r.created_at}`);
  }
  console.log(`  RAW TOTAL: ${totalPlusRaw}`);

  // 4. Admin wallet_transactions (retiros pagados por admin)
  console.log('\n=== ADMIN WALLET_TRANSACTIONS ===');
  const adminWt = await c.query(`
    SELECT id, tx_type, amount, fxu_amount, status, created_at
    FROM wallet_transactions 
    WHERE user_id = $1
    ORDER BY created_at DESC
  `, [adminId]);
  for (const t of adminWt.rows) {
    console.log(`  ${t.tx_type} | $${t.amount} | fxu: ${t.fxu_amount} | ${t.status} | ${t.created_at}`);
  }

  // 5. Admin_withdrawals table
  console.log('\n=== ADMIN_WITHDRAWALS TABLA ===');
  try {
    const aw = await c.query(`SELECT * FROM admin_withdrawals ORDER BY created_at DESC LIMIT 10`);
    if (aw.rows.length === 0) {
      console.log('  Tabla vacia');
    } else {
      for (const w of aw.rows) {
        console.log(`  $${w.amount} | ${w.status} | ${w.created_at}`);
      }
    }
  } catch(e) {
    console.log('  Error:', e.message);
  }

  // 6. CRITICAL: Reconstrucción del balance USDT del admin
  console.log('\n=== RECONSTRUCCION BALANCE USDT ADMIN ===');
  
  // Depositos directos del admin
  const adminDeposits = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions 
    WHERE user_id = $1 AND tx_type = 'deposit' AND status = 'confirmed'
  `, [adminId]);
  console.log(`  (+) Depositos directos: $${parseFloat(adminDeposits.rows[0].total).toFixed(4)}`);

  // Retiros del admin wallet
  const adminWithdrawals = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions 
    WHERE user_id = $1 AND tx_type = 'withdrawal' AND status = 'confirmed'
  `, [adminId]);
  console.log(`  (-) Retiros propios: $${parseFloat(adminWithdrawals.rows[0].total).toFixed(4)}`);

  // USDT received from swaps (when users swap FXU->USDT, user gets USDT but where from?)
  // Let's check: in swap_fxu_to_usdt, user gets usdt_balance + usdt_after_fee
  // Does this come from admin? Or is it created?
  console.log('\n  Checking swap_fxu_to_usdt flow...');
  const swapFn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'swap_fxu_to_usdt'`);
  if (swapFn.rows.length > 0) {
    const src = swapFn.rows[0].prosrc;
    // Look for WHERE it adds USDT to user
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('usdt_balance') || line.includes('fxu_balance')) {
        console.log(`  L${i+1}: ${line}`);
      }
    }
  }

  // 7. The BIG picture: total USDT inflows vs outflows
  console.log('\n=== FLUJO USDT TOTAL DEL SISTEMA ===');
  
  // Users buy USDT by depositing (external USDT -> user usdt_balance)
  const totalDeposits = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions 
    WHERE tx_type = 'deposit' AND status = 'confirmed'
  `);
  
  // Users withdraw USDT (user usdt_balance -> external) 
  const totalWithdrawals = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions
    WHERE tx_type = 'withdrawal' AND status = 'confirmed'
  `);
  
  // Users buy Plus with USDT (user usdt_balance -> disappears/admin?)
  const totalPlusUsdt = await c.query(`
    SELECT COALESCE(SUM(amount_paid), 0) as total FROM plus_subscriptions WHERE payment_type = 'usdt'
  `);
  
  // Referral commissions in USDT (created from nothing?)
  const totalRefUsdt = await c.query(`
    SELECT COALESCE(SUM(fxu_amount), 0) as total FROM referral_commissions WHERE resource_type = 'usdt'
  `);
  
  console.log(`  Depositos totales: +$${parseFloat(totalDeposits.rows[0].total).toFixed(2)}`);
  console.log(`  Retiros totales: -$${parseFloat(totalWithdrawals.rows[0].total).toFixed(2)}`);
  console.log(`  Plus pagado en USDT: $${parseFloat(totalPlusUsdt.rows[0].total).toFixed(2)} (descontado de usuarios)`);
  console.log(`  Comisiones referido USDT: $${parseFloat(totalRefUsdt.rows[0].total).toFixed(2)} (generado a referidores)`);
  console.log(`  Neto esperado: $${(parseFloat(totalDeposits.rows[0].total) - parseFloat(totalWithdrawals.rows[0].total)).toFixed(2)}`);
  
  // Total USDT in system
  const totalInSystem = await c.query(`SELECT SUM(usdt_balance) as total FROM profiles`);
  console.log(`  Total USDT en balances: $${parseFloat(totalInSystem.rows[0].total).toFixed(4)}`);
  
  const diff = parseFloat(totalDeposits.rows[0].total) - parseFloat(totalWithdrawals.rows[0].total) - parseFloat(totalInSystem.rows[0].total);
  console.log(`  Discrepancia (depositos - retiros - balances): $${diff.toFixed(4)}`);

  // 8. Admin revenue as withdrawal_fee (this is USDT that admin earns)  
  console.log('\n=== WITHDRAWAL FEES ESTA SEMANA (revenue USDT real del admin) ===');
  const wfWeek = await c.query(`
    SELECT SUM(amount) as total, COUNT(*) as count
    FROM admin_revenue
    WHERE revenue_type = 'withdrawal_fee'
      AND created_at >= DATE_TRUNC('week', CURRENT_DATE)
  `);
  console.log(`  Total withdrawal fees: $${parseFloat(wfWeek.rows[0].total || 0).toFixed(4)} en ${wfWeek.rows[0].count} txs`);

  // 9. KEY QUESTION: Where does the $183 come from?
  // It's admin_revenue converted to FXU * 0.0001
  // But the wallet shows 171.0459 USDT
  // The wallet is the REAL usdt_balance of admin
  // The difference: $183.95 - $171.05 = ~$12.90
  
  console.log('\n=== ANALISIS FINAL ===');
  console.log(`  Revenue semanal (FXU equiv): 1,839,451 FXU = $183.95 USD`);
  console.log(`  Wallet USDT real: $171.0459`);
  console.log(`  Diferencia: $${(183.95 - 171.0459).toFixed(2)}`);
  
  // The $183.95 is NOT the USDT wallet. It's the FXU-equivalent revenue
  // The wallet $171 is a completely separate thing
  // But user thinks they should match - why?
  // Let's find what happened recently that might have reduced USDT by ~$12

  // Recent USDT decreases on admin
  console.log('\n=== POSIBLES REDUCCIONES USDT DEL ADMIN (ultimos 7 dias) ===');
  
  // Check if admin did any swaps USDT->FXU (spending USDT)
  const adminSwapsUsdt = await c.query(`
    SELECT amount, description, created_at
    FROM admin_revenue
    WHERE revenue_type = 'swap_fee'
      AND related_user_id = $1
      AND description LIKE '%USDT -> %FXU%'
    ORDER BY created_at DESC LIMIT 10
  `, [adminId]);
  console.log('  Admin swaps USDT->FXU (gasto de USDT):');
  for (const s of adminSwapsUsdt.rows) {
    console.log(`    ${s.description} | ${s.created_at}`);
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
