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

  // 1. Verify the function source in production RIGHT NOW
  const funcRes = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'");
  const src = funcRes.rows[0]?.prosrc || '';
  
  console.log('=== FUNCTION SOURCE CHECK ===');
  console.log('Has referred_by:', src.includes('referred_by'));
  console.log('Has get_referral_commission_percent:', src.includes('get_referral_commission_percent'));
  console.log('Has plus_subscription:', src.includes("'plus_subscription'"));
  
  if (!src.includes('referred_by')) {
    console.log('\n❌ FUNCTION DOES NOT HAVE REFERRAL LOGIC - deployment may have failed!');
    console.log('\nFull function source:\n', src.substring(0, 500));
  } else {
    console.log('\n✅ Function has referral logic');
  }

  // 2. Check CriptoBear's purchase details
  const criptoRes = await c.query(`
    SELECT p.id, p.username, p.email, p.referred_by, p.fxu_balance, p.usdt_balance,
           ref.username as referrer_username, ref.email as referrer_email
    FROM profiles p
    LEFT JOIN profiles ref ON p.referred_by = ref.id
    WHERE p.email = 'provxs56@gmail.com'
  `);
  
  if (criptoRes.rows.length) {
    const cb = criptoRes.rows[0];
    console.log('\n=== CRIPTOBEAR ===');
    console.log(`ID: ${cb.id}`);
    console.log(`Username: ${cb.username}`);
    console.log(`referred_by: ${cb.referred_by}`);
    console.log(`Referrer: ${cb.referrer_username} (${cb.referrer_email})`);
  }

  // 3. Check the exact subscription record
  const subRes = await c.query(`
    SELECT ps.*, pp.name, pp.price_usdt, pp.price_fxu
    FROM plus_subscriptions ps
    JOIN plus_plans pp ON ps.plan_id = pp.id
    WHERE ps.user_id = (SELECT id FROM profiles WHERE email = 'provxs56@gmail.com')
    ORDER BY ps.created_at DESC LIMIT 3
  `);
  console.log('\n=== SUBSCRIPTIONS ===');
  for (const s of subRes.rows) {
    console.log(`  ID: ${s.id} | Plan: ${s.name} | Payment: ${s.payment_type} | Amount: ${s.amount_paid} | Created: ${s.created_at}`);
  }

  // 4. Check if maybe the commission was recorded but under a different referrer
  const allPlusComms = await c.query(`
    SELECT rc.*, r.username as referrer_name, s.username as seller_name
    FROM referral_commissions rc
    LEFT JOIN profiles r ON rc.referrer_id = r.id
    LEFT JOIN profiles s ON rc.seller_id = s.id
    WHERE rc.commission_type = 'plus_subscription'
  `);
  console.log(`\n=== ALL plus_subscription COMMISSIONS IN SYSTEM: ${allPlusComms.rows.length} ===`);
  for (const cm of allPlusComms.rows) {
    console.log(`  Referrer: ${cm.referrer_name} | From: ${cm.seller_name} | Amount: ${cm.fxu_amount} | Type: ${cm.resource_type} | Date: ${cm.created_at}`);
  }

  // 5. Check if there's a transaction log for errors
  const adminRevRes = await c.query(`
    SELECT * FROM admin_revenue 
    WHERE description ILIKE '%CriptoBear%' OR description ILIKE '%provxs56%' OR description ILIKE '%Plus%VIP%Mensual%'
    ORDER BY created_at DESC LIMIT 5
  `);
  console.log(`\n=== ADMIN REVENUE FOR THIS PURCHASE ===`);
  for (const r of adminRevRes.rows) {
    console.log(`  Type: ${r.revenue_type} | Amount: ${r.amount} | Desc: ${r.description} | Date: ${r.created_at}`);
  }

  // Check broader - any plus_subscription revenue today
  const todayRev = await c.query(`
    SELECT * FROM admin_revenue 
    WHERE revenue_type = 'plus_subscription' AND created_at > '2026-04-02'
    ORDER BY created_at DESC
  `);
  console.log(`\n=== TODAY'S PLUS SUBSCRIPTION REVENUE (${todayRev.rows.length}) ===`);
  for (const r of todayRev.rows) {
    console.log(`  Amount: ${r.amount} | Desc: ${r.description} | User: ${r.related_user_id} | Date: ${r.created_at}`);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
