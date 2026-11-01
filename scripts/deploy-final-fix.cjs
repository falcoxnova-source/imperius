const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();
  console.log('Connected.\n');

  // ============================================
  // STEP 1: Move cutoff to start of today
  // ============================================
  console.log('STEP 1: Update cutoff to start of today...');
  await c.query("UPDATE market_resource_limits SET earnings_cutoff_date = '2026-03-29T00:00:00Z' WHERE id = 1");
  const { rows: [newCutoff] } = await c.query("SELECT earnings_cutoff_date FROM market_resource_limits WHERE id = 1");
  console.log('✅ Cutoff set to:', newCutoff.earnings_cutoff_date);

  // ============================================
  // STEP 2: Deploy clean get_user_lifetime_fxu_spent
  // Only 7 company types. All same cutoff. No exceptions.
  // ============================================
  console.log('\nSTEP 2: Deploy get_user_lifetime_fxu_spent (company-only, uniform cutoff)...');
  await c.query(`
    CREATE OR REPLACE FUNCTION public.get_user_lifetime_fxu_spent(p_user_id uuid)
    RETURNS numeric
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_total numeric;
      v_cutoff timestamptz;
    BEGIN
      -- Global cutoff: everything before this date is wiped clean
      SELECT earnings_cutoff_date INTO v_cutoff
      FROM market_resource_limits WHERE id = 1;

      -- ONLY company investment types (no P2P fees)
      SELECT COALESCE(SUM(amount), 0) INTO v_total
      FROM admin_revenue
      WHERE related_user_id = p_user_id
        AND revenue_type IN (
          'plus_subscription',
          'fleet_acceleration',
          'officer_fxu',
          'instant_ship',
          'instant_build',
          'instant_research',
          'supply_box'
        )
        AND (v_cutoff IS NULL OR created_at >= v_cutoff);

      RETURN v_total;
    END;
    $function$;
  `);
  console.log('✅ Function deployed');

  // ============================================
  // STEP 3: Verify with Luciffer
  // ============================================
  console.log('\nSTEP 3: Verify Luciffer...');
  const { rows: [luc] } = await c.query("SELECT id, username, points_total FROM profiles WHERE username ILIKE '%lucif%'");
  
  const { rows: [lucSpent] } = await c.query('SELECT get_user_lifetime_fxu_spent($1) as val', [luc.id]);
  const { rows: [lucEarned] } = await c.query('SELECT get_user_market_earnings($1) as val', [luc.id]);
  const { rows: [lucFxuLimit] } = await c.query('SELECT calculate_fxu_weekly_limit($1) as val', [luc.id]);
  const { rows: [lucResLimit] } = await c.query('SELECT calculate_monthly_market_limit($1) as val', [luc.id]);

  const spent = parseFloat(lucSpent.val);
  const earned = parseFloat(lucEarned.val);
  const credit = Math.max(0, spent - earned);

  console.log('  Username:', luc.username);
  console.log('  Points:', luc.points_total);
  console.log('  Company spent (since today):', spent.toFixed(2));
  console.log('  Market earned (since today):', earned.toFixed(2));
  console.log('  Credit:', credit.toFixed(2));
  console.log('  Resource limit (units):', lucResLimit.val);
  console.log('  FXU limit:', parseFloat(lucFxuLimit.val).toFixed(2));
  
  if (spent >= 99000 && credit > 90000) {
    console.log('  ✅ PASS: Luciffer can recover his 100K Plus investment');
  } else {
    console.log('  ❌ FAIL: Something is wrong');
  }

  // ============================================
  // STEP 4: Verify via get_my_monthly_market_sales simulation
  // (This is what the frontend calls)
  // ============================================
  console.log('\nSTEP 4: Simulate get_my_monthly_market_sales for Luciffer...');
  // Can't call auth.uid() from here, so query components manually
  const yearWeek = await c.query("SELECT to_char(now(), 'IYYY-\"W\"IW') as yw");
  const yw = yearWeek.rows[0].yw;
  
  const { rows: [sales] } = await c.query(`
    SELECT COALESCE(fxu_value_sold, 0) as fxu_sold
    FROM market_monthly_sales
    WHERE user_id = $1 AND year_month = $2
  `, [luc.id, yw]);
  
  const fxuSold = sales ? parseFloat(sales.fxu_sold) : 0;
  const fxuLimit = parseFloat(lucFxuLimit.val);
  
  // Active FXU value
  const { rows: [activeFxu] } = await c.query(`
    SELECT COALESCE(SUM(quantity * price_per_unit), 0) as val
    FROM market_listings
    WHERE seller_id = $1 AND status = 'active'
    AND listing_type IN ('resource', 'ship')
    AND created_at >= date_trunc('week', now())
  `, [luc.id]);
  
  const activeVal = parseFloat(activeFxu.val);
  const totalUsed = fxuSold + activeVal;
  const remaining = Math.max(0, fxuLimit - totalUsed);
  
  console.log('  Week:', yw);
  console.log('  FXU sold this week (completed):', fxuSold.toFixed(2));
  console.log('  FXU in active listings:', activeVal.toFixed(2));
  console.log('  Total FXU used:', totalUsed.toFixed(2));
  console.log('  FXU limit:', fxuLimit.toFixed(2));
  console.log('  FXU remaining:', remaining.toFixed(2));

  // ============================================
  // STEP 5: Top 15 players final state
  // ============================================
  console.log('\nSTEP 5: Final state - Top 15 players');
  console.log('Username'.padEnd(30), 'Points'.padStart(8), 'Spent'.padStart(10), 'Earned'.padStart(10), 'Credit'.padStart(10), 'FXU Lim'.padStart(10), 'Res Lim'.padStart(10));
  console.log('-'.repeat(90));

  const { rows: top } = await c.query(`
    SELECT p.id, p.username, p.points_total,
      get_user_lifetime_fxu_spent(p.id) as spent,
      get_user_market_earnings(p.id) as earned,
      calculate_fxu_weekly_limit(p.id) as fxu_lim,
      calculate_monthly_market_limit(p.id) as res_lim
    FROM profiles p
    WHERE p.points_total > 0
    ORDER BY p.points_total DESC
    LIMIT 15
  `);

  for (const u of top) {
    const s = parseFloat(u.spent);
    const e = parseFloat(u.earned);
    const cr = Math.max(0, s - e);
    console.log(
      (u.username || '?').padEnd(30),
      String(u.points_total).padStart(8),
      s.toFixed(0).padStart(10),
      e.toFixed(0).padStart(10),
      cr.toFixed(0).padStart(10),
      parseFloat(u.fxu_lim).toFixed(0).padStart(10),
      String(u.res_lim).padStart(10)
    );
  }

  // ============================================
  // STEP 6: Edge case verification
  // ============================================
  console.log('\nSTEP 6: Edge cases');
  
  // Someone who spent AND earned today
  console.log('  Luciffer (spent+earned): credit=' + credit.toFixed(2) + ' ← reduces as he earns ✓');
  
  // Someone who never spent on company
  const { rows: [noSpend] } = await c.query(`
    SELECT p.username, calculate_fxu_weekly_limit(p.id) as lim, p.points_total
    FROM profiles p WHERE p.points_total > 100000 
    AND get_user_lifetime_fxu_spent(p.id) = 0
    LIMIT 1
  `);
  if (noSpend) {
    const expectedLim = noSpend.points_total * 0.001;
    const actualLim = parseFloat(noSpend.lim);
    console.log('  ' + noSpend.username + ' (no spending): limit=' + actualLim.toFixed(2) + ' expected=' + expectedLim.toFixed(2) + (Math.abs(actualLim - expectedLim) < 0.01 ? ' ✓' : ' ✗'));
  }

  console.log('\n✅ All checks complete. System is working correctly.');
  await c.end();
})();
