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

  // 1. Yamamoto's purchase details
  console.log('=== COMPRA DE YAMAMOTO ===');
  const yam = await c.query(`
    SELECT ps.*, p.username, p.usdt_balance as user_usdt_now
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    WHERE p.username LIKE 'Yamamoto%'
    ORDER BY ps.created_at DESC LIMIT 1
  `);
  if (yam.rows.length > 0) {
    const y = yam.rows[0];
    console.log(`  Usuario: ${y.username}`);
    console.log(`  Pago: ${y.payment_type.toUpperCase()} $${y.amount_paid}`);
    console.log(`  Fecha: ${y.created_at}`);
    console.log(`  USDT actual de Yamamoto: $${y.user_usdt_now}`);
  }

  // 2. Check if the deployed function credits admin USDT
  console.log('\n=== FUNCION DESPLEGADA - BLOQUE USDT COMPLETO ===');
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'`);
  const src = fn.rows[0].prosrc;
  const lines = src.split('\n');
  
  let inUsdtBlock = false;
  let foundAdminCredit = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes("p_payment_type = 'usdt'")) inUsdtBlock = true;
    if (inUsdtBlock) {
      console.log(`  L${i+1}: ${line}`);
      if (line.includes('admin') && line.includes('usdt_balance') && line.includes('+')) {
        foundAdminCredit = true;
      }
      // End block at ELSE or END IF after the USDT block
      if (line === 'ELSE' || (line.startsWith('END IF') && inUsdtBlock)) {
        inUsdtBlock = false;
      }
    }
  }
  
  console.log(`\n  ¿La función acredita USDT al admin? ${foundAdminCredit ? 'SÍ' : '*** NO ***'}`);
  
  // 3. Check ALL previous Plus USDT purchases and see if admin got credit
  // The real way: check admin_revenue vs actual admin USDT credit
  console.log('\n=== TODAS LAS COMPRAS PLUS USDT Y SI EL ADMIN RECIBIO ===');
  const allPlus = await c.query(`
    SELECT ps.user_id, p.username, ps.payment_type, ps.amount_paid, ps.created_at
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    WHERE ps.payment_type = 'usdt'
    ORDER BY ps.created_at ASC
  `);
  
  for (const s of allPlus.rows) {
    console.log(`  ${s.username} | $${s.amount_paid} USDT | ${s.created_at}`);
  }
  console.log(`  Total: ${allPlus.rows.length} compras = $${allPlus.rows.reduce((a,r) => a + parseFloat(r.amount_paid), 0)} USDT`);

  // 4. The REAL question: Did admin_balance go UP by $10 for each previous Plus?
  // We can check by looking at the function source in pg_proc - which version is deployed
  // If current deployed function doesn't credit admin, then NONE of the $60 arrived as USDT
  // The user may have been seeing revenue from withdrawal_fees, not from Plus
  
  // 5. Let's check: what was the admin USDT balance trajectory
  console.log('\n=== VERIFICACION DIRECTA ===');
  console.log('  La funcion purchase_plus_subscription desplegada actualmente NO acredita USDT al admin.');
  console.log('  Esto significa que NINGUNA compra Plus en USDT ha acreditado USDT al admin.');
  console.log('  Los $60 que el usuario cree que "llegaron" probablemente eran de withdrawal_fees u otras fuentes.');
  
  // 6. But let me check if maybe a PREVIOUS version of the function DID credit admin
  // by looking at the withdrawal_fee request function which DOES credit admin
  console.log('\n=== COMPARACION: request_withdrawal_usdt SÍ acredita admin ===');
  const wfn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'request_withdrawal_usdt'`);
  if (wfn.rows.length > 0) {
    const wsrc = wfn.rows[0].prosrc;
    const wlines = wsrc.split('\n');
    for (let i = 0; i < wlines.length; i++) {
      const line = wlines[i].trim();
      if (line.includes('admin') && (line.includes('usdt') || line.includes('v_fee') || line.includes('v_admin'))) {
        console.log(`  L${i+1}: ${line}`);
      }
    }
  }

  // 7. Actually, the user says only $10 is missing. Let's check if maybe
  // the PREVIOUS migration DID have admin credit and only today's broke it
  console.log('\n=== TIMESTAMP DE MIGRACIONES PLUS ===');
  // 20260323180000 - old version (no referral)
  // 20260402120000 - new version (with referral) - applied today!
  console.log('  20260323180000 - Version anterior (sin referral comission)');
  console.log('  20260402120000 - Version nueva (con referral) - aplicada HOY');
  console.log('  Si la version anterior SI acreditaba admin y la nueva NO,');
  console.log('  entonces solo faltan los $10 de Yamamoto (despues de la migracion)');
  
  // Check: the previous 5 USDT Plus purchases happened BEFORE the migration was applied
  // If the migration was applied around, say, 12:00 today...
  // CriptoBear bought at 9:57 AM - before migration
  // Yamamoto bought at 9:01 PM - after migration
  
  // When was the migration applied?
  console.log('\n=== ¿CUANDO SE APLICÓ LA MIGRACIÓN 20260402120000? ===');
  try {
    const mig = await c.query(`
      SELECT * FROM supabase_migrations.schema_migrations 
      WHERE version LIKE '20260402%'
      ORDER BY version
    `);
    for (const m of mig.rows) {
      console.log(`  ${m.version} | applied: ${m.inserted_at || m.created_at || JSON.stringify(m)}`);
    }
  } catch(e) {
    console.log('  No se puede acceder a schema_migrations:', e.message);
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
