const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();

  // Luciffer's ID
  const { rows: [user] } = await c.query(
    "SELECT id, username, points_total FROM profiles WHERE username ILIKE '%lucif%'"
  );
  console.log('User:', user.username, '| Points:', user.points_total);

  // Breakdown of spending by revenue_type
  const { rows: breakdown } = await c.query(`
    SELECT revenue_type, SUM(amount) as total, COUNT(*) as count,
           MIN(created_at) as first, MAX(created_at) as last
    FROM admin_revenue
    WHERE related_user_id = $1
    AND revenue_type IN (
      'instant_build','instant_research','instant_ship',
      'officer_fxu','supply_box','fleet_acceleration',
      'expedition_fee','swap_fee','transfer_fee','plus_subscription'
    )
    GROUP BY revenue_type
    ORDER BY total DESC
  `, [user.id]);

  console.log('\n=== Spending breakdown (ALL TIME) ===');
  let totalAll = 0;
  let plusTotal = 0;
  for (const r of breakdown) {
    console.log(r.revenue_type.padEnd(25), parseFloat(r.total).toFixed(2).padStart(12), 'FXU', '(count:', r.count + ', first:', r.first?.toISOString().slice(0,10) + ')');
    totalAll += parseFloat(r.total);
    if (r.revenue_type === 'plus_subscription') plusTotal = parseFloat(r.total);
  }
  console.log('TOTAL'.padEnd(25), totalAll.toFixed(2).padStart(12), 'FXU');
  console.log('Plus subscription only:'.padEnd(25), plusTotal.toFixed(2).padStart(12), 'FXU');

  // Check cutoff
  const { rows: [limits] } = await c.query("SELECT earnings_cutoff_date FROM market_resource_limits WHERE id = 1");
  console.log('\nCutoff date:', limits.earnings_cutoff_date);

  // Spending AFTER cutoff (current)
  const { rows: [spentAfter] } = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM admin_revenue
    WHERE related_user_id = $1
    AND revenue_type IN ('instant_build','instant_research','instant_ship','officer_fxu','supply_box','fleet_acceleration','expedition_fee','swap_fee','transfer_fee','plus_subscription')
    AND created_at >= $2
  `, [user.id, limits.earnings_cutoff_date]);
  console.log('Spent after cutoff:', parseFloat(spentAfter.total).toFixed(2));

  // Proposed: Plus always counts + rest only after cutoff
  const { rows: [plusAll] } = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM admin_revenue
    WHERE related_user_id = $1 AND revenue_type = 'plus_subscription'
  `, [user.id]);
  const { rows: [restAfter] } = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM admin_revenue
    WHERE related_user_id = $1
    AND revenue_type IN ('instant_build','instant_research','instant_ship','officer_fxu','supply_box','fleet_acceleration','expedition_fee','swap_fee','transfer_fee')
    AND created_at >= $2
  `, [user.id, limits.earnings_cutoff_date]);

  const proposedSpent = parseFloat(plusAll.total) + parseFloat(restAfter.total);
  console.log('\n=== PROPOSED FIX ===');
  console.log('Plus (all time):', parseFloat(plusAll.total).toFixed(2));
  console.log('Other spending (after cutoff):', parseFloat(restAfter.total).toFixed(2));
  console.log('Total proposed spent:', proposedSpent.toFixed(2));

  const earned = 0; // after cutoff
  const credit = Math.max(0, proposedSpent - earned);
  const pointsFxu = user.points_total * 0.001;
  console.log('Credit:', credit.toFixed(2));
  console.log('FXU limit:', (pointsFxu + credit).toFixed(2));

  // Also check all users who have plus_subscription
  const { rows: plusUsers } = await c.query(`
    SELECT p.username, p.points_total, ar.total_plus
    FROM profiles p
    JOIN (
      SELECT related_user_id, SUM(amount) as total_plus
      FROM admin_revenue
      WHERE revenue_type = 'plus_subscription'
      GROUP BY related_user_id
    ) ar ON ar.related_user_id = p.id
    ORDER BY ar.total_plus DESC
    LIMIT 10
  `);
  console.log('\n=== All Plus subscribers ===');
  for (const u of plusUsers) {
    console.log(u.username?.padEnd(30), parseFloat(u.total_plus).toFixed(2).padStart(12), 'FXU');
  }

  await c.end();
})();
