const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();
  console.log('Connected.\n');

  // Fix get_user_lifetime_fxu_spent to also use earnings_cutoff_date
  console.log('=== Deploying fixed get_user_lifetime_fxu_spent (with cutoff) ===');
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
      -- Get the global cutoff date (spending before this date doesn't count)
      SELECT earnings_cutoff_date INTO v_cutoff
      FROM market_resource_limits WHERE id = 1;

      SELECT COALESCE(SUM(amount), 0) INTO v_total
      FROM admin_revenue
      WHERE related_user_id = p_user_id
        AND revenue_type IN (
          'instant_build', 'instant_research', 'instant_ship',
          'officer_fxu', 'supply_box', 'fleet_acceleration',
          'expedition_fee', 'swap_fee', 'transfer_fee',
          'plus_subscription'
        )
        AND (v_cutoff IS NULL OR created_at >= v_cutoff);

      RETURN v_total;
    END;
    $function$;
  `);
  console.log('✅ get_user_lifetime_fxu_spent updated with cutoff filter\n');

  // Verify with Luciffer
  const { rows: [user] } = await c.query(
    "SELECT id, username, points_total FROM profiles WHERE username ILIKE '%lucif%'"
  );
  console.log('=== Verification: ' + user.username + ' ===');

  const { rows: [spent] } = await c.query('SELECT get_user_lifetime_fxu_spent($1) as val', [user.id]);
  const { rows: [earned] } = await c.query('SELECT get_user_market_earnings($1) as val', [user.id]);
  const { rows: [fxuLimit] } = await c.query('SELECT calculate_fxu_weekly_limit($1) as val', [user.id]);

  const spentNum = parseFloat(spent.val);
  const earnedNum = parseFloat(earned.val);
  const credit = Math.max(0, spentNum - earnedNum);
  const minPrice = 0.001;
  const pointsFxu = user.points_total * minPrice;

  console.log('FXU spent (after cutoff):', spentNum);
  console.log('FXU earned (after cutoff):', earnedNum);
  console.log('FXU credit:', credit);
  console.log('Points as FXU:', pointsFxu.toFixed(2));
  console.log('FXU weekly limit (from function):', parseFloat(fxuLimit.val).toFixed(2));
  console.log('Expected limit:', (pointsFxu + credit).toFixed(2));

  // Also check a few other users to make sure it works
  const { rows: users } = await c.query(`
    SELECT p.id, p.username, p.points_total,
      get_user_lifetime_fxu_spent(p.id) as spent,
      get_user_market_earnings(p.id) as earned,
      calculate_fxu_weekly_limit(p.id) as fxu_limit
    FROM profiles p
    WHERE p.points_total > 0
    ORDER BY p.points_total DESC
    LIMIT 10
  `);

  console.log('\n=== Top 10 players limits ===');
  console.log('Username'.padEnd(30), 'Points'.padStart(10), 'Spent'.padStart(12), 'Earned'.padStart(12), 'Credit'.padStart(12), 'FXU Limit'.padStart(12));
  for (const u of users) {
    const s = parseFloat(u.spent);
    const e = parseFloat(u.earned);
    const cr = Math.max(0, s - e);
    console.log(
      u.username.padEnd(30),
      String(u.points_total).padStart(10),
      s.toFixed(2).padStart(12),
      e.toFixed(2).padStart(12),
      cr.toFixed(2).padStart(12),
      parseFloat(u.fxu_limit).toFixed(2).padStart(12)
    );
  }

  await c.end();
  console.log('\nDone.');
})();
