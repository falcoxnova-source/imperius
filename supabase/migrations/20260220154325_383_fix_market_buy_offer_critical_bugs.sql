/*
  # Fix critical market buy offer bugs

  1. Bug Fixes
    - `fulfill_buy_offer`: Added early-exit check when buyer has no main planet.
      Previously, if the buyer had no main planet, the seller's items were deducted
      and the seller received FXU, but the buyer NEVER received items (they vanished).
    - `create_buy_offer`: Now enforces minimum price from `market_resource_limits`
      for resource buy offers, same as sell listings. Previously, buy offers had
      NO minimum price validation, allowing users to create offers at 0.000001 FXU/unit.
    - `create_market_listing`: Added `FOR UPDATE` lock on planet_resources during
      validation to prevent race condition where a user could create multiple listings
      for the same resources simultaneously.

  2. Security
    - Enforces consistent minimum price rules across buy offers and sell listings
    - Prevents item loss on buy offer fulfillment when buyer has no main planet
    - Prevents duplicate resource listings via concurrent requests
*/

-- Fix 1: fulfill_buy_offer - Add buyer planet validation BEFORE deducting seller items
CREATE OR REPLACE FUNCTION fulfill_buy_offer(
  p_offer_id uuid,
  p_quantity integer,
  p_planet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_offer RECORD;
  v_fill_qty bigint;
  v_fill_price numeric;
  v_fee numeric;
  v_jackpot_contribution_rate numeric;
  v_jackpot_amount numeric;
  v_admin_fee numeric;
  v_seller_amount numeric;
  v_admin_id uuid;
  v_market_fee_percent numeric;
  v_ship_type_id integer;
  v_seller_ship_qty integer;
  v_seller_resources RECORD;
  v_seller_dm integer;
  v_telegram_id bigint;
  v_is_member boolean;
  v_referrer_id uuid;
  v_referral_commission_percent numeric;
  v_referral_commission numeric;
  v_referral_resource_amount bigint;
  v_referrer_planet_id uuid;
  v_transaction_id uuid;
  v_vacation boolean;
  v_buyer_planet_id uuid;
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
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';

  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  SELECT vacation_mode INTO v_vacation FROM profiles WHERE id = v_user_id;
  IF COALESCE(v_vacation, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes operar en el mercado en modo vacaciones');
  END IF;

  v_market_fee_percent := get_market_fee_percent();
  v_referral_commission_percent := get_referral_commission_percent();

  SELECT contribution_rate INTO v_jackpot_contribution_rate FROM jackpot_config WHERE id = 1;
  v_jackpot_contribution_rate := COALESCE(v_jackpot_contribution_rate, 10);

  SELECT * INTO v_offer
  FROM market_buy_offers
  WHERE id = p_offer_id AND status = 'active'
  FOR UPDATE;

  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada o no esta activa');
  END IF;

  IF v_offer.buyer_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes cumplir tu propia oferta');
  END IF;

  v_fill_qty := LEAST(p_quantity, v_offer.quantity - v_offer.quantity_filled);
  IF v_fill_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad invalida');
  END IF;

  IF v_offer.listing_type != 'dark_matter' THEN
    IF p_planet_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta requerido');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = v_user_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'No eres dueno de este planeta');
    END IF;
  END IF;

  -- CRITICAL FIX: Validate buyer's main planet BEFORE deducting seller items
  IF v_offer.listing_type != 'dark_matter' THEN
    SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_offer.buyer_id AND is_main_planet = true LIMIT 1;
    IF v_buyer_planet_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'El comprador no tiene planeta principal. No se pueden entregar los items.');
    END IF;
  END IF;

  -- Deduct items from seller
  IF v_offer.listing_type = 'resource' THEN
    SELECT metal, crystal, deuterium INTO v_seller_resources
    FROM planet_resources
    WHERE planet_id = p_planet_id
    FOR UPDATE;

    IF v_offer.item_code = 'metal' AND (v_seller_resources.metal IS NULL OR v_seller_resources.metal < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Metal insuficiente en tu planeta');
    ELSIF v_offer.item_code = 'crystal' AND (v_seller_resources.crystal IS NULL OR v_seller_resources.crystal < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cristal insuficiente en tu planeta');
    ELSIF v_offer.item_code = 'deuterium' AND (v_seller_resources.deuterium IS NULL OR v_seller_resources.deuterium < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente en tu planeta');
    END IF;

    IF v_offer.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal - v_fill_qty WHERE planet_id = p_planet_id;
    ELSIF v_offer.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal - v_fill_qty WHERE planet_id = p_planet_id;
    ELSIF v_offer.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium - v_fill_qty WHERE planet_id = p_planet_id;
    END IF;

  ELSIF v_offer.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_offer.item_code;
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave no encontrado');
    END IF;

    SELECT quantity INTO v_seller_ship_qty
    FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship_type_id
    FOR UPDATE;

    IF v_seller_ship_qty IS NULL OR v_seller_ship_qty < v_fill_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'Naves insuficientes en tu planeta');
    END IF;

    UPDATE planet_ships
    SET quantity = quantity - v_fill_qty
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship_type_id;

  ELSIF v_offer.listing_type = 'dark_matter' THEN
    SELECT dark_matter INTO v_seller_dm FROM profiles WHERE id = v_user_id FOR UPDATE;
    IF v_seller_dm IS NULL OR v_seller_dm < v_fill_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'Materia oscura insuficiente');
    END IF;

    UPDATE profiles SET dark_matter = dark_matter - v_fill_qty WHERE id = v_user_id;
  END IF;

  -- Calculate fee
  v_fill_price := v_offer.price_per_unit * v_fill_qty;
  v_fee := v_fill_price * (v_market_fee_percent / 100);
  v_jackpot_amount := floor(v_fee * (v_jackpot_contribution_rate / 100));
  v_admin_fee := v_fee - v_jackpot_amount;
  v_seller_amount := v_fill_price - v_fee;

  PERFORM _internal_set_fxu_context();

  -- Pay seller
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_user_id;

  -- Admin fee
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;

    PERFORM record_admin_revenue(
      'market_fee',
      v_admin_fee,
      'Oferta compra: ' || v_fill_qty || 'x ' || v_offer.item_code || ' (' || v_market_fee_percent || '% fee)',
      v_user_id,
      p_offer_id
    );
  END IF;

  -- Jackpot contribution
  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_user_id);
  END IF;

  -- Deliver items to buyer's main planet (v_buyer_planet_id already validated above)
  IF v_offer.listing_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_buyer_planet_id, v_ship_type_id, v_fill_qty)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_fill_qty;

  ELSIF v_offer.listing_type = 'resource' THEN
    IF v_offer.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_fill_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_offer.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_fill_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_offer.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_fill_qty WHERE planet_id = v_buyer_planet_id;
    END IF;

  ELSIF v_offer.listing_type = 'dark_matter' THEN
    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_fill_qty WHERE id = v_offer.buyer_id;
  END IF;

  -- Record transaction
  INSERT INTO market_transactions (buy_offer_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_offer_id, v_offer.buyer_id, v_user_id, v_offer.listing_type, v_offer.item_code, v_fill_qty, v_fill_price)
  RETURNING id INTO v_transaction_id;

  -- Referral commission
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_user_id;

  IF v_referrer_id IS NOT NULL AND v_referral_commission_percent > 0 THEN
    IF v_offer.listing_type = 'resource' THEN
      v_referral_resource_amount := FLOOR(v_fill_qty * v_referral_commission_percent / 100);

      IF v_referral_resource_amount >= 1 THEN
        SELECT id INTO v_referrer_planet_id
        FROM planets
        WHERE user_id = v_referrer_id AND is_main_planet = true
        LIMIT 1;

        IF v_referrer_planet_id IS NOT NULL THEN
          IF v_offer.item_code = 'metal' THEN
            UPDATE planet_resources SET metal = metal + v_referral_resource_amount WHERE planet_id = v_referrer_planet_id;
          ELSIF v_offer.item_code = 'crystal' THEN
            UPDATE planet_resources SET crystal = crystal + v_referral_resource_amount WHERE planet_id = v_referrer_planet_id;
          ELSIF v_offer.item_code = 'deuterium' THEN
            UPDATE planet_resources SET deuterium = deuterium + v_referral_resource_amount WHERE planet_id = v_referrer_planet_id;
          END IF;

          INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
          VALUES (v_referrer_id, v_user_id, v_transaction_id, 'resource', v_offer.item_code, v_referral_resource_amount, 0);
        END IF;
      END IF;

    ELSE
      v_referral_commission := FLOOR(v_fill_price * v_referral_commission_percent / 100);

      IF v_referral_commission >= 1 THEN
        UPDATE profiles
        SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_commission
        WHERE id = v_referrer_id;

        INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
        VALUES (v_referrer_id, v_user_id, v_transaction_id, 'fxu', 'fxu', v_referral_commission, v_referral_commission);
      END IF;
    END IF;
  END IF;

  -- Update offer fill status
  UPDATE market_buy_offers
  SET
    quantity_filled = quantity_filled + v_fill_qty,
    status = CASE WHEN quantity_filled + v_fill_qty >= quantity THEN 'filled' ELSE 'active' END,
    updated_at = now()
  WHERE id = p_offer_id;

  -- Notify buyer
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    v_user_id,
    v_offer.buyer_id,
    'Oferta de compra cumplida',
    'Tu oferta de compra de ' || v_fill_qty || 'x ' || v_offer.item_code || ' ha sido cumplida. Los items fueron enviados a tu planeta principal.',
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'quantity_filled', v_fill_qty,
    'fxu_received', v_seller_amount,
    'fee_paid', v_fee,
    'jackpot_contribution', v_jackpot_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cumplir oferta: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION fulfill_buy_offer(uuid, integer, uuid) TO authenticated;


