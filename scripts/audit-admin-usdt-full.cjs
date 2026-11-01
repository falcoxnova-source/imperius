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

  // 1. Admin profile
  console.log('=== ADMIN PROFILE ===');
  const admin = await c.query(`
    SELECT id, username, usdt_balance, fxu_balance, created_at 
    FROM profiles WHERE is_admin = true
  `);
  const adminId = admin.rows[0].id;
  console.log(`  ID: ${adminId}`);
  console.log(`  USDT: ${admin.rows[0].usdt_balance}`);
  console.log(`  FXU: ${admin.rows[0].fxu_balance}`);

  // 2. ALL wallet transactions for admin (deposits, withdrawals)
  console.log('\n=== WALLET TRANSACTIONS DEL ADMIN (todas) ===');
  const wt = await c.query(`
    SELECT id, tx_type, amount, fxu_amount, status, wallet_address, created_at
    FROM wallet_transactions
    WHERE user_id = $1
    ORDER BY created_at DESC
  `, [adminId]);
  if (wt.rows.length === 0) {
    console.log('  No hay wallet transactions del admin');
  } else {
    for (const t of wt.rows) {
      console.log(`  ${t.tx_type} | $${t.amount} | fxu: ${t.fxu_amount} | status: ${t.status} | ${t.created_at}`);
    }
  }

  // 3. Admin withdrawals from admin_withdrawals table
  console.log('\n=== ADMIN WITHDRAWALS (tabla admin_withdrawals) ===');
  try {
    const aw = await c.query(`
      SELECT * FROM admin_withdrawals ORDER BY created_at DESC LIMIT 20
    `);
    if (aw.rows.length === 0) {
      console.log('  No hay retiros del admin');
    } else {
      for (const w of aw.rows) {
        console.log(`  ${JSON.stringify(w)}`);
      }
    }
  } catch(e) {
    console.log('  Tabla admin_withdrawals no existe:', e.message);
  }

  // 4. Check swap transactions for admin
  console.log('\n=== SWAPS DEL ADMIN (ultimos 30 dias) ===');
  try {
    const swaps = await c.query(`
      SELECT * FROM swap_transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC LIMIT 20
    `, [adminId]);
    if (swaps.rows.length === 0) {
      console.log('  No hay swaps del admin');
    } else {
      for (const s of swaps.rows) {
        console.log(`  ${JSON.stringify(s)}`);
      }
    }
  } catch(e) {
    console.log('  Tabla swap_transactions no existe:', e.message);
  }

  // 5. Check ALL USDT deposits to admin (someone transferring USDT to admin)
  console.log('\n=== DEPOSITOS USDT AL ADMIN ===');
  const deposits = await c.query(`
    SELECT id, tx_type, amount, fxu_amount, status, created_at
    FROM wallet_transactions
    WHERE user_id = $1 AND tx_type = 'deposit' AND status = 'confirmed'
    ORDER BY created_at DESC LIMIT 20
  `, [adminId]);
  if (deposits.rows.length === 0) {
    console.log('  No hay depositos confirmados');
  } else {
    for (const d of deposits.rows) {
      console.log(`  ${d.amount} | fxu: ${d.fxu_amount} | ${d.created_at}`);
    }
  }

  // 6. TODAS las entradas de admin_revenue con (USDT) - con conversion
  console.log('\n=== HISTORIAL COMPLETO: INGRESOS USDT DEL ADMIN (admin_revenue con USDT) ===');
  const usdtRev = await c.query(`
    SELECT ar.amount, ar.revenue_type, ar.description, p.username, ar.created_at
    FROM admin_revenue ar
    LEFT JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.description LIKE '%(USDT)%'
    ORDER BY ar.created_at DESC
  `);
  let totalUsdtRevenue = 0;
  for (const r of usdtRev.rows) {
    totalUsdtRevenue += parseFloat(r.amount);
    console.log(`  ${r.username || 'N/A'} | $${r.amount} USDT | ${r.revenue_type} | ${r.description} | ${r.created_at}`);
  }
  console.log(`  TOTAL: $${totalUsdtRevenue.toFixed(2)} USDT`);

  // 7. withdrawal_fee entries (these are in USDT)
  console.log('\n=== WITHDRAWAL FEES (revenue_type=withdrawal_fee) - ultimas 20 ===');
  const wfees = await c.query(`
    SELECT ar.amount, ar.description, p.username, ar.created_at
    FROM admin_revenue ar
    LEFT JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.revenue_type = 'withdrawal_fee'
    ORDER BY ar.created_at DESC LIMIT 20
  `);
  let totalWfee = 0;
  for (const r of wfees.rows) {
    totalWfee += parseFloat(r.amount);
    console.log(`  ${r.username || 'N/A'} | $${r.amount} | ${r.description} | ${r.created_at}`);
  }
  console.log(`  TOTAL WITHDRAWAL FEES (shown): $${totalWfee.toFixed(4)}`);

  // 8. Total withdrawal fees ALL TIME
  const totalWf = await c.query(`
    SELECT SUM(amount) as total FROM admin_revenue WHERE revenue_type = 'withdrawal_fee'
  `);
  console.log(`  TOTAL WITHDRAWAL FEES ALL TIME: $${parseFloat(totalWf.rows[0].total || 0).toFixed(4)}`);

  // 9. How were user withdrawals processed? Did admin pay out USDT?
  console.log('\n=== RETIROS DE USUARIOS (confirmed, ultimos 30 dias) ===');
  const userWithdrawals = await c.query(`
    SELECT wt.id, wt.amount, wt.fxu_amount, wt.status, wt.tx_type, 
           p.username, wt.created_at
    FROM wallet_transactions wt
    JOIN profiles p ON p.id = wt.user_id
    WHERE wt.tx_type = 'withdrawal' AND wt.status = 'confirmed'
    ORDER BY wt.created_at DESC LIMIT 20
  `);
  let totalUserWithdrawalsUsdt = 0;
  for (const w of userWithdrawals.rows) {
    totalUserWithdrawalsUsdt += parseFloat(w.amount);
    console.log(`  ${w.username} | $${w.amount} USDT | fxu: ${w.fxu_amount} | ${w.created_at}`);
  }
  console.log(`  TOTAL PAGADO EN RETIROS (shown): $${totalUserWithdrawalsUsdt.toFixed(4)}`);

  // 10. Referral commissions paid in USDT (all time)
  console.log('\n=== COMISIONES REFERIDO USDT (ALL TIME) ===');
  const allRefUsdt = await c.query(`
    SELECT SUM(fxu_amount) as total, COUNT(*) as count
    FROM referral_commissions
    WHERE resource_type = 'usdt'
  `);
  console.log(`  Total: $${parseFloat(allRefUsdt.rows[0].total || 0).toFixed(2)} USDT en ${allRefUsdt.rows[0].count} comisiones`);

  // 11. USDT balance reconstruction
  console.log('\n=== RECONSTRUCCION DEL BALANCE USDT DEL ADMIN ===');
  
  // All confirmed deposits (USDT added to admin from external)
  const totalDeposits = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions 
    WHERE user_id = $1 AND tx_type = 'deposit' AND status = 'confirmed'
  `, [adminId]);
  
  // All USDT admin received from Plus payments
  // NOTE: The function does NOT credit admin USDT for Plus! Let's check...
  
  // Admin's usdt_balance changes - check if there's an audit log
  console.log(`  Depositos externos confirmados: $${parseFloat(totalDeposits.rows[0].total)}`);
  
  // 12. Let's check ALL swap_fxu_to_usdt done BY admin
  console.log('\n=== SWAPS FXU->USDT DEL ADMIN (generaron USDT) ===');
  try {
    const adminSwaps = await c.query(`
      SELECT ar.amount, ar.description, ar.created_at
      FROM admin_revenue ar
      WHERE ar.revenue_type = 'swap_fee' 
        AND ar.related_user_id = $1
      ORDER BY ar.created_at DESC
    `, [adminId]);
    console.log(`  Swaps del admin registrados en revenue: ${adminSwaps.rows.length}`);
    for (const s of adminSwaps.rows) {
      console.log(`  ${s.amount} | ${s.description} | ${s.created_at}`);
    }
  } catch(e) {
    console.log('  Error:', e.message);
  }

  // 13. What is the weekly revenue showing as $183.45?
  console.log('\n=== REVENUE SEMANAL (semana actual, como lo calcula el dashboard) ===');
  const weekRev = await c.query(`
    SELECT 
      revenue_type,
      SUM(CASE 
        WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000
        WHEN description LIKE '%(USDT)%' THEN amount * 10000
        ELSE amount
      END) as total_fxu,
      SUM(amount) as raw_amount,
      COUNT(*) as count
    FROM admin_revenue
    WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
      AND created_at < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'
    GROUP BY revenue_type
    ORDER BY total_fxu DESC
  `);
  let grandTotalFxu = 0;
  let grandTotalRawUsdt = 0;
  for (const r of weekRev.rows) {
    grandTotalFxu += parseFloat(r.total_fxu);
    console.log(`  ${r.revenue_type}: ${parseFloat(r.total_fxu).toLocaleString()} FXU (raw: ${r.raw_amount}) [${r.count} txs]`);
  }
  console.log(`  TOTAL FXU: ${grandTotalFxu.toLocaleString()} → $${(grandTotalFxu * 0.0001).toFixed(2)} USD`);

  // 14. Where did admin get initial USDT?
  console.log('\n=== ORIGEN DEL USDT DEL ADMIN ===');
  // Check add-usdt-balance script or manual additions
  const usdtHistory = await c.query(`
    SELECT usdt_balance FROM profiles WHERE id = $1
  `, [adminId]);
  console.log(`  Balance actual: $${parseFloat(usdtHistory.rows[0].usdt_balance).toFixed(4)}`);

  // Check if process-withdrawal deducts from admin USDT
  console.log('\n=== VERIFICANDO: process_admin_withdrawal descuenta USDT del admin? ===');
  try {
    const fn2 = await c.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'process_admin_withdrawal'
    `);
    if (fn2.rows.length > 0) {
      const src = fn2.rows[0].prosrc;
      const hasUsdtDeduct = src.includes('usdt_balance') && src.includes('-');
      console.log(`  Descuenta usdt_balance: ${hasUsdtDeduct ? 'SI' : 'NO'}`);
      // Show relevant lines
      for (const line of src.split('\n')) {
        if (line.includes('usdt') || line.includes('balance')) {
          console.log(`    ${line.trim()}`);
        }
      }
    }
  } catch(e) {
    console.log('  Error:', e.message);
  }

  // 15. process-admin-withdrawal edge function?
  console.log('\n=== RETIROS ADMIN PROCESADOS (admin_withdrawals si existe) ===');
  try {
    const aw2 = await c.query(`
      SELECT amount, status, wallet_address, created_at, confirmed_at
      FROM admin_withdrawals 
      ORDER BY created_at DESC LIMIT 10
    `);
    for (const w of aw2.rows) {
      console.log(`  $${w.amount} | ${w.status} | ${w.wallet_address} | ${w.created_at}`);
    }
  } catch(e) {
    // Try alternative table names
    try {
      const tables = await c.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name LIKE '%admin%withdraw%'
      `);
      console.log('  Tablas encontradas:', tables.rows.map(r => r.table_name));
    } catch(e2) {
      console.log('  No hay tabla de retiros admin');
    }
  }

  // 16. Let's check the USDT outflows more carefully  
  console.log('\n=== RESUMEN FINANCIERO USDT ===');
  
  // Total USDT ever deposited to ALL users
  const totalUsdtDeposited = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM wallet_transactions 
    WHERE tx_type = 'deposit' AND status = 'confirmed'
  `);
  
  // Total USDT withdrawn by users  
  const totalUsdtWithdrawn = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM wallet_transactions 
    WHERE tx_type = 'withdrawal' AND status = 'confirmed'
  `);
  
  // Total USDT balance of all users
  const totalUsdtBalances = await c.query(`
    SELECT 
      SUM(CASE WHEN is_admin = true THEN usdt_balance ELSE 0 END) as admin_usdt,
      SUM(CASE WHEN is_admin = false OR is_admin IS NULL THEN usdt_balance ELSE 0 END) as users_usdt,
      SUM(usdt_balance) as total_usdt
    FROM profiles
  `);
  
  console.log(`  Total depositos USDT: $${parseFloat(totalUsdtDeposited.rows[0].total).toFixed(2)}`);
  console.log(`  Total retiros USDT: $${parseFloat(totalUsdtWithdrawn.rows[0].total).toFixed(2)}`);
  console.log(`  Admin USDT balance: $${parseFloat(totalUsdtBalances.rows[0].admin_usdt).toFixed(4)}`);
  console.log(`  Users USDT balance: $${parseFloat(totalUsdtBalances.rows[0].users_usdt).toFixed(4)}`);
  console.log(`  Total USDT en sistema: $${parseFloat(totalUsdtBalances.rows[0].total_usdt).toFixed(4)}`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
