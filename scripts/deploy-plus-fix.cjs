const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();
  console.log('Connected.\n');

  // Fix: plus_subscription always counts, rest uses cutoff
  console.log('=== Deploying fixed get_user_lifetime_fxu_spent ===');
  await c.query(`
    CREATE OR REPLACE FUNCTION public.get_user_lifetime_fxu_spent(p_user_id uuid)
    RETURNS numeric
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_plus_total numeric;
      v_other_total numeric;
      v_cutoff timestamptz;
    BEGIN
      -- Get the global cutoff date
      SELECT earnings_cutoff_date INTO v_cutoff
      FROM market_resource_limits WHERE id = 1;

      -- Plus subscription ALWAYS counts (real money investment, no cutoff)
      SELECT COALESCE(SUM(amount), 0) INTO v_plus_total
      FROM admin_revenue
      WHERE related_user_id = p_user_id
        AND revenue_type = 'plus_subscription';

      -- Other spending only counts after cutoff
      SELECT COALESCE(SUM(amount), 0) INTO v_other_total
      FROM admin_revenue
      WHERE related_user_id = p_user_id
        AND revenue_type IN (
          'instant_build', 'instant_research', 'instant_ship',
          'officer_fxu', 'supply_box', 'fleet_acceleration',
          'expedition_fee', 'swap_fee', 'transfer_fee'
        )
        AND (v_cutoff IS NULL OR created_at >= v_cutoff);

      RETURN v_plus_total + v_other_total;
    END;
    $function$;
  `);
  console.log('✅ Deployed\n');

  // Verify with top players
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

  console.log('=== Top 10 players - Updated limits ===');
  console.log('Username'.padEnd(30), 'Points'.padStart(8), 'Spent'.padStart(12), 'Earned'.padStart(12), 'Credit'.padStart(12), 'FXU Limit'.padStart(12));
  for (const u of users) {
    const s = parseFloat(u.spent);
    const e = parseFloat(u.earned);
    const cr = Math.max(0, s - e);
    console.log(
      u.username.padEnd(30),
      String(u.points_total).padStart(8),
      s.toFixed(2).padStart(12),
      e.toFixed(2).padStart(12),
      cr.toFixed(2).padStart(12),
      parseFloat(u.fxu_limit).toFixed(2).padStart(12)
    );
  }

  await c.end();
  console.log('\nDone.');
})();