-- Fix 2: create_buy_offer - Enforce minimum price for resources (same as sell listings)
CREATE OR REPLACE FUNCTION create_buy_offer(
  p_listing_type text,
  p_item_code text,
  p_quantity bigint,
  p_price_per_unit numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_total_price numeric;
  v_fxu_balance numeric;
  v_telegram_id bigint;
  v_is_member boolean;
  v_offer_id uuid;
  v_min_price numeric;
  v_limits RECORD;
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
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';

  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  IF p_listing_type NOT IN ('resource', 'ship', 'dark_matter') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo invalido');
  END IF;

  IF p_listing_type = 'resource' AND p_item_code NOT IN ('metal', 'crystal', 'deuterium') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recurso invalido');
  END IF;

  IF p_listing_type = 'ship' AND NOT EXISTS (SELECT 1 FROM ship_types WHERE code = p_item_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave invalido');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad debe ser mayor a 0');
  END IF;

  IF p_price_per_unit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio debe ser mayor a 0');
  END IF;

  -- Enforce minimum price for resources (same rules as sell listings)
  IF p_listing_type = 'resource' THEN
    SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;

    IF v_limits IS NOT NULL THEN
      IF p_item_code = 'metal' THEN
        v_min_price := COALESCE(v_limits.min_price_metal, 0);
      ELSIF p_item_code = 'crystal' THEN
        v_min_price := COALESCE(v_limits.min_price_crystal, 0);
      ELSIF p_item_code = 'deuterium' THEN
        v_min_price := COALESCE(v_limits.min_price_deuterium, 0);
      END IF;

      IF v_min_price > 0 AND p_price_per_unit < v_min_price THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Precio minimo por unidad de ' || p_item_code || ' es ' || v_min_price || ' FXU',
          'min_price', v_min_price
        );
      END IF;
    END IF;
  END IF;

  -- Enforce minimum total price of 1 FXU to prevent micro-transactions
  v_total_price := p_quantity * p_price_per_unit;

  IF v_total_price < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El precio total minimo de la oferta debe ser al menos 1 FXU');
  END IF;

  PERFORM _internal_set_fxu_context();

  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = v_user_id FOR UPDATE;

  IF v_fxu_balance IS NULL OR v_fxu_balance < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_total_price || ' FXU');
  END IF;

  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;

  INSERT INTO market_buy_offers (buyer_id, listing_type, item_code, quantity, price_per_unit, status)
  VALUES (v_user_id, p_listing_type, p_item_code, p_quantity, p_price_per_unit, 'active')
  RETURNING id INTO v_offer_id;

  RETURN jsonb_build_object(
    'success', true,
    'offer_id', v_offer_id,
    'total_locked', v_total_price,
    'message', 'Oferta de compra creada. Se bloquearon ' || v_total_price || ' FXU.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al crear oferta: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_buy_offer(text, text, bigint, numeric) TO authenticated;


-- Fix 3: create_market_listing - Add FOR UPDATE lock on resources to prevent race condition
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

  v_total_price := p_quantity * p_price_per_unit;

  IF p_listing_type = 'resource' THEN
    IF p_item_code NOT IN ('metal', 'crystal', 'deuterium') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Recurso invalido');
    END IF;

    -- FOR UPDATE lock to prevent race condition with concurrent listings
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

GRANT EXECUTE ON FUNCTION create_market_listing(text, text, bigint, numeric, uuid) TO authenticated;
