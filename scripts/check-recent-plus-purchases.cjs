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

  // 1. Recent Plus subscriptions (last 48 hours)
  console.log('\n=== COMPRAS PLUS ULTIMAS 48 HORAS ===');
  const subs = await c.query(`
    SELECT 
      ps.id,
      ps.user_id,
      p.username,
      ps.payment_type,
      ps.amount_paid,
      pp.name as plan_name,
      pp.price_usdt,
      pp.price_fxu,
      ps.created_at,
      ps.expires_at
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    JOIN plus_plans pp ON pp.id = ps.plan_id
    WHERE ps.created_at > now() - interval '48 hours'
    ORDER BY ps.created_at DESC
  `);
  if (subs.rows.length === 0) {
    console.log('  No hay compras Plus en las ultimas 48 horas');
  } else {
    for (const s of subs.rows) {
      console.log(`  ${s.username} | Pago: ${s.payment_type.toUpperCase()} | Monto: ${s.amount_paid} | Plan: ${s.plan_name} | Fecha: ${s.created_at}`);
    }
  }

  // 2. Admin revenue for plus_subscription (last 48h)
  console.log('\n=== ADMIN REVENUE "plus_subscription" ULTIMAS 48H ===');
  const rev = await c.query(`
    SELECT 
      ar.id,
      ar.revenue_type,
      ar.amount,
      ar.description,
      p.username as related_user,
      ar.created_at
    FROM admin_revenue ar
    LEFT JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.revenue_type IN ('plus_subscription', 'plus_subscription_usdt')
      AND ar.created_at > now() - interval '48 hours'
    ORDER BY ar.created_at DESC
  `);
  if (rev.rows.length === 0) {
    console.log('  No hay revenue de Plus en las ultimas 48 horas');
  } else {
    for (const r of rev.rows) {
      const isUsdt = r.description && r.description.includes('(USDT)');
      console.log(`  ${r.related_user || 'N/A'} | Tipo: ${r.revenue_type} | Monto: ${r.amount} ${isUsdt ? 'USDT' : 'FXU'} | Desc: ${r.description} | Fecha: ${r.created_at}`);
    }
  }

  // 3. Admin USDT balance
  console.log('\n=== BALANCE USDT DEL ADMIN ===');
  const admin = await c.query(`
    SELECT id, username, usdt_balance, fxu_balance 
    FROM profiles WHERE is_admin = true
  `);
  for (const a of admin.rows) {
    console.log(`  ${a.username}: ${a.usdt_balance} USDT | ${a.fxu_balance} FXU`);
  }

  // 4. All USDT movements for admin in last 7 days (looking at wallet_transactions or any usdt changes)
  console.log('\n=== TODAS LAS COMPRAS PLUS DE ESTA SEMANA (desde lunes) ===');
  const weekPlus = await c.query(`
    SELECT 
      ps.user_id,
      p.username,
      ps.payment_type,
      ps.amount_paid,
      pp.name as plan_name,
      ps.created_at
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    JOIN plus_plans pp ON pp.id = ps.plan_id
    WHERE ps.created_at >= DATE_TRUNC('week', CURRENT_DATE)
    ORDER BY ps.created_at DESC
  `);
  if (weekPlus.rows.length === 0) {
    console.log('  No hay compras Plus esta semana');
  } else {
    let totalFxu = 0, totalUsdt = 0;
    for (const s of weekPlus.rows) {
      const amt = parseFloat(s.amount_paid);
      if (s.payment_type === 'usdt') totalUsdt += amt;
      else totalFxu += amt;
      console.log(`  ${s.username} | ${s.payment_type.toUpperCase()} ${s.amount_paid} | ${s.plan_name} | ${s.created_at}`);
    }
    console.log(`\n  TOTAL SEMANA: ${totalFxu} FXU + ${totalUsdt} USDT en compras Plus`);
  }

  // 5. Check: Does admin receive the USDT when someone pays Plus in USDT?
  console.log('\n=== REVENUE PLUS CON (USDT) EN DESCRIPCION - TODA LA HISTORIA ===');
  const usdtPlus = await c.query(`
    SELECT 
      ar.amount,
      ar.description,
      p.username,
      ar.created_at
    FROM admin_revenue ar
    LEFT JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.description LIKE '%(USDT)%'
      AND ar.revenue_type = 'plus_subscription'
    ORDER BY ar.created_at DESC
    LIMIT 20
  `);
  if (usdtPlus.rows.length === 0) {
    console.log('  No hay compras Plus pagadas en USDT');
  } else {
    let total = 0;
    for (const r of usdtPlus.rows) {
      total += parseFloat(r.amount);
      console.log(`  ${r.username} | ${r.amount} USDT | ${r.description} | ${r.created_at}`);
    }
    console.log(`  TOTAL HISTORICO USDT POR PLUS: $${total.toFixed(2)}`);
  }

  // 6. Check if admin's usdt_balance was ever credited for Plus USDT purchases
  console.log('\n=== ANALISIS: ¿El admin recibe USDT de Plus? ===');
  console.log('  En purchase_plus_subscription (USDT path):');
  console.log('    - Se descuenta usdt_balance del COMPRADOR: SI');
  console.log('    - Se acredita usdt_balance del ADMIN: ???');
  console.log('  Revisando la funcion actual...');

  // Check the actual function source
  const fn = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'
  `);
  if (fn.rows.length > 0) {
    const src = fn.rows[0].prosrc;
    const hasAdminUsdtCredit = src.includes('admin') && src.includes('usdt_balance') && src.includes('+');
    const deductsUser = src.includes("usdt_balance = usdt_balance - v_price");
    console.log(`    Descuenta USDT del comprador: ${deductsUser ? 'SI' : 'NO'}`);
    console.log(`    Acredita USDT al admin: ${hasAdminUsdtCredit ? 'POSIBLEMENTE' : 'NO!'}`);
    
    // Search for admin_id usage with usdt
    if (src.includes('v_admin_id')) {
      console.log('    -> La funcion usa v_admin_id');
    }
    // Check if referrer gets USDT
    if (src.includes('v_referrer_id') && src.includes('usdt_balance')) {
      console.log('    -> La funcion paga comision de referido en USDT');
    }
  }

  // 7. Referral commissions paid in USDT recently
  console.log('\n=== COMISIONES DE REFERIDO EN USDT (ultimas 48h) ===');
  const refComm = await c.query(`
    SELECT 
      rc.referrer_id,
      p1.username as referrer,
      rc.seller_id,
      p2.username as buyer,
      rc.commission_type,
      rc.resource_type,
      rc.fxu_amount,
      rc.created_at
    FROM referral_commissions rc
    JOIN profiles p1 ON p1.id = rc.referrer_id
    JOIN profiles p2 ON p2.id = rc.seller_id
    WHERE rc.resource_type = 'usdt'
      AND rc.created_at > now() - interval '48 hours'
    ORDER BY rc.created_at DESC
  `);
  if (refComm.rows.length === 0) {
    console.log('  No hay comisiones de referido en USDT recientes');
  } else {
    for (const r of refComm.rows) {
      console.log(`  Referidor: ${r.referrer} | Comprador: ${r.buyer} | ${r.fxu_amount} USDT | ${r.commission_type} | ${r.created_at}`);
    }
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
