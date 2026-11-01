/*
  # Add weekly sell limits for ships in the P2P market

  Ships use the SAME weekly limit formula as resources (points + FXU×multiplier),
  but tracked INDEPENDENTLY via resource value (metal_cost + crystal_cost + deuterium_cost).

  Changes:
  1. ALTER market_monthly_sales: add ships_value_sold column
  2. Modify create_market_listing: add ship limit check based on resource value
  3. Modify purchase_market_listing: track ship sales in ships_value_sold
  4. Modify get_my_monthly_market_sales: return ship limit data
*/

-- 1. Add ships_value_sold column to market_monthly_sales
ALTER TABLE market_monthly_sales ADD COLUMN IF NOT EXISTS ships_value_sold bigint NOT NULL DEFAULT 0;

-- 2. Modify create_market_listing to enforce ship weekly limits
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
v_weekly_limit := calculate_monthly_market_limit(v_user_id);

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
v_weekly_limit := calculate_monthly_market_limit(v_user_id);
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
$$;


-- 3. Modify purchase_market_listing to track ship sales
CREATE OR REPLACE FUNCTION purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_listing RECORD;
  v_buyer_planet_id uuid;
  v_purchase_qty integer;
  v_total_price numeric;
  v_buyer_fxu numeric;
  v_admin_id uuid;
  v_fee numeric;
  v_jackpot_amount numeric;
  v_admin_fee numeric;
  v_referral_fee numeric;
  v_seller_amount numeric;
  v_ship_type_id integer;
  v_market_fee_percent numeric;
  v_referrer_id uuid;
  v_transaction_id uuid;
  v_seller_resources RECORD;
  v_seller_ship_qty integer;
  v_telegram_id bigint;
  v_is_member boolean;
  v_year_week text;
  v_ship_value bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Vacation mode check
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND vacation_mode = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use the market while in vacation mode');
  END IF;

  -- Telegram verification
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

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or not active');
  END IF;

  -- Cooldown check
  IF v_listing.purchasable_at > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Esta oferta aun no esta disponible para compra. Espera a que termine el periodo de preparacion.',
      'cooldown_remaining', EXTRACT(EPOCH FROM (v_listing.purchasable_at - now()))::integer
    );
  END IF;

  IF v_listing.seller_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot buy your own listing');
  END IF;

  v_purchase_qty := COALESCE(p_quantity, v_listing.quantity::integer);
  IF v_purchase_qty > v_listing.quantity OR v_purchase_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  v_total_price := v_listing.price_per_unit * v_purchase_qty;

  IF v_total_price > 1000000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total price exceeds maximum');
  END IF;

  SELECT fxu_balance INTO v_buyer_fxu
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_buyer_fxu < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_user_id AND is_main_planet = true LIMIT 1;
  IF v_buyer_planet_id IS NULL AND v_listing.listing_type != 'dark_matter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No main planet found');
  END IF;

  -- === DYNAMIC FEE: based on seller's rank + Plus status ===
  v_market_fee_percent := get_market_fee_for_user(v_listing.seller_id);

  -- Verify seller still has resources/ships
  IF v_listing.listing_type = 'resource' THEN
    SELECT metal, crystal, deuterium INTO v_seller_resources
    FROM planet_resources
    WHERE planet_id = v_listing.planet_id
    FOR UPDATE;

    IF v_listing.item_code = 'metal' AND v_seller_resources.metal < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente metal (posiblemente fue atacado)');
    ELSIF v_listing.item_code = 'crystal' AND v_seller_resources.crystal < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente cristal (posiblemente fue atacado)');
    ELSIF v_listing.item_code = 'deuterium' AND v_seller_resources.deuterium < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente deuterio (posiblemente fue atacado)');
    END IF;

    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    END IF;

  ELSIF v_listing.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
    END IF;

    SELECT quantity INTO v_seller_ship_qty
    FROM planet_ships
    WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id
    FOR UPDATE;

    IF v_seller_ship_qty IS NULL OR v_seller_ship_qty < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficientes naves (posiblemente fueron destruidas en combate)');
    END IF;

    UPDATE planet_ships
    SET quantity = quantity - v_purchase_qty
    WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id;

  ELSIF v_listing.listing_type = 'dark_matter' THEN
    NULL;
  END IF;

  -- Fee calculation (using dynamic percent)
  v_fee := v_total_price * (v_market_fee_percent / 100);
  v_seller_amount := v_total_price - v_fee;

  v_jackpot_amount := floor(v_fee * 50 / 100);

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;

  IF v_referrer_id IS NOT NULL THEN
    v_referral_fee := floor(v_fee * 20 / 100);
    v_admin_fee := v_fee - v_jackpot_amount - v_referral_fee;
  ELSE
    v_referral_fee := 0;
    v_admin_fee := v_fee - v_jackpot_amount;
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;

    PERFORM record_admin_revenue(
      'market_fee',
      v_admin_fee,
      'Venta: ' || v_purchase_qty || 'x ' || v_listing.item_code || ' (fee ' || v_market_fee_percent || '%, admin ' || round(v_admin_fee / v_fee * 100) || '%)',
      v_listing.seller_id,
      p_listing_id
    );
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_listing.seller_id);
  END IF;

  IF v_listing.listing_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_buyer_planet_id, v_ship_type_id, v_purchase_qty)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_purchase_qty;

  ELSIF v_listing.listing_type = 'resource' THEN
    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    END IF;

  ELSIF v_listing.listing_type = 'dark_matter' THEN
    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_purchase_qty WHERE id = v_user_id;
  END IF;

  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_user_id, v_listing.seller_id, v_listing.listing_type, v_listing.item_code, v_purchase_qty, v_total_price)
  RETURNING id INTO v_transaction_id;

  v_year_week := to_char(now(), 'IYYY-"W"IW');

  IF v_listing.listing_type = 'resource' THEN
    INSERT INTO market_monthly_sales (user_id, year_month, metal_sold, crystal_sold, deuterium_sold)
    VALUES (
      v_listing.seller_id,
      v_year_week,
      CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END
    )
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      metal_sold = market_monthly_sales.metal_sold + CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      crystal_sold = market_monthly_sales.crystal_sold + CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      deuterium_sold = market_monthly_sales.deuterium_sold + CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END,
      updated_at = now();
  END IF;

  -- Track ship sales by resource value
  IF v_listing.listing_type = 'ship' THEN
    SELECT (COALESCE(metal_cost, 0) + COALESCE(crystal_cost, 0) + COALESCE(deuterium_cost, 0))::bigint
    INTO v_ship_value
    FROM ship_types WHERE code = v_listing.item_code;

    v_ship_value := COALESCE(v_ship_value, 0);

    IF v_ship_value > 0 THEN
      INSERT INTO market_monthly_sales (user_id, year_month, ships_value_sold)
      VALUES (
        v_listing.seller_id,
        v_year_week,
        v_purchase_qty * v_ship_value
      )
      ON CONFLICT (user_id, year_month)
      DO UPDATE SET
        ships_value_sold = market_monthly_sales.ships_value_sold + (v_purchase_qty * v_ship_value),
        updated_at = now();
    END IF;
  END IF;

  IF v_referrer_id IS NOT NULL AND v_referral_fee >= 1 THEN
    UPDATE profiles
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_fee
    WHERE id = v_referrer_id;

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
    VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'market_referral', 'fxu', v_referral_fee, v_referral_fee);

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_referrer_id,
      v_listing.seller_id,
      'Comision de referido por venta en mercado',
      'Has recibido ' || ROUND(v_referral_fee, 2) || ' FXU como comision por la venta de tu referido en el mercado.',
      'system'
    );
  END IF;

  IF v_purchase_qty = v_listing.quantity THEN
    UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  ELSE
    UPDATE market_listings SET quantity = quantity - v_purchase_qty, total_price = (quantity - v_purchase_qty) * price_per_unit, updated_at = now() WHERE id = p_listing_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'quantity', v_purchase_qty,
    'total_price', v_total_price,
    'jackpot_contribution', v_jackpot_amount,
    'fee_percent', v_market_fee_percent
  );
END;
$$;


-- 4. Modify get_my_monthly_market_sales to return ship limit data
CREATE OR REPLACE FUNCTION get_my_monthly_market_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
v_multiplier numeric;
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

SELECT COALESCE(value::numeric, 10) INTO v_multiplier
FROM game_settings WHERE key = 'monthly_limit_fxu_multiplier';
v_multiplier := COALESCE(v_multiplier, 10);

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
'fxu_multiplier', v_multiplier,
'fxu_bonus', FLOOR(v_fxu_spent * v_multiplier),
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
$$;
