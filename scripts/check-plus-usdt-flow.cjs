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

  // Check actual deployed function for admin USDT credit
  const fn = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'
  `);
  
  if (fn.rows.length > 0) {
    const src = fn.rows[0].prosrc;
    
    // Check if admin gets USDT
    const lines = src.split('\n');
    console.log('=== LINEAS RELEVANTES DE purchase_plus_subscription ===\n');
    
    let inUsdtBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('usdt') || line.includes('USDT') || line.includes('admin') || line.includes('referr')) {
        console.log(`L${i+1}: ${line.trim()}`);
      }
    }
    
    console.log('\n=== BLOQUE COMPLETO PAGO USDT ===');
    let capture = false;
    for (const line of lines) {
      if (line.includes("payment_type = 'usdt'") || line.includes("p_payment_type = 'usdt'")) {
        capture = true;
      }
      if (capture) {
        console.log('  ' + line);
        if (line.trim().startsWith('END IF') || line.includes("'Tipo de pago invalido'") || line.includes("invalido")) {
          capture = false;
        }
      }
    }
  }

  // Check current Plus plan prices
  console.log('\n=== PRECIOS ACTUALES PLUS ===');
  const plans = await c.query("SELECT code, name, price_usdt, price_fxu, duration_months FROM plus_plans ORDER BY duration_months");
  for (const p of plans.rows) {
    console.log(`  ${p.name} (${p.code}): $${p.price_usdt} USDT / ${p.price_fxu} FXU → ${p.duration_months} mes(es)`);
  }

  // Check total referral commissions paid in USDT this week
  console.log('\n=== COMISIONES REFERIDO USDT ESTA SEMANA ===');
  const comms = await c.query(`
    SELECT 
      p1.username as referrer, 
      p2.username as buyer,
      rc.fxu_amount as usdt_amount,
      rc.created_at
    FROM referral_commissions rc
    JOIN profiles p1 ON p1.id = rc.referrer_id
    JOIN profiles p2 ON p2.id = rc.seller_id
    WHERE rc.resource_type = 'usdt'
      AND rc.created_at >= DATE_TRUNC('week', CURRENT_DATE)
    ORDER BY rc.created_at DESC
  `);
  let totalComm = 0;
  for (const r of comms.rows) {
    totalComm += parseFloat(r.usdt_amount);
    console.log(`  ${r.referrer} ← ${r.buyer}: ${r.usdt_amount} USDT | ${r.created_at}`);
  }
  console.log(`  TOTAL COMISIONES USDT: $${totalComm.toFixed(2)}`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
