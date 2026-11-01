/*
  # Market Resource Limits: Minimum Prices and Monthly Sales Caps

  ## Summary
  Implements minimum sell prices per resource and monthly sales limits per user.
  Also cancels all currently active resource listings so users must re-list
  under the new rules.

  ## Changes
  1. New Tables
    - `market_resource_limits` (singleton config)
      - `min_price_metal` (numeric) - Minimum FXU price per unit of metal
      - `min_price_crystal` (numeric) - Minimum FXU price per unit of crystal
      - `min_price_deuterium` (numeric) - Minimum FXU price per unit of deuterium
      - `monthly_limit_metal` (bigint) - Max metal units sellable per month per user
      - `monthly_limit_crystal` (bigint) - Max crystal units sellable per month per user
      - `monthly_limit_deuterium` (bigint) - Max deuterium units sellable per month per user
    - `market_monthly_sales` - Tracks how much each user has sold this month
      - `user_id` (uuid)
      - `year_month` (text) - Format 'YYYY-MM'
      - `metal_sold` (bigint)
      - `crystal_sold` (bigint)
      - `deuterium_sold` (bigint)

  2. Functions
    - `get_market_resource_limits()` - Public function to read limits config
    - `admin_update_market_resource_limits(...)` - Admin-only function to update limits
    - `get_my_monthly_market_sales()` - Returns current user's sales for this month
    - Updated `create_market_listing` to enforce min prices and monthly limits

  3. Data Changes
    - All currently active resource listings are cancelled (resources stay on planet)

  4. Security
    - RLS enabled on both new tables
    - `market_resource_limits` readable by all authenticated, writable only by admin
    - `market_monthly_sales` readable only by the owning user, no direct insert/update
*/

-- 1. Create market_resource_limits config table
CREATE TABLE IF NOT EXISTS market_resource_limits (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_price_metal numeric NOT NULL DEFAULT 0.03,
  min_price_crystal numeric NOT NULL DEFAULT 0.06,
  min_price_deuterium numeric NOT NULL DEFAULT 0.10,
  monthly_limit_metal bigint NOT NULL DEFAULT 1000000,
  monthly_limit_crystal bigint NOT NULL DEFAULT 1000000,
  monthly_limit_deuterium bigint NOT NULL DEFAULT 1000000,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE market_resource_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read market resource limits"
  ON market_resource_limits
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update market resource limits"
  ON market_resource_limits
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

INSERT INTO market_resource_limits (
  min_price_metal, min_price_crystal, min_price_deuterium,
  monthly_limit_metal, monthly_limit_crystal, monthly_limit_deuterium
) VALUES (0.03, 0.06, 0.10, 1000000, 1000000, 1000000)
ON CONFLICT (id) DO NOTHING;

-- 2. Create monthly sales tracking table
CREATE TABLE IF NOT EXISTS market_monthly_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  metal_sold bigint NOT NULL DEFAULT 0,
  crystal_sold bigint NOT NULL DEFAULT 0,
  deuterium_sold bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year_month)
);

ALTER TABLE market_monthly_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own monthly sales"
  ON market_monthly_sales
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Cancel all currently active resource listings
UPDATE market_listings
SET status = 'cancelled', updated_at = now()
WHERE status = 'active' AND listing_type = 'resource';

-- 4. Public function to get market resource limits
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
    'monthly_limit_deuterium', v_limits.monthly_limit_deuterium
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_market_resource_limits() TO authenticated;

-- 5. Admin function to update market resource limits
CREATE OR REPLACE FUNCTION admin_update_market_resource_limits(
  p_min_price_metal numeric DEFAULT NULL,
  p_min_price_crystal numeric DEFAULT NULL,
  p_min_price_deuterium numeric DEFAULT NULL,
  p_monthly_limit_metal bigint DEFAULT NULL,
  p_monthly_limit_crystal bigint DEFAULT NULL,
  p_monthly_limit_deuterium bigint DEFAULT NULL
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
    updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_market_resource_limits(numeric, numeric, numeric, bigint, bigint, bigint) TO authenticated;

-- 6. Function for users to get their monthly sales
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  v_year_month := to_char(now(), 'YYYY-MM');

  SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;

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

  RETURN jsonb_build_object(
    'success', true,
    'year_month', v_year_month,
    'metal_sold', v_sales.metal_sold,
    'crystal_sold', v_sales.crystal_sold,
    'deuterium_sold', v_sales.deuterium_sold,
    'metal_limit', v_limits.monthly_limit_metal,
    'crystal_limit', v_limits.monthly_limit_crystal,
    'deuterium_limit', v_limits.monthly_limit_deuterium,
    'metal_remaining', GREATEST(0, v_limits.monthly_limit_metal - v_sales.metal_sold),
    'crystal_remaining', GREATEST(0, v_limits.monthly_limit_crystal - v_sales.crystal_sold),
    'deuterium_remaining', GREATEST(0, v_limits.monthly_limit_deuterium - v_sales.deuterium_sold)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_monthly_market_sales() TO authenticated;

-- 7. Updated create_market_listing with min price and monthly limit validation
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

  -- Validate min price and monthly limits for resources
  IF p_listing_type = 'resource' THEN
    SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;
    v_year_month := to_char(now(), 'YYYY-MM');

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

    SELECT
      CASE p_item_code
        WHEN 'metal' THEN COALESCE(metal_sold, 0)
        WHEN 'crystal' THEN COALESCE(crystal_sold, 0)
        WHEN 'deuterium' THEN COALESCE(deuterium_sold, 0)
      END INTO v_current_sold
    FROM market_monthly_sales
    WHERE user_id = v_user_id AND year_month = v_year_month;

    v_current_sold := COALESCE(v_current_sold, 0);
    v_remaining := v_monthly_limit - v_current_sold;

    IF p_quantity > v_remaining THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Excede tu limite mensual de venta de ' || p_item_code || '. Restante: ' || v_remaining || ' unidades',
        'monthly_limit', v_monthly_limit,
        'current_sold', v_current_sold,
        'remaining', v_remaining
      );
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

  -- Track monthly sales for resources
  IF p_listing_type = 'resource' THEN
    INSERT INTO market_monthly_sales (user_id, year_month, metal_sold, crystal_sold, deuterium_sold)
    VALUES (
      v_user_id,
      v_year_month,
      CASE WHEN p_item_code = 'metal' THEN p_quantity ELSE 0 END,
      CASE WHEN p_item_code = 'crystal' THEN p_quantity ELSE 0 END,
      CASE WHEN p_item_code = 'deuterium' THEN p_quantity ELSE 0 END
    )
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      metal_sold = market_monthly_sales.metal_sold + CASE WHEN p_item_code = 'metal' THEN p_quantity ELSE 0 END,
      crystal_sold = market_monthly_sales.crystal_sold + CASE WHEN p_item_code = 'crystal' THEN p_quantity ELSE 0 END,
      deuterium_sold = market_monthly_sales.deuterium_sold + CASE WHEN p_item_code = 'deuterium' THEN p_quantity ELSE 0 END,
      updated_at = now();
  END IF;

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
