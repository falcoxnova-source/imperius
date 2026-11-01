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
  // STEP 1: Update calculate_monthly_market_limit
  // Add p_min_price parameter (default 1 for backward compat)
  // FXU credit is divided by min_price to convert to resource units
  // ============================================================
  console.log('=== STEP 1: Deploy calculate_monthly_market_limit ===');

  // Drop old single-param version first
  await client.query(`DROP FUNCTION IF EXISTS calculate_monthly_market_limit(uuid)`);

  await client.query(`
    CREATE OR REPLACE FUNCTION public.calculate_monthly_market_limit(p_user_id uuid, p_min_price numeric DEFAULT 1)
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
      v_credit_in_units bigint;
      v_monthly_limit bigint;
    BEGIN
      SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = p_user_id;

      v_fxu_spent := get_user_lifetime_fxu_spent(p_user_id);
      v_fxu_earned := get_user_market_earnings(p_user_id);

      v_fxu_credit := GREATEST(0, v_fxu_spent - v_fxu_earned);

      -- Convert FXU credit to resource units using min price
      -- e.g. 100,000 FXU / 0.001 min_price = 100,000,000 resource units
      IF p_min_price > 0 THEN
        v_credit_in_units := FLOOR(v_fxu_credit / p_min_price);
      ELSE
        v_credit_in_units := FLOOR(v_fxu_credit);
      END IF;

      v_monthly_limit := v_user_points + v_credit_in_units;

      RETURN v_monthly_limit;
    END;
    $function$
  `);
  console.log('✅ calculate_monthly_market_limit deployed (with p_min_price param)');

  // ============================================================
  // STEP 2: Update create_market_listing
  // Pass the correct min_price when checking limits
  // ============================================================
  console.log('\n=== STEP 2: Deploy create_market_listing ===');

  // Get current source to understand the full function
  const srcResult = await client.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'create_market_listing'
  `);
  // We need to rebuild it passing min_price to calculate_monthly_market_limit
  
  await client.query(`
    CREATE OR REPLACE FUNCTION public.create_market_listing(
      p_listing_type text,
      p_item_code text,
      p_quantity bigint,
      p_price_per_unit numeric,
      p_planet_id uuid DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_user_id uuid;
      v_total_price numeric;
      v_current_amount numeric;
      v_ship_quantity int;
      v_user_dm int;
      v_listing_id uuid;
      v_telegram_id bigint;
      v_is_member boolean;
      v_username text;
      v_limits RECORD;
      v_year_week text;
      v_current_sold bigint;
      v_active_listed bigint;
      v_weekly_limit bigint;
      v_min_price numeric;
      v_remaining bigint;
      v_ship_value bigint;
      v_ship_total_value bigint;
      v_current_ships_value_sold bigint;
      v_active_ships_value bigint;
      v_ships_value_remaining bigint;
    BEGIN
      v_user_id := auth.uid();

      IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
      END IF;

      SELECT telegram_id INTO v_telegram_id
      FROM telegram_links
      WHERE user_id = v_user_id;

      IF v_telegram_id IS NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Debes vincular tu cuenta de Telegram para usar el mercado. Ve a la seccion de Tareas para vincular tu cuenta.',
          'requires_telegram', true
        );
      END IF;

      SELECT is_member INTO v_is_member
      FROM telegram_task_rewards
      WHERE user_id = v_user_id AND task_type = 'join_group';

      IF v_is_member IS NULL OR v_is_member = false THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Debes ser miembro del grupo de Telegram para usar el mercado. Unete al grupo desde la seccion de Tareas.',
          'requires_telegram', true
        );
      END IF;

      -- Limit max active listings per player (anti-spam)
      IF (SELECT COUNT(*) FROM market_listings WHERE seller_id = v_user_id AND status = 'active') >= 15 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Maximo 15 ofertas activas permitidas. Cancela o espera que se vendan algunas.');
      END IF;

      IF p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cantidad debe ser mayor a 0');
      END IF;

      IF p_price_per_unit <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Precio debe ser mayor a 0');
      END IF;

      IF p_listing_type NOT IN ('resource', 'ship', 'dark_matter') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tipo de listado invalido');
      END IF;

      IF p_listing_type != 'dark_matter' THEN
        IF p_planet_id IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'Planeta requerido');
        END IF;

        IF NOT EXISTS (SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = v_user_id) THEN
          RETURN jsonb_build_object('success', false, 'error', 'No eres dueno de este planeta');
        END IF;
      END IF;

      IF p_listing_type = 'resource' THEN
        SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;

        IF p_item_code = 'metal' THEN
          v_min_price := v_limits.min_price_metal;
        ELSIF p_item_code = 'crystal' THEN
          v_min_price := v_limits.min_price_crystal;
        ELSIF p_item_code = 'deuterium' THEN
          v_min_price := v_limits.min_price_deuterium;
        END IF;

        IF p_price_per_unit < v_min_price THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Precio minimo por unidad de ' || p_item_code || ' es ' || v_min_price || ' FXU',
            'min_price', v_min_price
          );
        END IF;

        IF v_limits.monthly_limit_enabled THEN
          -- Pass min_price to convert FXU credit to resource units
          v_weekly_limit := calculate_monthly_market_limit(v_user_id, v_min_price);

          v_year_week := to_char(now(), 'IYYY-"W"IW');

          SELECT
            CASE p_item_code
              WHEN 'metal' THEN COALESCE(metal_sold, 0)
              WHEN 'crystal' THEN COALESCE(crystal_sold, 0)
              WHEN 'deuterium' THEN COALESCE(deuterium_sold, 0)
            END INTO v_current_sold
          FROM market_monthly_sales
          WHERE user_id = v_user_id AND year_month = v_year_week;

          v_current_sold := COALESCE(v_current_sold, 0);

          SELECT COALESCE(SUM(quantity), 0) INTO v_active_listed
          FROM market_listings
          WHERE seller_id = v_user_id
            AND listing_type = 'resource'
            AND item_code = p_item_code
            AND status = 'active'
            AND created_at >= date_trunc('week', now());

          v_remaining := v_weekly_limit - v_current_sold - v_active_listed;

          IF p_quantity > v_remaining THEN
            RETURN jsonb_build_object(
              'success', false,
              'error', 'Excede tu limite semanal de venta de ' || p_item_code || '. Restante: ' || GREATEST(0, v_remaining) || ' unidades (limite: ' || v_weekly_limit || ')',
              'weekly_limit', v_weekly_limit,
              'current_sold', v_current_sold,
              'active_listed', v_active_listed,
              'remaining', GREATEST(0, v_remaining)
            );
          END IF;
        END IF;
      END IF;

      -- === SHIP WEEKLY LIMIT CHECK ===
      IF p_listing_type = 'ship' THEN
        SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;

        IF v_limits.monthly_limit_enabled THEN
          -- Get ship resource value
          SELECT (COALESCE(metal_cost, 0) + COALESCE(crystal_cost, 0) + COALESCE(deuterium_cost, 0))::bigint
          INTO v_ship_value
          FROM ship_types WHERE code = p_item_code;

          v_ship_value := COALESCE(v_ship_value, 0);

          IF v_ship_value > 0 THEN
            v_ship_total_value := p_quantity * v_ship_value;
            -- For ships, use average min price (all are 0.001 currently)
            v_min_price := LEAST(v_limits.min_price_metal, v_limits.min_price_crystal, v_limits.min_price_deuterium);
            v_weekly_limit := calculate_monthly_market_limit(v_user_id, v_min_price);
            v_year_week := to_char(now(), 'IYYY-"W"IW');

            -- Get already sold ship value this week
            SELECT COALESCE(ships_value_sold, 0) INTO v_current_ships_value_sold
            FROM market_monthly_sales
            WHERE user_id = v_user_id AND year_month = v_year_week;

            v_current_ships_value_sold := COALESCE(v_current_ships_value_sold, 0);

            -- Get active ship listings value this week
            SELECT COALESCE(SUM(
              ml.quantity * (COALESCE(st.metal_cost, 0) + COALESCE(st.crystal_cost, 0) + COALESCE(st.deuterium_cost, 0))
            ), 0) INTO v_active_ships_value
            FROM market_listings ml
            JOIN ship_types st ON st.code = ml.item_code
            WHERE ml.seller_id = v_user_id
              AND ml.listing_type = 'ship'
              AND ml.status = 'active'
              AND ml.created_at >= date_trunc('week', now());

            v_ships_value_remaining := v_weekly_limit - v_current_ships_value_sold - v_active_ships_value;

            IF v_ship_total_value > v_ships_value_remaining THEN
              RETURN jsonb_build_object(
                'success', false,
                'error', 'Excede tu limite semanal de venta de naves. Valor restante: ' || GREATEST(0, v_ships_value_remaining) || ' (limite: ' || v_weekly_limit || ', valor por nave: ' || v_ship_value || ')',
                'weekly_limit', v_weekly_limit,
                'current_sold', v_current_ships_value_sold,
                'active_listed', v_active_ships_value,
                'remaining', GREATEST(0, v_ships_value_remaining),
                'ship_value', v_ship_value
              );
            END IF;
          END IF;
        END IF;
      END IF;

      v_total_price := p_quantity * p_price_per_unit;

      IF p_listing_type = 'resource' THEN
        IF p_item_code NOT IN ('metal', 'crystal', 'deuterium') THEN
          RETURN jsonb_build_object('success', false, 'error', 'Recurso invalido');
        END IF;

        IF p_item_code = 'metal' THEN
          SELECT metal INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;
          IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Metal insuficiente');
          END IF;
        ELSIF p_item_code = 'crystal' THEN
          SELECT crystal INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;
          IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cristal insuficiente');
          END IF;
        ELSIF p_item_code = 'deuterium' THEN
          SELECT deuterium INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;
          IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente');
          END IF;
        END IF;

      ELSIF p_listing_type = 'dark_matter' THEN
        SELECT dark_matter INTO v_user_dm FROM profiles WHERE id = v_user_id FOR UPDATE;
        IF v_user_dm IS NULL OR v_user_dm < p_quantity THEN
          RETURN jsonb_build_object('success', false, 'error', 'Materia oscura insuficiente');
        END IF;
        UPDATE profiles SET dark_matter = dark_matter - p_quantity WHERE id = v_user_id;

      ELSIF p_listing_type = 'ship' THEN
        IF NOT EXISTS (SELECT 1 FROM ship_types WHERE code = p_item_code) THEN
          RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave invalido');
        END IF;

        SELECT ps.quantity INTO v_ship_quantity
        FROM planet_ships ps
        JOIN ship_types st ON st.id = ps.ship_type_id
        WHERE ps.planet_id = p_planet_id AND st.code = p_item_code
        FOR UPDATE;

        IF v_ship_quantity IS NULL OR v_ship_quantity < p_quantity THEN
          RETURN jsonb_build_object('success', false, 'error', 'Naves insuficientes');
        END IF;
      END IF;

      INSERT INTO market_listings (seller_id, listing_type, item_code, quantity, price_per_unit, total_price, planet_id, status)
      VALUES (v_user_id, p_listing_type, p_item_code, p_quantity, p_price_per_unit, v_total_price, p_planet_id, 'active')
      RETURNING id INTO v_listing_id;

      SELECT username INTO v_username FROM profiles WHERE id = v_user_id;

      PERFORM send_market_telegram_notification(
        v_listing_id,
        COALESCE(v_username, 'Jugador'),
        p_listing_type,
        p_item_code,
        p_quantity,
        p_price_per_unit,
        v_total_price
      );

      RETURN jsonb_build_object(
        'success', true,
        'message', 'Oferta creada exitosamente. Los recursos permanecen en tu planeta hasta que se vendan.',
        'listing_id', v_listing_id
      );

    EXCEPTION
      WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'Error al crear oferta: ' || SQLERRM);
    END;
    $function$
  `);
  console.log('✅ create_market_listing deployed (passes min_price to limit calc)');

  // ============================================================
  // STEP 3: Update get_my_monthly_market_sales
  // Show per-resource limits using correct min_price conversion
  // ============================================================
  console.log('\n=== STEP 3: Deploy get_my_monthly_market_sales ===');
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
      v_limit_metal bigint;
      v_limit_crystal bigint;
      v_limit_deuterium bigint;
      v_limit_ships bigint;
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

      -- Calculate per-resource limits using each resource's min price
      v_limit_metal := calculate_monthly_market_limit(v_user_id, v_limits.min_price_metal);
      v_limit_crystal := calculate_monthly_market_limit(v_user_id, v_limits.min_price_crystal);
      v_limit_deuterium := calculate_monthly_market_limit(v_user_id, v_limits.min_price_deuterium);
      v_limit_ships := calculate_monthly_market_limit(v_user_id, LEAST(v_limits.min_price_metal, v_limits.min_price_crystal, v_limits.min_price_deuterium));

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
        'monthly_limit', v_limit_metal,
        'metal_sold', v_total_metal,
        'crystal_sold', v_total_crystal,
        'deuterium_sold', v_total_deuterium,
        'metal_completed', v_metal_sold,
        'crystal_completed', v_crystal_sold,
        'deuterium_completed', v_deuterium_sold,
        'metal_active', v_active_metal,
        'crystal_active', v_active_crystal,
        'deuterium_active', v_active_deuterium,
        'metal_remaining', GREATEST(0, v_limit_metal - v_total_metal),
        'crystal_remaining', GREATEST(0, v_limit_crystal - v_total_crystal),
        'deuterium_remaining', GREATEST(0, v_limit_deuterium - v_total_deuterium),
        'ships_value_sold', v_total_ships_value,
        'ships_value_completed', v_db_ships_value_sold,
        'ships_value_active', v_active_ships_value,
        'ships_value_remaining', GREATEST(0, v_limit_ships - v_total_ships_value),
        'limit_metal', v_limit_metal,
        'limit_crystal', v_limit_crystal,
        'limit_deuterium', v_limit_deuterium,
        'limit_ships', v_limit_ships
      );
    END;
    $function$
  `);
  console.log('✅ get_my_monthly_market_sales deployed (per-resource limits)');

  // ============================================================
  // STEP 4: Verification
  // ============================================================
  console.log('\n=== STEP 4: Verification ===');

  const user = await client.query(`SELECT id, username, points_total FROM profiles WHERE username LIKE '%Luciffer%' LIMIT 1`);
  const uid = user.rows[0].id;
  const pts = parseInt(user.rows[0].points_total);

  const spent = await client.query(`SELECT get_user_lifetime_fxu_spent($1) as v`, [uid]);
  const earned = await client.query(`SELECT get_user_market_earnings($1) as v`, [uid]);
  const fxuCredit = Math.max(0, parseFloat(spent.rows[0].v) - parseFloat(earned.rows[0].v));

  const metalLimit = await client.query(`SELECT calculate_monthly_market_limit($1, 0.001) as v`, [uid]);
  const crystalLimit = await client.query(`SELECT calculate_monthly_market_limit($1, 0.001) as v`, [uid]);
  const deutLimit = await client.query(`SELECT calculate_monthly_market_limit($1, 0.001) as v`, [uid]);

  console.log(`User: ${user.rows[0].username}`);
  console.log(`Points: ${pts}`);
  console.log(`FXU credit: ${fxuCredit.toFixed(2)}`);
  console.log(`FXU credit in metal units (÷0.001): ${Math.floor(fxuCredit / 0.001)}`);
  console.log(`Metal limit: ${metalLimit.rows[0].v} = ${pts} + ${Math.floor(fxuCredit / 0.001)}`);
  console.log(`Crystal limit: ${crystalLimit.rows[0].v}`);
  console.log(`Deuterium limit: ${deutLimit.rows[0].v}`);

  // Verify recovery math
  const totalCapacity = parseInt(metalLimit.rows[0].v);
  const fxuRecoverablePerWeek = totalCapacity * 0.001;
  console.log(`\n--- Recovery Analysis ---`);
  console.log(`Metal capacity/week: ${totalCapacity.toLocaleString()} units`);
  console.log(`At min price 0.001: ${totalCapacity.toLocaleString()} × 0.001 = ${fxuRecoverablePerWeek.toLocaleString()} FXU/week`);
  console.log(`FXU credit to recover: ${fxuCredit.toFixed(2)}`);
  console.log(`Weeks to recover (metal only): ${(fxuCredit / fxuRecoverablePerWeek).toFixed(1)} weeks`);
  console.log(`With all 3 resources: ${(fxuCredit / (fxuRecoverablePerWeek * 3)).toFixed(1)} weeks`);

  // Check non-VIP users unchanged
  const others = await client.query(`
    SELECT p.id, p.username, p.points_total,
           calculate_monthly_market_limit(p.id, 0.001) as new_limit
    FROM profiles p
    WHERE p.id NOT IN (SELECT related_user_id FROM admin_revenue WHERE revenue_type IN (
      'instant_build','instant_research','instant_ship','officer_fxu','supply_box',
      'fleet_acceleration','expedition_fee','swap_fee','transfer_fee','plus_subscription'
    ))
    AND p.points_total > 0
    LIMIT 3
  `);
  console.log(`\nUsers with zero spending (should be points only):`);
  for (const u of others.rows) {
    console.log(`  ${u.username}: limit=${u.new_limit} pts=${u.points_total} ${parseInt(u.new_limit) === parseInt(u.points_total) ? '✅' : '⚠️'}`);
  }

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
