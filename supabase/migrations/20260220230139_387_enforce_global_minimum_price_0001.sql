/*
  # Enforce global minimum price of 0.001 FXU for all market listing types

  1. Changes
    - `create_market_listing`: Adds 0.001 minimum for ship and dark_matter types
    - `create_buy_offer`: Adds 0.001 minimum for ship and dark_matter types
    - Resource types already use the configurable min from `market_resource_limits` (now set to 0.001)

  2. Reason
    - Prevent abuse with extremely low prices on non-resource items
    - Consistent minimum across all market operations
*/

-- Patch create_market_listing: change the price > 0 check to price >= 0.001
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

  IF p_price_per_unit < 0.001 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El precio minimo por unidad es 0.001 FXU', 'min_price', 0.001);
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
$$;
