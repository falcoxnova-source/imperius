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
  // STEP 1: Add earnings_cutoff_date to market_resource_limits
  // ============================================================
  console.log('=== STEP 1: Add cutoff date column ===');
  await client.query(`
    ALTER TABLE market_resource_limits
    ADD COLUMN IF NOT EXISTS earnings_cutoff_date timestamptz DEFAULT NULL
  `);
  console.log('✅ Column added');

  // Set the cutoff to NOW (all past earnings are ignored)
  await client.query(`
    UPDATE market_resource_limits SET earnings_cutoff_date = now() WHERE id = 1
  `);
  const cutoff = await client.query(`SELECT earnings_cutoff_date FROM market_resource_limits WHERE id = 1`);
  console.log(`✅ Cutoff set to: ${cutoff.rows[0].earnings_cutoff_date}`);

  // ============================================================
  // STEP 2: Modify get_user_market_earnings to use cutoff date
  // Only count earnings AFTER the cutoff date
  // ============================================================
  console.log('\n=== STEP 2: Deploy get_user_market_earnings with cutoff ===');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.get_user_market_earnings(p_user_id uuid)
    RETURNS numeric
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_total numeric;
      v_cutoff timestamptz;
    BEGIN
      -- Get the global cutoff date (earnings before this date don't count)
      SELECT earnings_cutoff_date INTO v_cutoff
      FROM market_resource_limits WHERE id = 1;

      SELECT COALESCE(SUM(total_price), 0) INTO v_total
      FROM market_transactions
      WHERE seller_id = p_user_id
      AND (v_cutoff IS NULL OR created_at >= v_cutoff);

      RETURN v_total;
    END;
    $function$
  `);
  console.log('✅ get_user_market_earnings deployed (with cutoff filter)');

  // ============================================================
  // STEP 3: Revert calculate_monthly_market_limit to ORIGINAL
  // ============================================================
  console.log('\n=== STEP 3: Revert calculate_monthly_market_limit ===');
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
      v_monthly_limit bigint;
    BEGIN
      SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = p_user_id;

      v_fxu_spent := get_user_lifetime_fxu_spent(p_user_id);
      v_fxu_earned := get_user_market_earnings(p_user_id);

      v_fxu_credit := GREATEST(0, v_fxu_spent - v_fxu_earned);

      v_monthly_limit := v_user_points + FLOOR(v_fxu_credit);

      RETURN v_monthly_limit;
    END;
    $function$
  `);
  console.log('✅ calculate_monthly_market_limit reverted to original formula');

  // ============================================================
  // STEP 4: Revert get_my_monthly_market_sales to ORIGINAL (no vip_bonus)
  // ============================================================
  console.log('\n=== STEP 4: Revert get_my_monthly_market_sales ===');
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
      v_fxu_credit := GREATEST(0, v_fxu_spent - v_fxu_earned);

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
  console.log('✅ get_my_monthly_market_sales reverted to original');

  // ============================================================
  // STEP 5: Verify ALL users
  // ============================================================
  console.log('\n=== STEP 5: Verification ===');

  // Luciffer Walker
  const luciffer = await client.query(`
    SELECT id, username, points_total FROM profiles WHERE username LIKE '%Luciffer%' LIMIT 1
  `);
  const uid = luciffer.rows[0].id;
  const pts = parseInt(luciffer.rows[0].points_total);

  const spent = await client.query(`SELECT get_user_lifetime_fxu_spent($1) as v`, [uid]);
  const earned = await client.query(`SELECT get_user_market_earnings($1) as v`, [uid]);
  const limit = await client.query(`SELECT calculate_monthly_market_limit($1) as v`, [uid]);

  const fxuSpent = parseFloat(spent.rows[0].v);
  const fxuEarned = parseFloat(earned.rows[0].v);
  const credit = Math.max(0, fxuSpent - fxuEarned);

  console.log(`\nLuciffer Walker:`);
  console.log(`  Points: ${pts}`);
  console.log(`  FXU spent (ALL history): ${fxuSpent.toFixed(2)}`);
  console.log(`  FXU earned (ONLY after cutoff): ${fxuEarned.toFixed(2)} (should be ~0 since cutoff is NOW)`);
  console.log(`  FXU credit: max(0, ${fxuSpent.toFixed(2)} - ${fxuEarned.toFixed(2)}) = ${credit.toFixed(2)}`);
  console.log(`  Weekly limit: ${limit.rows[0].v}`);
  console.log(`  Expected: ${pts} + ${Math.floor(credit)} = ${pts + Math.floor(credit)}`);
  console.log(`  Match: ${parseInt(limit.rows[0].v) === pts + Math.floor(credit) ? '✅' : '❌'}`);

  // Check other users too
  const others = await client.query(`
    SELECT p.id, p.username, p.points_total,
           get_user_lifetime_fxu_spent(p.id) as spent,
           get_user_market_earnings(p.id) as earned,
           calculate_monthly_market_limit(p.id) as lim
    FROM profiles p
    WHERE p.points_total > 0
    ORDER BY p.points_total DESC
    LIMIT 6
  `);
  console.log('\n=== Top 6 users ===');
  for (const u of others.rows) {
    const s = parseFloat(u.spent);
    const e = parseFloat(u.earned);
    const c = Math.max(0, s - e);
    const expected = parseInt(u.points_total) + Math.floor(c);
    console.log(`  ${u.username}: pts=${u.points_total} spent=${s.toFixed(0)} earned=${e.toFixed(0)} credit=${c.toFixed(0)} limit=${u.lim} ${parseInt(u.lim) === expected ? '✅' : '❌'}`);
  }

  // Verify cutoff date is stored
  const config = await client.query(`SELECT earnings_cutoff_date FROM market_resource_limits WHERE id = 1`);
  console.log(`\nGlobal cutoff date: ${config.rows[0].earnings_cutoff_date}`);

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
