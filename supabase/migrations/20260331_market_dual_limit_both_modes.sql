-- ============================================================
-- Fix: Market dual limit - BOTH modes apply simultaneously
-- 
-- Before: credit > 0 → ONLY FXU limit; credit = 0 → ONLY unit limit
-- After:  BOTH limits apply always. User can sell via EITHER mode.
--         FXU credit mode AND unit limit by ranking points.
--         User is only blocked if BOTH modes are exhausted.
--
-- Bug: User with small FXU credit (e.g. 9 FXU) was stuck in 
--      credit-only mode and couldn't sell anything once used up,
--      even though ranking points should allow unit-based selling.
-- ============================================================

-- 1. Update create_market_listing: check BOTH modes, block only if BOTH fail
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
  -- FXU limit vars
  v_fxu_limit numeric;
  v_fxu_value_this_listing numeric;
  v_fxu_value_sold numeric;
  v_fxu_value_active numeric;
  v_fxu_remaining numeric;
  -- Dual mode vars
  v_fxu_ok boolean := false;
  v_unit_ok boolean := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Block if user is in vacation mode
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND vacation_mode = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes usar el mercado en modo vacaciones. Desactiva el modo vacaciones primero.');
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

  v_total_price := p_quantity * p_price_per_unit;

  SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;

  IF v_limits.monthly_limit_enabled AND p_listing_type IN ('resource', 'ship') THEN
    v_year_week := to_char(now(), 'IYYY-"W"IW');

    -- Min price ALWAYS applies
    IF p_listing_type = 'resource' THEN
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
    END IF;

    -- ========== VIP PLUS: SKIP ALL LIMITS ==========
    IF is_user_plus(v_user_id) THEN
      -- VIP Plus users have no selling limits (min price still applied above)
      NULL;
    ELSE

    -- ========== CHECK 1: FXU CREDIT MODE ==========
    v_fxu_limit := calculate_fxu_weekly_limit(v_user_id);

    IF v_fxu_limit > 0 THEN
      v_fxu_value_this_listing := v_total_price;

      SELECT COALESCE(fxu_value_sold, 0) INTO v_fxu_value_sold
      FROM market_monthly_sales
      WHERE user_id = v_user_id AND year_month = v_year_week;
      v_fxu_value_sold := COALESCE(v_fxu_value_sold, 0);

      SELECT COALESCE(SUM(ml.quantity * ml.price_per_unit), 0) INTO v_fxu_value_active
      FROM market_listings ml
      WHERE ml.seller_id = v_user_id
        AND ml.status = 'active'
        AND ml.listing_type IN ('resource', 'ship')
        AND ml.created_at >= date_trunc('week', now());

      v_fxu_remaining := v_fxu_limit - v_fxu_value_sold - v_fxu_value_active;

      IF v_fxu_value_this_listing <= v_fxu_remaining THEN
        v_fxu_ok := true;  -- Passes FXU credit check
      END IF;
    END IF;

    -- ========== CHECK 2: UNIT LIMIT BY RANKING POINTS ==========
    IF p_listing_type = 'resource' THEN
      v_weekly_limit := calculate_monthly_market_limit(v_user_id);

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

      IF p_quantity <= v_remaining THEN
        v_unit_ok := true;  -- Passes unit limit check
      END IF;
    END IF;

    IF p_listing_type = 'ship' THEN
      SELECT (COALESCE(metal_cost, 0) + COALESCE(crystal_cost, 0) + COALESCE(deuterium_cost, 0))::bigint
      INTO v_ship_value
      FROM ship_types WHERE code = p_item_code;

      v_ship_value := COALESCE(v_ship_value, 0);

      IF v_ship_value > 0 THEN
        v_ship_total_value := p_quantity * v_ship_value;
        v_weekly_limit := calculate_monthly_market_limit(v_user_id);

        SELECT COALESCE(ships_value_sold, 0) INTO v_current_ships_value_sold
        FROM market_monthly_sales
        WHERE user_id = v_user_id AND year_month = v_year_week;

        v_current_ships_value_sold := COALESCE(v_current_ships_value_sold, 0);

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

        IF v_ship_total_value <= v_ships_value_remaining THEN
          v_unit_ok := true;  -- Passes unit limit check
        END IF;
      ELSE
        v_unit_ok := true;  -- No ship value = no limit
      END IF;
    END IF;

    -- ========== BLOCK ONLY IF BOTH MODES FAIL ==========
    IF NOT v_fxu_ok AND NOT v_unit_ok THEN
      -- Build informative error
      IF v_fxu_limit > 0 AND v_weekly_limit > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Excede ambos limites semanales. Credito FXU restante: ' || ROUND(GREATEST(0, v_fxu_remaining), 2) || ' FXU. Limite de unidades restante: ' || GREATEST(0, COALESCE(v_remaining, v_ships_value_remaining)) || '.',
          'fxu_limit', v_fxu_limit,
          'fxu_remaining', GREATEST(0, v_fxu_remaining),
          'unit_remaining', GREATEST(0, COALESCE(v_remaining, v_ships_value_remaining))
        );
      ELSIF v_fxu_limit > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Excede tu credito de inversion. Restante: ' || ROUND(GREATEST(0, v_fxu_remaining), 2) || ' FXU (credito total: ' || ROUND(v_fxu_limit, 2) || ' FXU)',
          'fxu_limit', v_fxu_limit,
          'fxu_remaining', GREATEST(0, v_fxu_remaining)
        );
      ELSE
        IF p_listing_type = 'resource' THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Excede tu limite semanal de unidades de ' || p_item_code || '. Restante: ' || GREATEST(0, v_remaining) || ' unidades (limite: ' || v_weekly_limit || ')',
            'weekly_limit', v_weekly_limit,
            'remaining', GREATEST(0, v_remaining)
          );
        ELSE
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Excede tu limite semanal de venta de naves. Valor restante: ' || GREATEST(0, v_ships_value_remaining) || ' (limite: ' || v_weekly_limit || ', valor por nave: ' || v_ship_value || ')',
            'weekly_limit', v_weekly_limit,
            'remaining', GREATEST(0, v_ships_value_remaining),
            'ship_value', v_ship_value
          );
        END IF;
      END IF;
    END IF;

    END IF; -- end VIP Plus check
  END IF;

  -- === Validate resources/ships/DM ===
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
$function$;


