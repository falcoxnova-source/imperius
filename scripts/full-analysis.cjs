const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // ============================================
  // STEP 1: What's the current cutoff?
  // ============================================
  const { rows: [limits] } = await c.query("SELECT earnings_cutoff_date FROM market_resource_limits WHERE id = 1");
  console.log('Current cutoff:', limits.earnings_cutoff_date);

  // ============================================
  // STEP 2: Luciffer's exact spending timestamps
  // ============================================
  const { rows: [luciffer] } = await c.query("SELECT id, username FROM profiles WHERE username ILIKE '%lucif%'");
  
  const { rows: lucSpending } = await c.query(`
    SELECT revenue_type, amount, created_at
    FROM admin_revenue
    WHERE related_user_id = $1
    AND revenue_type IN ('plus_subscription','fleet_acceleration','officer_fxu','instant_ship','instant_build','instant_research','supply_box')
    ORDER BY created_at DESC
    LIMIT 20
  `, [luciffer.id]);

  console.log('\n=== Luciffer recent company spending (timestamps) ===');
  for (const r of lucSpending) {
    const ts = new Date(r.created_at);
    console.log(ts.toISOString(), r.revenue_type.padEnd(20), parseFloat(r.amount).toFixed(2));
  }

  // ============================================
  // STEP 3: Test with cutoff = start of today (March 29 00:00 UTC)
  // ============================================
  const cutoffStartOfDay = '2026-03-29T00:00:00Z';
  
  // Company types ONLY (no swap_fee, transfer_fee, expedition_fee)
  const companyTypes = ['plus_subscription','fleet_acceleration','officer_fxu','instant_ship','instant_build','instant_research','supply_box'];

  // Luciffer's numbers with cutoff = start of today
  const { rows: [lucSpentToday] } = await c.query(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM admin_revenue
    WHERE related_user_id = $1
    AND revenue_type = ANY($2)
    AND created_at >= $3
  `, [luciffer.id, companyTypes, cutoffStartOfDay]);

  const { rows: [lucEarnedToday] } = await c.query(`
    SELECT COALESCE(SUM(total_price), 0) as total
    FROM market_transactions
    WHERE seller_id = $1 AND created_at >= $2
  `, [luciffer.id, cutoffStartOfDay]);

  const lucSpent = parseFloat(lucSpentToday.total);
  const lucEarned = parseFloat(lucEarnedToday.total);
  const lucCredit = Math.max(0, lucSpent - lucEarned);
  
  console.log('\n=== Luciffer with cutoff = start of today ===');
  console.log('Company spent (today):', lucSpent.toFixed(2));
  console.log('Market earned (today):', lucEarned.toFixed(2));
  console.log('Credit:', lucCredit.toFixed(2));
  console.log('Points FXU:', (471608 * 0.001).toFixed(2));
  console.log('FXU Limit:', (471608 * 0.001 + lucCredit).toFixed(2));

  // ============================================
  // STEP 4: Top 20 players impact with this approach
  // ============================================
  console.log('\n=== Top 20 players with cutoff = start of today, company-only types ===');
  console.log('Username'.padEnd(30), 'Points'.padStart(8), 'Spent'.padStart(12), 'Earned'.padStart(12), 'Credit'.padStart(12), 'FXU Limit'.padStart(12));
  console.log('-'.repeat(88));

  const { rows: topPlayers } = await c.query(`
    SELECT p.id, p.username, p.points_total
    FROM profiles p
    WHERE p.points_total > 0
    ORDER BY p.points_total DESC
    LIMIT 20
  `);

  for (const u of topPlayers) {
    const { rows: [sp] } = await c.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM admin_revenue
      WHERE related_user_id = $1
      AND revenue_type = ANY($2)
      AND created_at >= $3
    `, [u.id, companyTypes, cutoffStartOfDay]);

    const { rows: [ea] } = await c.query(`
      SELECT COALESCE(SUM(total_price), 0) as total
      FROM market_transactions
      WHERE seller_id = $1 AND created_at >= $2
    `, [u.id, cutoffStartOfDay]);

    const spent = parseFloat(sp.total);
    const earned = parseFloat(ea.total);
    const credit = Math.max(0, spent - earned);
    const minPrice = 0.001;
    const fxuLimit = u.points_total * minPrice + credit;

    console.log(
      (u.username || 'unknown').padEnd(30),
      String(u.points_total).padStart(8),
      spent.toFixed(2).padStart(12),
      earned.toFixed(2).padStart(12),
      credit.toFixed(2).padStart(12),
      fxuLimit.toFixed(2).padStart(12)
    );
  }

  // ============================================
  // STEP 5: Verify the second screenshot user (7.42K points, 27.62 spent)
  // That user has ~7420 points. Let's find them.
  // ============================================
  console.log('\n=== Users with ~7000-8000 points who spent ~27 FXU ===');
  const { rows: midUsers } = await c.query(`
    SELECT p.id, p.username, p.points_total,
      (SELECT COALESCE(SUM(ar.amount), 0) FROM admin_revenue ar 
       WHERE ar.related_user_id = p.id 
       AND ar.revenue_type = ANY($1)
       AND ar.created_at >= $2) as spent
    FROM profiles p
    WHERE p.points_total BETWEEN 7000 AND 8000
    ORDER BY p.points_total DESC
  `, [companyTypes, cutoffStartOfDay]);
  
  for (const u of midUsers) {
    const spent = parseFloat(u.spent);
    if (spent > 0) {
      console.log(u.username, '| pts:', u.points_total, '| spent today:', spent.toFixed(2));
    }
  }

  // ============================================
  // STEP 6: Edge case - what about someone who earned a LOT today?
  // ============================================
  console.log('\n=== Top earners TODAY (to check credit reduction works) ===');
  const { rows: topEarners } = await c.query(`
    SELECT mt.seller_id, p.username, SUM(mt.total_price) as earned_today
    FROM market_transactions mt
    JOIN profiles p ON p.id = mt.seller_id
    WHERE mt.created_at >= $1
    GROUP BY mt.seller_id, p.username
    ORDER BY earned_today DESC
    LIMIT 10
  `, [cutoffStartOfDay]);

  for (const e of topEarners) {
    const { rows: [sp] } = await c.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM admin_revenue
      WHERE related_user_id = $1
      AND revenue_type = ANY($2)
      AND created_at >= $3
    `, [e.seller_id, companyTypes, cutoffStartOfDay]);
    
    const spent = parseFloat(sp.total);
    const earned = parseFloat(e.earned_today);
    const credit = Math.max(0, spent - earned);
    console.log(
      (e.username || 'unknown').padEnd(30),
      'spent:', spent.toFixed(2).padStart(10),
      'earned:', earned.toFixed(2).padStart(10),
      'credit:', credit.toFixed(2).padStart(10)
    );
  }

  await c.end();
  console.log('\n✅ Analysis complete.');
})();
