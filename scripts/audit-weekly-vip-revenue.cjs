const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

c.connect().then(async () => {
  // 1. Check plus_subscriptions for weekly plan purchases
  console.log('=== WEEKLY VIP SUBSCRIPTIONS ===');
  const subs = await c.query(`
    SELECT ps.id, ps.user_id, ps.payment_type, ps.amount_paid, ps.created_at, ps.expires_at, ps.is_active,
           p.username, pp.code, pp.name as plan_name
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    JOIN plus_plans pp ON pp.id = ps.plan_id
    WHERE pp.code = 'plus_weekly'
    ORDER BY ps.created_at DESC
    LIMIT 20
  `);
  console.log(`Found ${subs.rows.length} weekly VIP subscriptions:`);
  subs.rows.forEach(r => {
    console.log(`  User: ${r.username} | Paid: ${r.amount_paid} ${r.payment_type} | Active: ${r.is_active} | Created: ${r.created_at} | Expires: ${r.expires_at}`);
  });

  // 2. Check admin_revenue for plus_subscription entries
  console.log('\n=== ADMIN REVENUE FROM VIP (ALL PLANS) ===');
  const rev = await c.query(`
    SELECT ar.revenue_type, ar.amount, ar.currency, ar.description, ar.created_at,
           p.username
    FROM admin_revenue ar
    LEFT JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.revenue_type = 'plus_subscription'
    ORDER BY ar.created_at DESC
    LIMIT 30
  `);
  console.log(`Found ${rev.rows.length} plus_subscription revenue entries:`);
  rev.rows.forEach(r => {
    console.log(`  ${r.amount} ${r.currency} | ${r.description} | User: ${r.username} | ${r.created_at}`);
  });

  // 3. Cross-check: weekly subs that DON'T have a matching admin_revenue entry
  console.log('\n=== CROSS-CHECK: Weekly subs missing admin_revenue ===');
  const missing = await c.query(`
    SELECT ps.id, ps.user_id, ps.amount_paid, ps.payment_type, ps.created_at,
           p.username, pp.name as plan_name
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    JOIN plus_plans pp ON pp.id = ps.plan_id
    WHERE pp.code = 'plus_weekly'
    AND NOT EXISTS (
      SELECT 1 FROM admin_revenue ar
      WHERE ar.related_user_id = ps.user_id
        AND ar.revenue_type = 'plus_subscription'
        AND ar.description LIKE '%Semanal%'
        AND ar.created_at BETWEEN ps.created_at - interval '1 minute' AND ps.created_at + interval '1 minute'
    )
  `);
  console.log(`Missing entries: ${missing.rows.length}`);
  missing.rows.forEach(r => {
    console.log(`  MISSING: User ${r.username} paid ${r.amount_paid} ${r.payment_type} on ${r.created_at}`);
  });

  // 4. Check total revenue breakdown by type
  console.log('\n=== REVENUE BREAKDOWN BY TYPE ===');
  const breakdown = await c.query(`
    SELECT revenue_type, currency,
           COUNT(*) as count,
           SUM(amount) as total_amount
    FROM admin_revenue
    GROUP BY revenue_type, currency
    ORDER BY revenue_type, currency
  `);
  breakdown.rows.forEach(r => {
    console.log(`  ${r.revenue_type} (${r.currency}): ${r.count} entries, total: ${r.total_amount}`);
  });

  // 5. Verify the admin wallet (admin user balance)
  console.log('\n=== ADMIN USER BALANCES ===');
  const admins = await c.query(`
    SELECT username, fxu_balance, usdt_balance
    FROM profiles
    WHERE is_admin = true
  `);
  admins.rows.forEach(r => {
    console.log(`  ${r.username}: FXU=${r.fxu_balance}, USDT=${r.usdt_balance}`);
  });

  c.end();
}).catch(e => { console.error(e.message); c.end(); });
