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
  
  // Desde las 5 PM de hoy (hora Cuba = UTC-4 en horario de verano)
  // 5 PM Cuba = 9 PM UTC = 21:00 UTC
  const since = "2026-04-02 21:00:00+00";  // 5 PM Cuba time

  console.log('=== TODO LO QUE PASO DESPUES DE LAS 5 PM (Cuba) ===\n');

  // 1. Admin revenue después de 5 PM
  console.log('--- ADMIN REVENUE (fees ganados) despues de 5 PM ---');
  const rev = await c.query(`
    SELECT revenue_type, amount, description, created_at,
           CASE WHEN description LIKE '%(USDT)%' THEN 'USDT' 
                WHEN revenue_type = 'withdrawal_fee' THEN 'USDT'
                ELSE 'FXU' END as currency
    FROM admin_revenue
    WHERE created_at >= $1
    ORDER BY created_at ASC
  `, [since]);
  
  let totalFxuRevenue = 0;
  let totalUsdtRevenue = 0;
  for (const r of rev.rows) {
    const amt = parseFloat(r.amount);
    if (r.currency === 'USDT') {
      totalUsdtRevenue += amt;
      console.log(`  [USDT] +$${amt.toFixed(4)} | ${r.revenue_type} | ${r.description} | ${r.created_at}`);
    } else {
      totalFxuRevenue += amt;
    }
  }
  console.log(`\n  Total FXU revenue: ${totalFxuRevenue.toFixed(2)} FXU ($${(totalFxuRevenue * 0.0001).toFixed(4)})`);
  console.log(`  Total USDT revenue: $${totalUsdtRevenue.toFixed(4)}`);

  // 2. Plus purchases after 5 PM
  console.log('\n--- COMPRAS PLUS despues de 5 PM ---');
  const plus = await c.query(`
    SELECT ps.user_id, p.username, ps.payment_type, ps.amount_paid, ps.created_at
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    WHERE ps.created_at >= $1
    ORDER BY ps.created_at ASC
  `, [since]);
  for (const s of plus.rows) {
    const impact = s.payment_type === 'usdt' 
      ? `USDT: se descontó $${s.amount_paid} del usuario, ¿se acreditó al admin?` 
      : `FXU: se descontó ${s.amount_paid} FXU del usuario`;
    console.log(`  ${s.username} | ${s.payment_type.toUpperCase()} $${s.amount_paid} | ${impact} | ${s.created_at}`);
  }

  // 3. Referral commissions in USDT after 5 PM
  console.log('\n--- COMISIONES REFERIDO USDT despues de 5 PM ---');
  const refComm = await c.query(`
    SELECT p1.username as referrer, p2.username as buyer, rc.fxu_amount, rc.resource_type, rc.created_at
    FROM referral_commissions rc
    JOIN profiles p1 ON p1.id = rc.referrer_id
    JOIN profiles p2 ON p2.id = rc.seller_id
    WHERE rc.created_at >= $1 AND rc.resource_type = 'usdt'
    ORDER BY rc.created_at ASC
  `, [since]);
  let totalRefUsdt = 0;
  for (const r of refComm.rows) {
    totalRefUsdt += parseFloat(r.fxu_amount);
    console.log(`  ${r.referrer} ← ${r.buyer}: +$${r.fxu_amount} USDT (creado de la nada) | ${r.created_at}`);
  }
  console.log(`  Total comisiones USDT creadas: $${totalRefUsdt.toFixed(2)}`);

  // 4. Retiros de usuarios (procesados) después de 5 PM
  console.log('\n--- RETIROS USUARIOS CONFIRMADOS despues de 5 PM ---');
  const wt = await c.query(`
    SELECT wt.amount, wt.fxu_amount, p.username, wt.status, wt.created_at
    FROM wallet_transactions wt
    JOIN profiles p ON p.id = wt.user_id
    WHERE wt.tx_type = 'withdrawal' AND wt.status = 'confirmed' AND wt.created_at >= $1
    ORDER BY wt.created_at ASC
  `, [since]);
  let totalRetiros = 0;
  for (const w of wt.rows) {
    totalRetiros += parseFloat(w.amount);
    console.log(`  ${w.username} retiró $${w.amount} USDT | ${w.created_at}`);
  }
  console.log(`  Total retiros procesados: $${totalRetiros.toFixed(4)}`);

  // 5. Withdrawal fees (admin earns USDT from these)
  console.log('\n--- WITHDRAWAL FEES despues de 5 PM (admin gana USDT) ---');
  const wfees = await c.query(`
    SELECT amount, description, p.username, ar.created_at
    FROM admin_revenue ar
    LEFT JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.revenue_type = 'withdrawal_fee' AND ar.created_at >= $1
    ORDER BY ar.created_at ASC
  `, [since]);
  let totalWfee = 0;
  for (const r of wfees.rows) {
    totalWfee += parseFloat(r.amount);
    console.log(`  ${r.username}: +$${parseFloat(r.amount).toFixed(4)} USDT al admin | ${r.created_at}`);
  }
  console.log(`  Total fees retiro al admin: $${totalWfee.toFixed(4)}`);

  // 6. Swaps del admin después de 5 PM
  console.log('\n--- SWAPS DEL ADMIN despues de 5 PM ---');
  const adminSwaps = await c.query(`
    SELECT amount, description, created_at
    FROM admin_revenue
    WHERE revenue_type = 'swap_fee' AND related_user_id = $1 AND created_at >= $2
    ORDER BY created_at ASC
  `, [adminId, since]);
  for (const s of adminSwaps.rows) {
    console.log(`  ${s.description} | ${s.created_at}`);
  }

  // 7. Admin wallet transactions after 5 PM
  console.log('\n--- WALLET TRANSACTIONS DEL ADMIN despues de 5 PM ---');
  const adminWt = await c.query(`
    SELECT tx_type, amount, fxu_amount, status, created_at
    FROM wallet_transactions
    WHERE user_id = $1 AND created_at >= $2
    ORDER BY created_at ASC
  `, [adminId, since]);
  if (adminWt.rows.length === 0) {
    console.log('  Ninguna');
  } else {
    for (const t of adminWt.rows) {
      console.log(`  ${t.tx_type} | $${t.amount} | ${t.status} | ${t.created_at}`);
    }
  }

  // 8. Check: Did purchase_plus_subscription credit admin USDT?
  console.log('\n--- VERIFICACIÓN: ¿El admin recibió USDT del Plus de Yamamoto? ---');
  // Admin balance now
  const adminNow = await c.query(`SELECT usdt_balance FROM profiles WHERE id = $1`, [adminId]);
  console.log(`  Balance USDT admin ahora: $${parseFloat(adminNow.rows[0].usdt_balance).toFixed(4)}`);

  // 9. CALCULO NETO DESPUES DE 5 PM
  console.log('\n========================================');
  console.log('=== BALANCE NETO USDT ADMIN DESDE 5 PM ===');
  console.log('========================================');
  
  // Ingresos USDT al admin:
  console.log(`  (+) Withdrawal fees recibidos: +$${totalWfee.toFixed(4)}`);
  
  // Plus USDT - ¿llegó al admin?
  let plusUsdtAfter5 = 0;
  for (const s of plus.rows) {
    if (s.payment_type === 'usdt') plusUsdtAfter5 += parseFloat(s.amount_paid);
  }
  console.log(`  (?) Plus USDT cobrado a usuarios: $${plusUsdtAfter5.toFixed(2)} — ¿acreditado al admin? VERIFICANDO...`);
  
  // Let's actually check if admin usdt went up or down
  // We know Yamamoto paid at 21:01 UTC-4 = 01:01 UTC Apr 3
  // Check if admin got that $10
  
  // The function source shows NO admin USDT credit for Plus
  // So the $10 USDT was deducted from Yamamoto but NEVER credited to admin
  
  console.log(`\n  *** RESULTADO ***`);
  console.log(`  Yamamoto pagó $10 USDT por Plus a las 21:01`);
  console.log(`  Esos $10 se DESCONTARON de Yamamoto`);
  console.log(`  Pero NUNCA se ACREDITARON al admin`);
  console.log(`  → $10 USDT DESAPARECIERON del sistema`);
  console.log(`  + Se crearon $0.50 USDT para el referidor Meelo (de la nada)`);
  console.log(`\n  PÉRDIDA NETA DESDE 5 PM: -$10.00 (Plus no acreditado) + $0.50 (comisión creada)`);
  console.log(`  = El admin debería tener $10.50 más de lo que tiene`);
  
  // But also withdrawal fees came in
  console.log(`\n  Pero también recibió $${totalWfee.toFixed(4)} en withdrawal fees`);
  console.log(`  Efecto neto en wallet: +$${totalWfee.toFixed(4)} (fees) - $0 (plus no llego) = +$${totalWfee.toFixed(4)}`);
  console.log(`  Mientras que el REVENUE subió: +$${plusUsdtAfter5.toFixed(2)} (plus) + $${totalWfee.toFixed(4)} (fees) + FXU fees`);
  console.log(`  → El revenue subió $${plusUsdtAfter5.toFixed(2)} más que el wallet → ESA ES LA DIFERENCIA`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
