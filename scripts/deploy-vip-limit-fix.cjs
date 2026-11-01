const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // ============================================================
  // STEP 1: Modify calculate_monthly_market_limit
  // NEW FORMULA: points + vip_spent (always) + max(0, other_spent - earned)
  // ============================================================
  console.log('=== STEP 1: Deploying calculate_monthly_market_limit ===');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.calculate_monthly_market_limit(p_user_id uuid)
    RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_user_points integer;
      v_fxu_spent numeric;
      v_fxu_earned numeric;
      v_fxu_credit numeric;
      v_vip_spent numeric;
      v_other_spent numeric;
      v_monthly_limit bigint;
    BEGIN
      SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = p_user_id;

      v_fxu_spent := get_user_lifetime_fxu_spent(p_user_id);
      v_fxu_earned := get_user_market_earnings(p_user_id);

      -- VIP/Plus subscription spending is non-degradable (always counts as credit)
      SELECT COALESCE(SUM(amount), 0) INTO v_vip_spent
      FROM admin_revenue
      WHERE related_user_id = p_user_id
      AND revenue_type = 'plus_subscription';

      -- Other spending can be degraded by market earnings
      v_other_spent := v_fxu_spent - v_vip_spent;
      v_fxu_credit := v_vip_spent + GREATEST(0, v_other_spent - v_fxu_earned);

      v_monthly_limit := v_user_points + FLOOR(v_fxu_credit);

      RETURN v_monthly_limit;
    END;
    $function$
  `);
  console.log('✅ calculate_monthly_market_limit deployed');

  // ============================================================
  // STEP 2: Update get_my_monthly_market_sales to show VIP bonus in UI
  // Only change: add v_vip_spent variable and include it in the response
  // ============================================================
  console.log('\n=== STEP 2: Deploying get_my_monthly_market_sales ===');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.get_my_monthly_market_sales()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_user_id uuid;
      v_year_week text;
      v_limits RECORD;
      v_active_metal bigint;
      v_active_crystal bigint;
      v_active_deuterium bigint;
      v_total_metal bigint;
      v_total_crystal bigint;
      v_total_deuterium bigint;
      v_user_points integer;
      v_weekly_limit bigint;
      v_fxu_spent numeric;
      v_fxu_earned numeric;
      v_fxu_credit numeric;
      v_vip_spent numeric;
      v_metal_sold bigint;
      v_crystal_sold bigint;
      v_deuterium_sold bigint;
      v_db_ships_value_sold bigint;
      v_active_ships_value bigint;
      v_total_ships_value bigint;
    BEGIN
      v_user_id := auth.uid();
      IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
      END IF;

      v_year_week := to_char(now(), 'IYYY-"W"IW');

      SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;
      IF NOT v_limits.monthly_limit_enabled THEN
        RETURN jsonb_build_object(
          'success', true,
          'monthly_limit_enabled', false
        );
      END IF;

      SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = v_user_id;

      v_fxu_spent := get_user_lifetime_fxu_spent(v_user_id);
      v_fxu_earned := get_user_market_earnings(v_user_id);

      -- VIP/Plus subscription spending (non-degradable)
      SELECT COALESCE(SUM(amount), 0) INTO v_vip_spent
      FROM admin_revenue
      WHERE related_user_id = v_user_id
      AND revenue_type = 'plus_subscription';

      -- Credit = VIP always + max(0, other - earned)
      v_fxu_credit := v_vip_spent + GREATEST(0, (v_fxu_spent - v_vip_spent) - v_fxu_earned);

      v_weekly_limit := calculate_monthly_market_limit(v_user_id);

      SELECT
        COALESCE(metal_sold, 0),
        COALESCE(crystal_sold, 0),
        COALESCE(deuterium_sold, 0),
        COALESCE(ships_value_sold, 0)
      INTO v_metal_sold, v_crystal_sold, v_deuterium_sold, v_db_ships_value_sold
      FROM market_monthly_sales
      WHERE user_id = v_user_id AND year_month = v_year_week;

      v_metal_sold := COALESCE(v_metal_sold, 0);
      v_crystal_sold := COALESCE(v_crystal_sold, 0);
      v_deuterium_sold := COALESCE(v_deuterium_sold, 0);
      v_db_ships_value_sold := COALESCE(v_db_ships_value_sold, 0);

      SELECT
        COALESCE(SUM(CASE WHEN item_code = 'metal' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN item_code = 'crystal' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN item_code = 'deuterium' THEN quantity ELSE 0 END), 0)
      INTO v_active_metal, v_active_crystal, v_active_deuterium
      FROM market_listings
      WHERE seller_id = v_user_id
        AND listing_type = 'resource'
        AND status = 'active'
        AND created_at >= date_trunc('week', now());

      -- Active ship listings value
      SELECT COALESCE(SUM(
        ml.quantity * (COALESCE(st.metal_cost, 0) + COALESCE(st.crystal_cost, 0) + COALESCE(st.deuterium_cost, 0))
      ), 0) INTO v_active_ships_value
      FROM market_listings ml
      JOIN ship_types st ON st.code = ml.item_code
      WHERE ml.seller_id = v_user_id
        AND ml.listing_type = 'ship'
        AND ml.status = 'active'
        AND ml.created_at >= date_trunc('week', now());

      v_total_metal := v_metal_sold + v_active_metal;
      v_total_crystal := v_crystal_sold + v_active_crystal;
      v_total_deuterium := v_deuterium_sold + v_active_deuterium;

      v_total_ships_value := v_db_ships_value_sold + v_active_ships_value;

      RETURN jsonb_build_object(
        'success', true,
        'monthly_limit_enabled', true,
        'year_month', v_year_week,
        'user_points', v_user_points,
        'fxu_spent', v_fxu_spent,
        'fxu_earned', v_fxu_earned,
        'fxu_credit', FLOOR(v_fxu_credit),
        'vip_bonus', FLOOR(v_vip_spent),
        'monthly_limit', v_weekly_limit,
        'metal_sold', v_total_metal,
        'crystal_sold', v_total_crystal,
        'deuterium_sold', v_total_deuterium,
        'metal_completed', v_metal_sold,
        'crystal_completed', v_crystal_sold,
        'deuterium_completed', v_deuterium_sold,
        'metal_active', v_active_metal,
        'crystal_active', v_active_crystal,
        'deuterium_active', v_active_deuterium,
        'metal_remaining', GREATEST(0, v_weekly_limit - v_total_metal),
        'crystal_remaining', GREATEST(0, v_weekly_limit - v_total_crystal),
        'deuterium_remaining', GREATEST(0, v_weekly_limit - v_total_deuterium),
        'ships_value_sold', v_total_ships_value,
        'ships_value_completed', v_db_ships_value_sold,
        'ships_value_active', v_active_ships_value,
        'ships_value_remaining', GREATEST(0, v_weekly_limit - v_total_ships_value)
      );
    END;
    $function$
  `);
  console.log('✅ get_my_monthly_market_sales deployed');

  // ============================================================
  // STEP 3: Verify
  // ============================================================
  console.log('\n=== STEP 3: Verification ===');

  const user = await client.query(`
    SELECT id, username, points_total FROM profiles WHERE username LIKE '%Luciffer%' LIMIT 1
  `);
  const uid = user.rows[0].id;
  const pts = parseInt(user.rows[0].points_total);

  const newLimit = await client.query(`SELECT calculate_monthly_market_limit($1) as lim`, [uid]);
  console.log(`User: ${user.rows[0].username}`);
  console.log(`Points: ${pts}`);
  console.log(`NEW weekly limit: ${newLimit.rows[0].lim}`);
  console.log(`OLD weekly limit was: ${pts} (only points, since fxu_credit was 0)`);
  console.log(`Increase: +${parseInt(newLimit.rows[0].lim) - pts} (VIP non-degradable bonus)`);

  // Verify the formula breakdown
  const spent = await client.query(`SELECT get_user_lifetime_fxu_spent($1) as v`, [uid]);
  const earned = await client.query(`SELECT get_user_market_earnings($1) as v`, [uid]);
  const vipSpent = await client.query(`
    SELECT COALESCE(SUM(amount), 0) as v FROM admin_revenue
    WHERE related_user_id = $1 AND revenue_type = 'plus_subscription'
  `, [uid]);

  const fxuSpent = parseFloat(spent.rows[0].v);
  const fxuEarned = parseFloat(earned.rows[0].v);
  const vip = parseFloat(vipSpent.rows[0].v);
  const otherSpent = fxuSpent - vip;
  const credit = vip + Math.max(0, otherSpent - fxuEarned);
  const expectedLimit = pts + Math.floor(credit);

  console.log(`\nFormula breakdown:`);
  console.log(`  ${pts} (pts) + ${vip} (VIP, non-degradable) + max(0, ${otherSpent.toFixed(2)} - ${fxuEarned.toFixed(2)}) = ${pts} + ${vip} + 0 = ${expectedLimit}`);
  console.log(`  DB returned: ${newLimit.rows[0].lim}`);
  console.log(`  Match: ${parseInt(newLimit.rows[0].lim) === expectedLimit ? '✅' : '❌'}`);

  // Test a non-VIP user to make sure they're unaffected
  const nonVip = await client.query(`
    SELECT p.id, p.username, p.points_total,
           calculate_monthly_market_limit(p.id) as new_limit
    FROM profiles p
    WHERE p.id NOT IN (SELECT user_id FROM plus_subscriptions)
    AND p.points_total > 0
    LIMIT 3
  `);
  console.log(`\nNon-VIP users (should be unchanged):`);
  for (const nv of nonVip.rows) {
    const oldStyle = await client.query(`
      SELECT get_user_lifetime_fxu_spent($1) as spent, get_user_market_earnings($1) as earned
    `, [nv.id]);
    const os = parseFloat(oldStyle.rows[0].spent);
    const oe = parseFloat(oldStyle.rows[0].earned);
    const oldLimit = parseInt(nv.points_total) + Math.floor(Math.max(0, os - oe));
    console.log(`  ${nv.username}: limit=${nv.new_limit} (old formula would be=${oldLimit}) ${parseInt(nv.new_limit) === oldLimit ? '✅ same' : '⚠️ DIFFERENT'}`);
  }

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