-- 2. Update get_my_monthly_market_sales: always return BOTH sets of data
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
  v_fxu_remaining numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  v_year_week := to_char(now(), 'IYYY-"W"IW');

  -- VIP Plus: unlimited market access
  IF is_user_plus(v_user_id) THEN
    RETURN jsonb_build_object(
      'success', true,
      'monthly_limit_enabled', true,
      'vip_unlimited', true
    );
  END IF;

  SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;
  IF NOT v_limits.monthly_limit_enabled THEN
    RETURN jsonb_build_object('success', true, 'monthly_limit_enabled', false);
  END IF;

  SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = v_user_id;

  v_fxu_spent := get_user_lifetime_fxu_spent(v_user_id);
  v_fxu_earned := get_user_market_earnings(v_user_id);
  v_fxu_credit := calculate_running_fxu_credit(v_user_id);

  v_resource_limit := v_user_points::bigint;
  v_fxu_limit := calculate_fxu_weekly_limit(v_user_id);

  -- Get sold this week
  SELECT
    COALESCE(metal_sold, 0),
    COALESCE(crystal_sold, 0),
    COALESCE(deuterium_sold, 0),
    COALESCE(ships_value_sold, 0),
    COALESCE(fxu_value_sold, 0)
  INTO v_metal_sold, v_crystal_sold, v_deuterium_sold, v_db_ships_value_sold, v_db_fxu_value_sold
  FROM market_monthly_sales
  WHERE user_id = v_user_id AND year_month = v_year_week;

  v_metal_sold := COALESCE(v_metal_sold, 0);
  v_crystal_sold := COALESCE(v_crystal_sold, 0);
  v_deuterium_sold := COALESCE(v_deuterium_sold, 0);
  v_db_ships_value_sold := COALESCE(v_db_ships_value_sold, 0);
  v_db_fxu_value_sold := COALESCE(v_db_fxu_value_sold, 0);

  -- Active resource listings this week
  SELECT
    COALESCE(SUM(CASE WHEN item_code = 'metal' THEN quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_code = 'crystal' THEN quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_code = 'deuterium' THEN quantity ELSE 0 END), 0)
  INTO v_active_metal, v_active_crystal, v_active_deuterium
  FROM market_listings
  WHERE seller_id = v_user_id AND listing_type = 'resource' AND status = 'active'
    AND created_at >= date_trunc('week', now());

  -- Active ship listings value
  SELECT COALESCE(SUM(
    ml.quantity * (COALESCE(st.metal_cost, 0) + COALESCE(st.crystal_cost, 0) + COALESCE(st.deuterium_cost, 0))
  ), 0) INTO v_active_ships_value
  FROM market_listings ml
  JOIN ship_types st ON st.code = ml.item_code
  WHERE ml.seller_id = v_user_id AND ml.listing_type = 'ship' AND ml.status = 'active'
    AND ml.created_at >= date_trunc('week', now());

  -- Active FXU value of all listings
  SELECT COALESCE(SUM(ml.quantity * ml.price_per_unit), 0) INTO v_active_fxu_value
  FROM market_listings ml
  WHERE ml.seller_id = v_user_id AND ml.status = 'active'
    AND ml.listing_type IN ('resource', 'ship')
    AND ml.created_at >= date_trunc('week', now());

  v_total_fxu_value := v_db_fxu_value_sold + v_active_fxu_value;
  v_fxu_remaining := GREATEST(0, v_fxu_limit - v_total_fxu_value);

  -- Week reset time
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
    -- has_credit: true when user has FXU credit (even if exhausted this week)
    'has_credit', (v_fxu_limit > 0),
    -- fxu_exhausted: true when FXU credit exists but is fully used this week
    'fxu_exhausted', (v_fxu_limit > 0 AND v_fxu_remaining <= 0),
    -- Resource limit (points-based) - ALWAYS returned
    'monthly_limit', v_resource_limit,
    'metal_sold', v_metal_sold + v_active_metal,
    'crystal_sold', v_crystal_sold + v_active_crystal,
    'deuterium_sold', v_deuterium_sold + v_active_deuterium,
    'metal_remaining', GREATEST(0, v_resource_limit - v_metal_sold - v_active_metal),
    'crystal_remaining', GREATEST(0, v_resource_limit - v_crystal_sold - v_active_crystal),
    'deuterium_remaining', GREATEST(0, v_resource_limit - v_deuterium_sold - v_active_deuterium),
    -- Ship limit (resource value)
    'ships_value_sold', v_db_ships_value_sold + v_active_ships_value,
    'ships_value_remaining', GREATEST(0, v_resource_limit - v_db_ships_value_sold - v_active_ships_value),
    -- FXU limit
    'fxu_limit', ROUND(v_fxu_limit, 2),
    'fxu_value_sold', ROUND(v_total_fxu_value, 2),
    'fxu_value_remaining', ROUND(v_fxu_remaining, 2),
    -- Week reset
    'week_resets_at', v_week_end
  );
END;
$function$;


-- 3. Minimum threshold: credit < 1 FXU → treat as 0 (auto-switch to ranking mode)
--    Prevents users getting stuck with 0.001 FXU credit that blocks everything.
CREATE OR REPLACE FUNCTION public.calculate_fxu_weekly_limit(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fxu_credit numeric;
BEGIN
  -- Only investment recovery credit, points are separate
  v_fxu_credit := calculate_running_fxu_credit(p_user_id);

  -- Threshold: less than 1 FXU credit is effectively zero
  -- This prevents users from getting stuck with tiny residual credit
  -- that blocks sales while being too small to sell anything
  IF v_fxu_credit < 1 THEN
    RETURN 0;
  END IF;

  RETURN v_fxu_credit;
END;
$function$;
