/*
  # Distribución económica de planos: 50% admin wallet + 50% pools de recompensa

  Cambios:
  - purchase_ship_blueprint: el FXU del jugador ya no se "quema". Ahora
      * 50% se transfiere a la wallet del primer admin (fxu_balance) y se
        registra en admin_revenue como 'other' con descripción blueprint_sale.
      * 50% va a las pools de recompensa via contribute_to_jackpot().
  - purchase_blueprint_market_listing: la comisión del 5% que antes solo se
    registraba como market_fee ahora también se transfiere físicamente a la
    wallet del admin (50%) y al jackpot (50%).

  Constraint admin_revenue.revenue_type permite: market_fee, supply_box, ...,
  'other'. Usamos 'other' para blueprint_sale (mantener constraint sin tocar).
*/

-- ============================================================
-- 1) COMPRA DE PLANO A LA EMPRESA (tienda oficial)
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_ship_blueprint(p_blueprint_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_blueprint ship_blueprints%ROWTYPE;
  v_balance numeric;
  v_admin_id uuid;
  v_pool_amount numeric;
  v_admin_amount numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_blueprint
  FROM ship_blueprints
  WHERE code = p_blueprint_code AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no disponible');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_ship_blueprints
    WHERE user_id = v_user_id AND blueprint_id = v_blueprint.id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya posees este plano');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_balance < v_blueprint.price_fxu THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente',
      'required', v_blueprint.price_fxu,
      'balance', v_balance
    );
  END IF;

  PERFORM _internal_set_fxu_context();

  -- Cobrar al jugador
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_blueprint.price_fxu
  WHERE id = v_user_id;

  -- Split 50% admin / 50% pools
  v_pool_amount  := FLOOR(v_blueprint.price_fxu * 0.50);
  v_admin_amount := v_blueprint.price_fxu - v_pool_amount;

  -- 50% al admin (transferencia real de FXU)
  SELECT id INTO v_admin_id
  FROM profiles
  WHERE is_admin = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin_id IS NOT NULL AND v_admin_id <> v_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_admin_amount
    WHERE id = v_admin_id;
  END IF;

  -- Registrar revenue (50% admin)
  PERFORM record_admin_revenue(
    'other',
    v_admin_amount,
    'blueprint_sale (50% admin): ' || v_blueprint.code,
    v_user_id,
    NULL
  );

  -- 50% a pools de recompensa
  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'blueprint_sale:' || v_blueprint.code, v_user_id);
  END IF;

  -- Entregar plano
  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    v_user_id,
    v_blueprint.id,
    'shop',
    jsonb_build_object(
      'price_fxu', v_blueprint.price_fxu,
      'admin_share', v_admin_amount,
      'pool_share', v_pool_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Plano comprado exitosamente',
    'blueprint_code', v_blueprint.code,
    'cost', v_blueprint.price_fxu,
    'admin_share', v_admin_amount,
    'pool_share', v_pool_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_ship_blueprint(text) TO authenticated;

-- ============================================================
-- 2) COMPRA DE LISTING DE PLANO EN P2P
--    Fee 5% → 50% admin wallet + 50% pools.
--    Vendedor recibe 95% del precio (sin cambio).
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_blueprint_market_listing(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id uuid;
  v_listing market_listings%ROWTYPE;
  v_escrow blueprint_market_escrow%ROWTYPE;
  v_buyer_balance numeric;
  v_fee numeric;
  v_seller_receive numeric;
  v_admin_id uuid;
  v_fee_admin_share numeric;
  v_fee_pool_share numeric;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
    AND status = 'active'
    AND listing_type = 'blueprint'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing no disponible');
  END IF;

  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes comprar tu propio listing');
  END IF;

  SELECT * INTO v_escrow
  FROM blueprint_market_escrow
  WHERE listing_id = p_listing_id
    AND delivered_at IS NULL
    AND returned_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow de plano invalido');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_ship_blueprints
    WHERE user_id = v_buyer_id
      AND blueprint_id = v_escrow.blueprint_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya posees este plano');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_buyer_balance
  FROM profiles
  WHERE id = v_buyer_id
  FOR UPDATE;

  IF v_buyer_balance < v_listing.total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente');
  END IF;

  -- Fee 5% del precio total
  v_fee := ROUND(v_listing.total_price * 0.05, 8);
  v_seller_receive := v_listing.total_price - v_fee;

  -- Split del fee: 50% admin / 50% pools
  v_fee_pool_share  := ROUND(v_fee * 0.50, 8);
  v_fee_admin_share := v_fee - v_fee_pool_share;

  PERFORM _internal_set_fxu_context();

  -- Cobrar al buyer
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_listing.total_price
  WHERE id = v_buyer_id;

  -- Pagar al seller (95%)
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + v_seller_receive
  WHERE id = v_listing.seller_id;

  -- 50% del fee → admin wallet
  SELECT id INTO v_admin_id
  FROM profiles
  WHERE is_admin = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin_id IS NOT NULL AND v_admin_id <> v_buyer_id AND v_fee_admin_share > 0 THEN
    UPDATE profiles
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_fee_admin_share
    WHERE id = v_admin_id;
  END IF;

  -- 50% del fee → pools de recompensa
  IF v_fee_pool_share > 0 THEN
    PERFORM contribute_to_jackpot(
      v_fee_pool_share,
      'market_blueprint_fee:' || v_listing.item_code,
      v_buyer_id
    );
  END IF;

  -- Entregar plano al buyer
  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    v_buyer_id,
    v_escrow.blueprint_id,
    'p2p',
    jsonb_build_object(
      'listing_id', p_listing_id,
      'price_fxu', v_listing.total_price,
      'fee', v_fee,
      'seller_received', v_seller_receive
    )
  );

  -- Cerrar escrow + listing
  UPDATE blueprint_market_escrow
  SET delivered_at = now(), buyer_id = v_buyer_id
  WHERE listing_id = p_listing_id;

  UPDATE market_listings
  SET status = 'sold', updated_at = now()
  WHERE id = p_listing_id;

  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, 'blueprint', v_listing.item_code, 1, v_listing.total_price);

  -- Registrar revenue (solo el 50% que va al admin)
  PERFORM record_admin_revenue(
    'market_fee',
    v_fee_admin_share,
    'market_blueprint_fee (50% admin): ' || v_listing.item_code,
    v_buyer_id,
    p_listing_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Plano comprado exitosamente',
    'price', v_listing.total_price,
    'fee', v_fee,
    'fee_admin_share', v_fee_admin_share,
    'fee_pool_share', v_fee_pool_share,
    'seller_received', v_seller_receive
  );
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_blueprint_market_listing(uuid) TO authenticated;
