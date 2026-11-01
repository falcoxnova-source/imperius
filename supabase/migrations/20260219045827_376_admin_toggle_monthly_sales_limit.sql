/*
  # Admin Toggle for Monthly Sales Limit

  ## Summary
  Adds an on/off toggle for the monthly sales limit system. When disabled,
  players can sell unlimited resources per month. When enabled, the existing
  per-resource monthly limits apply.

  ## Changes
  1. Modified Tables
    - `market_resource_limits`: Added `monthly_limit_enabled` boolean column (default true)

  2. Modified Functions
    - `get_market_resource_limits()`: Returns the new `monthly_limit_enabled` field
    - `admin_update_market_resource_limits()`: Accepts new `p_monthly_limit_enabled` parameter
    - `create_market_listing()`: Skips monthly limit check when disabled
    - `get_my_monthly_market_sales()`: Returns `monthly_limit_enabled` flag so frontend can hide/show

  ## Important Notes
  - Defaults to enabled (true) so existing behavior is preserved
  - When disabled, minimum price rules still apply
  - When re-enabled, existing monthly sales data is still tracked accurately
*/

-- Step 1: Add the column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_resource_limits' AND column_name = 'monthly_limit_enabled'
  ) THEN
    ALTER TABLE market_resource_limits ADD COLUMN monthly_limit_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Step 2: Update get_market_resource_limits to return the new field
CREATE OR REPLACE FUNCTION get_market_resource_limits()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits RECORD;
BEGIN
  SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'min_price_metal', v_limits.min_price_metal,
    'min_price_crystal', v_limits.min_price_crystal,
    'min_price_deuterium', v_limits.min_price_deuterium,
    'monthly_limit_metal', v_limits.monthly_limit_metal,
    'monthly_limit_crystal', v_limits.monthly_limit_crystal,
    'monthly_limit_deuterium', v_limits.monthly_limit_deuterium,
    'monthly_limit_enabled', v_limits.monthly_limit_enabled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_market_resource_limits() TO authenticated;

-- Step 3: Update admin function to accept the toggle
CREATE OR REPLACE FUNCTION admin_update_market_resource_limits(
  p_min_price_metal numeric DEFAULT NULL,
  p_min_price_crystal numeric DEFAULT NULL,
  p_min_price_deuterium numeric DEFAULT NULL,
  p_monthly_limit_metal bigint DEFAULT NULL,
  p_monthly_limit_crystal bigint DEFAULT NULL,
  p_monthly_limit_deuterium bigint DEFAULT NULL,
  p_monthly_limit_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  UPDATE market_resource_limits
  SET
    min_price_metal = COALESCE(p_min_price_metal, min_price_metal),
    min_price_crystal = COALESCE(p_min_price_crystal, min_price_crystal),
    min_price_deuterium = COALESCE(p_min_price_deuterium, min_price_deuterium),
    monthly_limit_metal = COALESCE(p_monthly_limit_metal, monthly_limit_metal),
    monthly_limit_crystal = COALESCE(p_monthly_limit_crystal, monthly_limit_crystal),
    monthly_limit_deuterium = COALESCE(p_monthly_limit_deuterium, monthly_limit_deuterium),
    monthly_limit_enabled = COALESCE(p_monthly_limit_enabled, monthly_limit_enabled),
    updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_market_resource_limits(numeric, numeric, numeric, bigint, bigint, bigint, boolean) TO authenticated;

-- Step 4: Update create_market_listing - skip monthly limit check when disabled
CREATE OR REPLACE FUNCTION create_market_listing(
  p_listing_type text,
  p_item_code text,
  p_quantity bigint,
  p_price_per_unit numeric,
  p_planet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_year_month text;
  v_current_sold bigint;
  v_active_listed bigint;
  v_monthly_limit bigint;
  v_min_price numeric;
  v_remaining bigint;
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
      v_monthly_limit := v_limits.monthly_limit_metal;
    ELSIF p_item_code = 'crystal' THEN
      v_min_price := v_limits.min_price_crystal;
      v_monthly_limit := v_limits.monthly_limit_crystal;
    ELSIF p_item_code = 'deuterium' THEN
      v_min_price := v_limits.min_price_deuterium;
      v_monthly_limit := v_limits.monthly_limit_deuterium;
    END IF;

    IF p_price_per_unit < v_min_price THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Precio minimo por unidad de ' || p_item_code || ' es ' || v_min_price || ' FXU',
        'min_price', v_min_price
      );
    END IF;

    -- Only check monthly limit if enabled
    IF v_limits.monthly_limit_enabled THEN
      v_year_month := to_char(now(), 'YYYY-MM');

      SELECT
        CASE p_item_code
          WHEN 'metal' THEN COALESCE(metal_sold, 0)
          WHEN 'crystal' THEN COALESCE(crystal_sold, 0)
          WHEN 'deuterium' THEN COALESCE(deuterium_sold, 0)
        END INTO v_current_sold
      FROM market_monthly_sales
      WHERE user_id = v_user_id AND year_month = v_year_month;

      v_current_sold := COALESCE(v_current_sold, 0);

      SELECT COALESCE(SUM(quantity), 0) INTO v_active_listed
      FROM market_listings
      WHERE seller_id = v_user_id
      AND listing_type = 'resource'
      AND item_code = p_item_code
      AND status = 'active'
      AND created_at >= date_trunc('month', now());

      v_remaining := v_monthly_limit - v_current_sold - v_active_listed;

      IF p_quantity > v_remaining THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Excede tu limite mensual de venta de ' || p_item_code || '. Restante: ' || GREATEST(0, v_remaining) || ' unidades',
          'monthly_limit', v_monthly_limit,
          'current_sold', v_current_sold,
          'active_listed', v_active_listed,
          'remaining', GREATEST(0, v_remaining)
        );
      END IF;
    END IF;
  END IF;

  v_total_price := p_quantity * p_price_per_unit;

  IF p_listing_type = 'resource' THEN
    IF p_item_code NOT IN ('metal', 'crystal', 'deuterium') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Recurso invalido');
    END IF;

    IF p_item_code = 'metal' THEN
      SELECT metal INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Metal insuficiente');
      END IF;
    ELSIF p_item_code = 'crystal' THEN
      SELECT crystal INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cristal insuficiente');
      END IF;
    ELSIF p_item_code = 'deuterium' THEN
      SELECT deuterium INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente');
      END IF;
    END IF;

  ELSIF p_listing_type = 'dark_matter' THEN
    SELECT dark_matter INTO v_user_dm FROM profiles WHERE id = v_user_id;
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
    WHERE ps.planet_id = p_planet_id AND st.code = p_item_code;

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
$$;

