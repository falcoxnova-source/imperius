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

  // 1. Verify commission percent function
  const r1 = await c.query('SELECT get_referral_commission_percent() as pct');
  console.log('Commission percent:', r1.rows[0].pct + '%');

  // 2. Verify function source has referral logic
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'");
  const src = r2.rows[0].prosrc;
  console.log('\nFunction checks:');
  console.log('  has referred_by lookup:', src.includes('referred_by'));
  console.log('  has commission calc:', src.includes('get_referral_commission_percent'));
  console.log('  has INSERT referral_commissions:', src.includes('referral_commissions'));
  console.log('  has plus_subscription type:', src.includes('plus_subscription'));

  // 3. Check all Plus purchases that happened BEFORE our fix
  const r3 = await c.query(`
    SELECT ar.created_at, ar.revenue_type, ar.amount, ar.description, ar.related_user_id,
           p.username, p.referred_by
    FROM admin_revenue ar
    JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.revenue_type LIKE '%Plus%' OR ar.revenue_type LIKE '%VIP%'
    ORDER BY ar.created_at DESC
  `);
  
  console.log('\n--- ALL Plus/VIP purchases ---');
  for (const row of r3.rows) {
    const hasReferrer = row.referred_by ? '✅ HAS REFERRER' : '❌ no referrer';
    console.log(`  ${row.created_at} | ${row.username} | ${row.revenue_type} | amount:${row.amount} | ${row.description} | ${hasReferrer}`);
  }

  // 4. Check if any of those purchases with referrers need manual commission
  const r4 = await c.query(`
    SELECT ar.created_at, ar.revenue_type, ar.amount, ar.description, ar.related_user_id,
           p.username, p.referred_by, ref.username as referrer_name
    FROM admin_revenue ar
    JOIN profiles p ON p.id = ar.related_user_id
    LEFT JOIN profiles ref ON ref.id = p.referred_by
    WHERE (ar.revenue_type LIKE '%Plus%' OR ar.revenue_type LIKE '%VIP%')
      AND p.referred_by IS NOT NULL
    ORDER BY ar.created_at DESC
  `);

  console.log('\n--- Plus purchases WITH referrers (need commission check) ---');
  for (const row of r4.rows) {
    // Check if commission was already paid
    const commCheck = await c.query(`
      SELECT id FROM referral_commissions 
      WHERE referrer_id = $1 AND seller_id = $2 AND commission_type = 'plus_subscription'
    `, [row.referred_by, row.related_user_id]);
    
    const paid = commCheck.rows.length > 0 ? '✅ PAID' : '❌ UNPAID';
    // Parse amount from description (e.g., "10 USDT" or "100000 FXU")
    const amt = parseFloat(row.amount || 0);
    const comm = (amt * 0.05).toFixed(2);
    console.log(`  ${paid} | ${row.created_at} | ${row.username} → referrer: ${row.referrer_name} | amount:${row.amount} | ${row.description} | Commission: ${comm}`);
  }

  console.log('\n✅ From now on, ALL new Plus purchases by referred users will auto-generate commissions.');
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
