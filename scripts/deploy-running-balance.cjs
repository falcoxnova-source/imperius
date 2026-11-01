const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('🚀 Deploying running balance fix...\n');

  // Step 1: Create calculate_running_fxu_credit - the core fix
  console.log('Step 1: Creating calculate_running_fxu_credit...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.calculate_running_fxu_credit(p_user_id uuid)
    RETURNS numeric
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_cutoff timestamptz;
      v_credit numeric := 0;
      v_row RECORD;
    BEGIN
      SELECT earnings_cutoff_date INTO v_cutoff
      FROM market_resource_limits WHERE id = 1;

      -- Process ALL events chronologically: spends go UP, sales go DOWN (floor 0)
      FOR v_row IN (
        -- Company spending events (add to credit)
        SELECT created_at, amount as delta, 'SPEND' as event_type
        FROM admin_revenue
        WHERE related_user_id = p_user_id
          AND revenue_type IN (
            'plus_subscription', 'fleet_acceleration', 'officer_fxu',
            'instant_ship', 'instant_build', 'instant_research', 'supply_box'
          )
          AND (v_cutoff IS NULL OR created_at >= v_cutoff)

        UNION ALL

        -- Market sale events (subtract from credit)
        SELECT mt.created_at, mt.total_price as delta, 'SALE' as event_type
        FROM market_transactions mt
        JOIN market_listings ml ON ml.id = mt.listing_id
        WHERE mt.seller_id = p_user_id
          AND ml.listing_type IN ('resource', 'ship')
          AND (v_cutoff IS NULL OR mt.created_at >= v_cutoff)

        ORDER BY created_at ASC
      ) LOOP
        IF v_row.event_type = 'SPEND' THEN
          v_credit := v_credit + v_row.delta;
        ELSE
          v_credit := v_credit - v_row.delta;
          IF v_credit < 0 THEN
            v_credit := 0;
          END IF;
        END IF;
      END LOOP;

      RETURN v_credit;
    END;
    $function$;
  `);
  console.log('   ✅ calculate_running_fxu_credit created');

  // Step 2: Update calculate_fxu_weekly_limit to use running balance
  console.log('Step 2: Updating calculate_fxu_weekly_limit...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.calculate_fxu_weekly_limit(p_user_id uuid)
    RETURNS numeric
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_user_points integer;
      v_fxu_credit numeric;
      v_min_price numeric;
      v_points_as_fxu numeric;
    BEGIN
      SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = p_user_id;

      -- Running balance: past earnings don't absorb future investments
      v_fxu_credit := calculate_running_fxu_credit(p_user_id);

      SELECT LEAST(min_price_metal, min_price_crystal, min_price_deuterium)
      INTO v_min_price FROM market_resource_limits WHERE id = 1;
      v_min_price := COALESCE(v_min_price, 0.001);

      v_points_as_fxu := v_user_points * v_min_price;

      RETURN v_points_as_fxu + v_fxu_credit;
    END;
    $function$;
  `);
  console.log('   ✅ calculate_fxu_weekly_limit updated');

  // Step 3: Update get_my_monthly_market_sales to show running credit
  console.log('Step 3: Updating get_my_monthly_market_sales...');
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
      v_user_points integer;
      v_resource_limit bigint;
      v_fxu_limit numeric;
      v_fxu_spent numeric;
      v_fxu_earned numeric;
      v_fxu_credit numeric;
      v_metal_sold bigint;
      v_crystal_sold bigint;
      v_deuterium_sold bigint;
      v_db_ships_value_sold bigint;
      v_db_fxu_value_sold numeric;
      v_active_ships_value bigint;
      v_active_fxu_value numeric;
      v_total_fxu_value numeric;
      v_week_start timestamptz;
      v_week_end timestamptz;
    BEGIN
      v_user_id := auth.uid();
      IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
      END IF;

      v_year_week := to_char(now(), 'IYYY-"W"IW');

      SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;
      IF NOT v_limits.monthly_limit_enabled THEN
        RETURN jsonb_build_object('success', true, 'monthly_limit_enabled', false);
      END IF;

      SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = v_user_id;

      -- Use running balance (not simple subtraction)
      v_fxu_spent := get_user_lifetime_fxu_spent(v_user_id);
      v_fxu_earned := get_user_market_earnings(v_user_id);
      v_fxu_credit := calculate_running_fxu_credit(v_user_id);

      v_resource_limit := v_user_points::bigint;
      v_fxu_limit := calculate_fxu_weekly_limit(v_user_id);

      SELECT
        COALESCE(metal_sold, 0), COALESCE(crystal_sold, 0), COALESCE(deuterium_sold, 0),
        COALESCE(ships_value_sold, 0), COALESCE(fxu_value_sold, 0)
      INTO v_metal_sold, v_crystal_sold, v_deuterium_sold, v_db_ships_value_sold, v_db_fxu_value_sold
      FROM market_monthly_sales
      WHERE user_id = v_user_id AND year_month = v_year_week;

      v_metal_sold := COALESCE(v_metal_sold, 0);
      v_crystal_sold := COALESCE(v_crystal_sold, 0);
      v_deuterium_sold := COALESCE(v_deuterium_sold, 0);
      v_db_ships_value_sold := COALESCE(v_db_ships_value_sold, 0);
      v_db_fxu_value_sold := COALESCE(v_db_fxu_value_sold, 0);

      SELECT
        COALESCE(SUM(CASE WHEN item_code = 'metal' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN item_code = 'crystal' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN item_code = 'deuterium' THEN quantity ELSE 0 END), 0)
      INTO v_active_metal, v_active_crystal, v_active_deuterium
      FROM market_listings
      WHERE seller_id = v_user_id AND listing_type = 'resource' AND status = 'active'
        AND created_at >= date_trunc('week', now());

      SELECT COALESCE(SUM(
        ml.quantity * (COALESCE(st.metal_cost, 0) + COALESCE(st.crystal_cost, 0) + COALESCE(st.deuterium_cost, 0))
      ), 0) INTO v_active_ships_value
      FROM market_listings ml
      JOIN ship_types st ON st.code = ml.item_code
      WHERE ml.seller_id = v_user_id AND ml.listing_type = 'ship' AND ml.status = 'active'
        AND ml.created_at >= date_trunc('week', now());

      SELECT COALESCE(SUM(ml.quantity * ml.price_per_unit), 0) INTO v_active_fxu_value
      FROM market_listings ml
      WHERE ml.seller_id = v_user_id AND ml.status = 'active'
        AND ml.listing_type IN ('resource', 'ship')
        AND ml.created_at >= date_trunc('week', now());

      v_total_fxu_value := v_db_fxu_value_sold + v_active_fxu_value;

      v_week_start := date_trunc('week', now());
      v_week_end := v_week_start + interval '7 days';

      RETURN jsonb_build_object(
        'success', true,
        'monthly_limit_enabled', true,
        'year_month', v_year_week,
        'user_points', v_user_points,
        'fxu_spent', v_fxu_spent,
        'fxu_earned', v_fxu_earned,
        'fxu_credit', FLOOR(v_fxu_credit),
        'monthly_limit', v_resource_limit,
        'metal_sold', v_metal_sold + v_active_metal,
        'crystal_sold', v_crystal_sold + v_active_crystal,
        'deuterium_sold', v_deuterium_sold + v_active_deuterium,
        'metal_remaining', GREATEST(0, v_resource_limit - v_metal_sold - v_active_metal),
        'crystal_remaining', GREATEST(0, v_resource_limit - v_crystal_sold - v_active_crystal),
        'deuterium_remaining', GREATEST(0, v_resource_limit - v_deuterium_sold - v_active_deuterium),
        'ships_value_sold', v_db_ships_value_sold + v_active_ships_value,
        'ships_value_remaining', GREATEST(0, v_resource_limit - v_db_ships_value_sold - v_active_ships_value),
        'fxu_limit', ROUND(v_fxu_limit, 2),
        'fxu_value_sold', ROUND(v_total_fxu_value, 2),
        'fxu_value_remaining', ROUND(GREATEST(0, v_fxu_limit - v_total_fxu_value), 2),
        'week_resets_at', v_week_end
      );
    END;
    $function$;
  `);
  console.log('   ✅ get_my_monthly_market_sales updated');

  // Step 4: VERIFY with real players
  console.log('\n' + '='.repeat(70));
  console.log('🧪 VERIFICATION');
  console.log('='.repeat(70));

  const testPlayers = await client.query(`
    SELECT id, username, points_total FROM profiles
    WHERE username ILIKE ANY(ARRAY['%luciffer%','%ronaldolara%','%ariel0110%','%onigen%','%layonnel%','%countdooku%'])
    ORDER BY points_total DESC
  `);

  for (const p of testPlayers.rows) {
    const { rows: [old] } = await client.query(
      `SELECT get_user_lifetime_fxu_spent($1) as spent, get_user_market_earnings($1) as earned`, [p.id]
    );
    const { rows: [running] } = await client.query(
      `SELECT calculate_running_fxu_credit($1) as credit`, [p.id]
    );
    const { rows: [limit] } = await client.query(
      `SELECT calculate_fxu_weekly_limit($1) as fxu_limit`, [p.id]
    );

    const spent = parseFloat(old.spent);
    const earned = parseFloat(old.earned);
    const oldCredit = Math.max(0, spent - earned);
    const newCredit = parseFloat(running.credit);
    const fxuLimit = parseFloat(limit.fxu_limit);
    const diff = newCredit - oldCredit;

    console.log(`\n👤 ${p.username} (${p.points_total} pts)`);
    console.log(`   Gastado: ${spent.toLocaleString()} | Ganado: ${earned.toLocaleString()}`);
    console.log(`   Crédito VIEJO (MAX(0, S-E)):  ${oldCredit.toLocaleString()} FXU`);
    console.log(`   Crédito NUEVO (running bal):  ${newCredit.toLocaleString()} FXU`);
    console.log(`   Límite FXU:                   ${fxuLimit.toLocaleString()} FXU`);
    if (diff > 0) {
      console.log(`   ✅ GANÓ ${diff.toLocaleString()} FXU de crédito con el fix`);
    } else if (diff === 0) {
      console.log(`   ➡️  Sin cambio (igual resultado)`);
    }
  }

  // Scenario simulation
  console.log('\n' + '='.repeat(70));
  console.log('🎮 SCENARIO: Player earned 800K then invests 100K');
  console.log('='.repeat(70));
  console.log(`
   Cronología:
   1. Vende 800K en mercado → crédito = 0 (piso en 0, no hay inversión)
   2. Invierte 100K FXU     → crédito = 100K ✅ (inversión limpia)
   3. Vende 50K en mercado  → crédito = 50K (va recuperando)
   4. Vende 60K en mercado  → crédito = 0 (ya recuperó todo + extra gratis)

   Con fórmula VIEJA:
   credit = MAX(0, 100K - 860K) = 0 ❌ (inversión invisible)

   Con fórmula NUEVA (running balance):
   credit = 100K → 50K → 0 ✅ (inversión respetada)
  `);

  console.log('✅ Deploy complete!');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