GRANT EXECUTE ON FUNCTION create_market_listing(text, text, bigint, numeric, uuid) TO authenticated;

-- Step 5: Update get_my_monthly_market_sales to return the enabled flag
CREATE OR REPLACE FUNCTION get_my_monthly_market_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_year_month text;
  v_sales RECORD;
  v_limits RECORD;
  v_active_metal bigint;
  v_active_crystal bigint;
  v_active_deuterium bigint;
  v_total_metal bigint;
  v_total_crystal bigint;
  v_total_deuterium bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  v_year_month := to_char(now(), 'YYYY-MM');

  SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;

  -- If monthly limit is disabled, return minimal info
  IF NOT v_limits.monthly_limit_enabled THEN
    RETURN jsonb_build_object(
      'success', true,
      'monthly_limit_enabled', false
    );
  END IF;

  SELECT
    COALESCE(metal_sold, 0) AS metal_sold,
    COALESCE(crystal_sold, 0) AS crystal_sold,
    COALESCE(deuterium_sold, 0) AS deuterium_sold
  INTO v_sales
  FROM market_monthly_sales
  WHERE user_id = v_user_id AND year_month = v_year_month;

  IF v_sales IS NULL THEN
    v_sales := ROW(0::bigint, 0::bigint, 0::bigint);
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN item_code = 'metal' THEN quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_code = 'crystal' THEN quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_code = 'deuterium' THEN quantity ELSE 0 END), 0)
  INTO v_active_metal, v_active_crystal, v_active_deuterium
  FROM market_listings
  WHERE seller_id = v_user_id
  AND listing_type = 'resource'
  AND status = 'active'
  AND created_at >= date_trunc('month', now());

  v_total_metal := v_sales.metal_sold + v_active_metal;
  v_total_crystal := v_sales.crystal_sold + v_active_crystal;
  v_total_deuterium := v_sales.deuterium_sold + v_active_deuterium;

  RETURN jsonb_build_object(
    'success', true,
    'monthly_limit_enabled', true,
    'year_month', v_year_month,
    'metal_sold', v_total_metal,
    'crystal_sold', v_total_crystal,
    'deuterium_sold', v_total_deuterium,
    'metal_completed', v_sales.metal_sold,
    'crystal_completed', v_sales.crystal_sold,
    'deuterium_completed', v_sales.deuterium_sold,
    'metal_active', v_active_metal,
    'crystal_active', v_active_crystal,
    'deuterium_active', v_active_deuterium,
    'metal_limit', v_limits.monthly_limit_metal,
    'crystal_limit', v_limits.monthly_limit_crystal,
    'deuterium_limit', v_limits.monthly_limit_deuterium,
    'metal_remaining', GREATEST(0, v_limits.monthly_limit_metal - v_total_metal),
    'crystal_remaining', GREATEST(0, v_limits.monthly_limit_crystal - v_total_crystal),
    'deuterium_remaining', GREATEST(0, v_limits.monthly_limit_deuterium - v_total_deuterium)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_monthly_market_sales() TO authenticated;
