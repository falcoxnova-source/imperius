-- ============================================================================
-- 20260715_market_open_no_telegram.sql
-- Mercado abierto: quitar el requisito de vincular/ser miembro de Telegram
-- para VENDER y COMPRAR en el mercado. El fee se sigue cobrando.
-- Vender NAVES sigue requiriendo VIP Plus. Vender/comprar RECURSOS es libre.
-- (Se conservan las variables v_telegram_id / v_is_member en el DECLARE por
--  compatibilidad, pero ya no se usan.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CREAR LISTADO (vender) — sin bloqueo de Telegram
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_market_listing(p_listing_type text, p_item_code text, p_quantity bigint, p_price_per_unit numeric, p_planet_id uuid DEFAULT NULL::uuid)
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
  v_fxu_limit numeric;
  v_fxu_value_this_listing numeric;
  v_fxu_value_sold numeric;
  v_fxu_value_active numeric;
  v_fxu_remaining numeric;
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

  -- Check if user has Telegram linked
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

  -- Check if user is currently a member of the Telegram group
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

  -- Only VIP Plus users can sell ships
  IF p_listing_type = 'ship' AND NOT is_user_plus(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo los usuarios con VIP activo pueden vender naves en el mercado. Sin VIP puedes vender recursos con normalidad.', 'requires_vip', true);
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

    -- Min price ALWAYS applies (even VIP)
    IF p_listing_type = 'resource' THEN
      IF p_item_code = 'metal' THEN v_min_price := v_limits.min_price_metal;
      ELSIF p_item_code = 'crystal' THEN v_min_price := v_limits.min_price_crystal;
      ELSIF p_item_code = 'deuterium' THEN v_min_price := v_limits.min_price_deuterium;
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
      -- VIP Plus users have no selling limits
      NULL;
    ELSE

    -- ========== CHECK 1: FXU CREDIT MODE ==========
    v_fxu_limit := calculate_fxu_weekly_limit(v_user_id);

    IF v_fxu_limit > 0 THEN
      v_fxu_value_this_listing := v_total_price;

      SELECT COALESCE(fxu_value_sold, 0) INTO v_fxu_value_sold
      FROM market_monthly_sales WHERE user_id = v_user_id AND year_month = v_year_week;
      v_fxu_value_sold := COALESCE(v_fxu_value_sold, 0);

      SELECT COALESCE(SUM(ml.quantity * ml.price_per_unit), 0) INTO v_fxu_value_active
      FROM market_listings ml
      WHERE ml.seller_id = v_user_id AND ml.status = 'active'
        AND ml.listing_type IN ('resource', 'ship')
        AND ml.created_at >= date_trunc('week', now());

      v_fxu_remaining := v_fxu_limit - v_fxu_value_sold - v_fxu_value_active;

      IF v_fxu_value_this_listing <= v_fxu_remaining THEN
        v_fxu_ok := true;
      END IF;
    END IF;

    -- ========== CHECK 2: UNIT LIMIT BY RANKING POINTS ==========
    IF p_listing_type = 'resource' THEN
      v_weekly_limit := calculate_monthly_market_limit(v_user_id);

      SELECT CASE p_item_code
        WHEN 'metal' THEN COALESCE(metal_sold, 0)
        WHEN 'crystal' THEN COALESCE(crystal_sold, 0)
        WHEN 'deuterium' THEN COALESCE(deuterium_sold, 0)
      END INTO v_current_sold
      FROM market_monthly_sales WHERE user_id = v_user_id AND year_month = v_year_week;
      v_current_sold := COALESCE(v_current_sold, 0);

      SELECT COALESCE(SUM(quantity), 0) INTO v_active_listed
      FROM market_listings
      WHERE seller_id = v_user_id AND listing_type = 'resource' AND item_code = p_item_code
        AND status = 'active' AND created_at >= date_trunc('week', now());

      v_remaining := v_weekly_limit - v_current_sold - v_active_listed;
      IF p_quantity <= v_remaining THEN v_unit_ok := true; END IF;
    END IF;

    IF p_listing_type = 'ship' THEN
      SELECT (COALESCE(metal_cost, 0) + COALESCE(crystal_cost, 0) + COALESCE(deuterium_cost, 0))::bigint
      INTO v_ship_value FROM ship_types WHERE code = p_item_code;
      v_ship_value := COALESCE(v_ship_value, 0);

      IF v_ship_value > 0 THEN
        v_ship_total_value := p_quantity * v_ship_value;
        v_weekly_limit := calculate_monthly_market_limit(v_user_id);

        SELECT COALESCE(ships_value_sold, 0) INTO v_current_ships_value_sold
        FROM market_monthly_sales WHERE user_id = v_user_id AND year_month = v_year_week;
        v_current_ships_value_sold := COALESCE(v_current_ships_value_sold, 0);

        SELECT COALESCE(SUM(ml.quantity * (COALESCE(st.metal_cost, 0) + COALESCE(st.crystal_cost, 0) + COALESCE(st.deuterium_cost, 0))), 0)
        INTO v_active_ships_value
        FROM market_listings ml JOIN ship_types st ON st.code = ml.item_code
        WHERE ml.seller_id = v_user_id AND ml.listing_type = 'ship' AND ml.status = 'active'
          AND ml.created_at >= date_trunc('week', now());

        v_ships_value_remaining := v_weekly_limit - v_current_ships_value_sold - v_active_ships_value;
        IF v_ship_total_value <= v_ships_value_remaining THEN v_unit_ok := true; END IF;
      ELSE
        v_unit_ok := true;
      END IF;
    END IF;

    -- ========== BLOCK ONLY IF BOTH MODES FAIL ==========
    IF NOT v_fxu_ok AND NOT v_unit_ok THEN
      IF v_fxu_limit > 0 AND v_weekly_limit > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Excede ambos limites semanales. Credito FXU restante: ' || ROUND(GREATEST(0, v_fxu_remaining), 2) || ' FXU. Limite de unidades restante: ' || GREATEST(0, COALESCE(v_remaining, v_ships_value_remaining)) || '.',
          'fxu_limit', v_fxu_limit, 'fxu_remaining', GREATEST(0, v_fxu_remaining),
          'unit_remaining', GREATEST(0, COALESCE(v_remaining, v_ships_value_remaining))
        );
      ELSIF v_fxu_limit > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Excede tu credito de inversion. Restante: ' || ROUND(GREATEST(0, v_fxu_remaining), 2) || ' FXU (credito total: ' || ROUND(v_fxu_limit, 2) || ' FXU)',
          'fxu_limit', v_fxu_limit, 'fxu_remaining', GREATEST(0, v_fxu_remaining)
        );
      ELSE
        IF p_listing_type = 'resource' THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Excede tu limite semanal de unidades de ' || p_item_code || '. Restante: ' || GREATEST(0, v_remaining) || ' unidades (limite: ' || v_weekly_limit || ')',
            'weekly_limit', v_weekly_limit, 'remaining', GREATEST(0, v_remaining)
          );
        ELSE
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Excede tu limite semanal de venta de naves. Valor restante: ' || GREATEST(0, v_ships_value_remaining) || ' (limite: ' || v_weekly_limit || ', valor por nave: ' || v_ship_value || ')',
            'weekly_limit', v_weekly_limit, 'remaining', GREATEST(0, v_ships_value_remaining), 'ship_value', v_ship_value
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
    FROM planet_ships ps JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = p_planet_id AND st.code = p_item_code FOR UPDATE;
    IF v_ship_quantity IS NULL OR v_ship_quantity < p_quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'Naves insuficientes');
    END IF;
  END IF;

  INSERT INTO market_listings (seller_id, listing_type, item_code, quantity, price_per_unit, total_price, planet_id, status)
  VALUES (v_user_id, p_listing_type, p_item_code, p_quantity, p_price_per_unit, v_total_price, p_planet_id, 'active')
  RETURNING id INTO v_listing_id;

  SELECT username INTO v_username FROM profiles WHERE id = v_user_id;

  PERFORM send_market_telegram_notification(
    v_listing_id, COALESCE(v_username, 'Jugador'),
    p_listing_type, p_item_code, p_quantity, p_price_per_unit, v_total_price
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

-- ---------------------------------------------------------------------------
-- COMPRAR LISTADO — sin bloqueo de Telegram
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL::integer, p_buyer_planet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND vacation_mode = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use the market while in vacation mode');
  END IF;

  SELECT telegram_id INTO v_telegram_id FROM telegram_links WHERE user_id = v_user_id;
  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes vincular tu cuenta de Telegram para usar el mercado.', 'requires_telegram', true);
  END IF;

  SELECT is_member INTO v_is_member FROM telegram_task_rewards WHERE user_id = v_user_id AND task_type = 'join_group';
  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes ser miembro del grupo de Telegram para usar el mercado.', 'requires_telegram', true);
  END IF;

  SELECT * INTO v_listing FROM market_listings WHERE id = p_listing_id AND status = 'active' FOR UPDATE;
  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or not active');
  END IF;

  IF v_listing.purchasable_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta aun no esta disponible para compra.', 'cooldown_remaining', EXTRACT(EPOCH FROM (v_listing.purchasable_at - now()))::integer);
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

  SELECT fxu_balance INTO v_buyer_fxu FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_buyer_fxu < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  -- Use provided planet_id if valid, otherwise fall back to main planet
  IF p_buyer_planet_id IS NOT NULL THEN
    SELECT id INTO v_buyer_planet_id FROM planets WHERE id = p_buyer_planet_id AND user_id = v_user_id;
  END IF;
  IF v_buyer_planet_id IS NULL THEN
    SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_user_id AND is_main_planet = true LIMIT 1;
  END IF;
  IF v_buyer_planet_id IS NULL AND v_listing.listing_type != 'dark_matter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No main planet found');
  END IF;

  v_market_fee_percent := get_market_fee_for_user(v_listing.seller_id);

  -- Verify seller still has resources/ships
  IF v_listing.listing_type = 'resource' THEN
    SELECT metal, crystal, deuterium INTO v_seller_resources FROM planet_resources WHERE planet_id = v_listing.planet_id FOR UPDATE;

    IF v_listing.item_code = 'metal' AND COALESCE(v_seller_resources.metal, 0) < v_purchase_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente metal (oferta cancelada)');
    ELSIF v_listing.item_code = 'crystal' AND COALESCE(v_seller_resources.crystal, 0) < v_purchase_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente cristal (oferta cancelada)');
    ELSIF v_listing.item_code = 'deuterium' AND COALESCE(v_seller_resources.deuterium, 0) < v_purchase_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente deuterio (oferta cancelada)');
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
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found (oferta cancelada)');
    END IF;

    SELECT quantity INTO v_seller_ship_qty FROM planet_ships WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id FOR UPDATE;
    IF v_seller_ship_qty IS NULL OR v_seller_ship_qty < v_purchase_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficientes naves (oferta cancelada)');
    END IF;

    UPDATE planet_ships SET quantity = quantity - v_purchase_qty WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id;

  ELSIF v_listing.listing_type = 'dark_matter' THEN
    NULL;
  END IF;

  -- Fee calculation: pool 50% / empresa 50% / referido 20% de la empresa
  v_fee := v_total_price * (v_market_fee_percent / 100);
  v_seller_amount := v_total_price - v_fee;
  v_jackpot_amount := floor(v_fee * 50 / 100);

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;
  IF v_referrer_id IS NOT NULL THEN
    v_referral_fee := floor((v_fee - v_jackpot_amount) * 20 / 100);
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
    PERFORM record_admin_revenue('market_fee', v_admin_fee, 'Venta: ' || v_purchase_qty || 'x ' || v_listing.item_code || ' (fee ' || v_market_fee_percent || '%, admin ' || round(v_admin_fee / v_fee * 100) || '%)', v_listing.seller_id, p_listing_id);
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_listing.seller_id);
  END IF;

  -- Deliver to buyer's selected planet (or main planet as fallback)
  IF v_listing.listing_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity) VALUES (v_buyer_planet_id, v_ship_type_id, v_purchase_qty)
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

  -- Track resource sales (units + FXU value)
  IF v_listing.listing_type = 'resource' THEN
    INSERT INTO market_monthly_sales (user_id, year_month, metal_sold, crystal_sold, deuterium_sold, fxu_value_sold)
    VALUES (
      v_listing.seller_id,
      v_year_week,
      CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END,
      v_total_price
    )
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      metal_sold = market_monthly_sales.metal_sold + CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      crystal_sold = market_monthly_sales.crystal_sold + CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      deuterium_sold = market_monthly_sales.deuterium_sold + CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END,
      fxu_value_sold = market_monthly_sales.fxu_value_sold + v_total_price,
      updated_at = now();
  END IF;

  -- Track ship sales (resource value + FXU value)
  IF v_listing.listing_type = 'ship' THEN
    SELECT (COALESCE(metal_cost, 0) + COALESCE(crystal_cost, 0) + COALESCE(deuterium_cost, 0))::bigint
    INTO v_ship_value FROM ship_types WHERE code = v_listing.item_code;
    v_ship_value := COALESCE(v_ship_value, 0);

    INSERT INTO market_monthly_sales (user_id, year_month, ships_value_sold, fxu_value_sold)
    VALUES (v_listing.seller_id, v_year_week, v_purchase_qty * v_ship_value, v_total_price)
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      ships_value_sold = market_monthly_sales.ships_value_sold + (v_purchase_qty * v_ship_value),
      fxu_value_sold = market_monthly_sales.fxu_value_sold + v_total_price,
      updated_at = now();
  END IF;

  -- Referral (20% de la parte de empresa)
  IF v_referrer_id IS NOT NULL AND v_referral_fee >= 1 THEN
    UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_fee WHERE id = v_referrer_id;
    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
    VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'market_referral', 'fxu', v_referral_fee, v_referral_fee);
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (v_referrer_id, v_listing.seller_id, 'Comision de referido por venta en mercado', 'Has recibido ' || ROUND(v_referral_fee, 2) || ' FXU como comision por la venta de tu referido en el mercado.', 'system');
  END IF;

  IF v_purchase_qty = v_listing.quantity THEN
    UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  ELSE
    UPDATE market_listings SET quantity = quantity - v_purchase_qty, total_price = (quantity - v_purchase_qty) * price_per_unit, updated_at = now() WHERE id = p_listing_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'quantity', v_purchase_qty, 'total_price', v_total_price, 'jackpot_contribution', v_jackpot_amount, 'fee_percent', v_market_fee_percent);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al procesar la compra: ' || SQLERRM);
END;
$function$;
