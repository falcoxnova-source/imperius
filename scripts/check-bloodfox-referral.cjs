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

  // 1. Find bloodfox user
  const u = await c.query(
    `SELECT id, username, email, fxu_balance, usdt_balance, referral_code FROM profiles WHERE email = 'bloodfox0014@gmail.com'`
  );
  if (!u.rows.length) { console.log('User not found'); await c.end(); return; }
  const bf = u.rows[0];
  console.log('=== BLOODFOX ===');
  console.log(`ID: ${bf.id} | Username: ${bf.username} | FXU: ${bf.fxu_balance} | USDT: ${bf.usdt_balance} | Code: ${bf.referral_code}`);

  // 2. Find referrals (users referred BY bloodfox)
  const refs = await c.query(
    `SELECT id, username, email FROM profiles WHERE referred_by = $1`, [bf.id]
  );
  console.log(`\n=== REFERIDOS DE BLOODFOX (${refs.rows.length}) ===`);
  for (const r of refs.rows) console.log(`  ${r.username} (${r.email})`);

  // 3. Check Plus subscriptions from those referrals
  if (refs.rows.length > 0) {
    const refIds = refs.rows.map(r => r.id);
    const subs = await c.query(`
      SELECT ps.user_id, ps.payment_type, ps.amount_paid, ps.created_at, ps.expires_at, ps.is_active,
             p.username, pp.name as plan_name
      FROM plus_subscriptions ps
      JOIN profiles p ON ps.user_id = p.id
      JOIN plus_plans pp ON ps.plan_id = pp.id
      WHERE ps.user_id = ANY($1)
      ORDER BY ps.created_at DESC
    `, [refIds]);
    console.log(`\n=== COMPRAS VIP DE REFERIDOS (${subs.rows.length}) ===`);
    for (const s of subs.rows) {
      const comision5 = (parseFloat(s.amount_paid) * 0.05).toFixed(2);
      console.log(`  ${s.username} | Plan: ${s.plan_name} | Pago: ${s.amount_paid} ${s.payment_type.toUpperCase()} | 5% = ${comision5} ${s.payment_type.toUpperCase()} | Fecha: ${new Date(s.created_at).toISOString().slice(0,19)} | Activo: ${s.is_active}`);
    }
  }

  // 4. Check ALL referral commissions received by bloodfox
  const comms = await c.query(`
    SELECT rc.*, p.username as from_user 
    FROM referral_commissions rc 
    LEFT JOIN profiles p ON rc.seller_id = p.id
    WHERE rc.referrer_id = $1 
    ORDER BY rc.created_at DESC LIMIT 20
  `, [bf.id]);
  console.log(`\n=== COMISIONES RECIBIDAS POR BLOODFOX (${comms.rows.length}) ===`);
  for (const cm of comms.rows) {
    console.log(`  Tipo: ${cm.commission_type} | Recurso: ${cm.resource_type} | Monto: ${cm.amount} | FXU: ${cm.fxu_amount} | De: ${cm.from_user} | Fecha: ${new Date(cm.created_at).toISOString().slice(0,19)}`);
  }

  // Filter plus_subscription commissions specifically
  const plusComms = comms.rows.filter(cm => cm.commission_type === 'plus_subscription');
  console.log(`\n=== COMISIONES PLUS ESPECÍFICAMENTE: ${plusComms.length} ===`);
  if (plusComms.length === 0) {
    console.log('  ⚠️  NO tiene comisiones de Plus. Posibles razones:');
    console.log('     - Sus referidos compraron Plus ANTES de que se implementara la comisión (hoy 2 abril 2026)');
    console.log('     - Sus referidos no han comprado Plus todavía');
  }

  // 5. Check when referrals bought their Plus (before or after today?)
  if (refs.rows.length > 0) {
    const refIds = refs.rows.map(r => r.id);
    const subsTimeline = await c.query(`
      SELECT ps.created_at, p.username, ps.payment_type, ps.amount_paid, pp.name
      FROM plus_subscriptions ps
      JOIN profiles p ON ps.user_id = p.id
      JOIN plus_plans pp ON ps.plan_id = pp.id
      WHERE ps.user_id = ANY($1)
      ORDER BY ps.created_at
    `, [refIds]);
    
    if (subsTimeline.rows.length > 0) {
      console.log('\n=== TIMELINE DE COMPRAS VIP ===');
      const deployDate = new Date('2026-04-02T12:00:00Z');
      for (const s of subsTimeline.rows) {
        const purchaseDate = new Date(s.created_at);
        const beforeOrAfter = purchaseDate < deployDate ? '⏮️ ANTES del deploy' : '✅ DESPUÉS del deploy';
        console.log(`  ${s.username} | ${s.name} | ${s.amount_paid} ${s.payment_type} | ${purchaseDate.toISOString().slice(0,19)} | ${beforeOrAfter}`);
      }
    }
  }

  // 6. Check messages
  const msgs = await c.query(
    `SELECT subject, body, created_at FROM messages WHERE recipient_id = $1 AND (subject ILIKE '%comision%' OR subject ILIKE '%referid%') ORDER BY created_at DESC LIMIT 10`,
    [bf.id]
  );
  console.log(`\n=== MENSAJES DE COMISIÓN (${msgs.rows.length}) ===`);
  for (const m of msgs.rows) console.log(`  ${m.subject} | ${m.body.slice(0, 80)} | ${new Date(m.created_at).toISOString().slice(0,19)}`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
