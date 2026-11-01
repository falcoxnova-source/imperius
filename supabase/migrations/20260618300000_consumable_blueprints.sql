/*
  # Planos consumibles (1 plano = 1 nave)

  Reglas confirmadas:
  1) Cada nave consume 1 plano (Falco-X / Mega Reciclador)
  2) Si tienes planos suficientes para la cantidad en cola:
     - Se consumen al insertar en shipyard_queue
     - Se anulan requisitos de tech/building
     - Se mantiene Hangar nivel 1 minimo
  3) Si NO tienes planos suficientes:
     - Debes cumplir TODOS los requisitos normales
  4) Drop expedicion dificil: 1%
  5) Planos acumulables para poder construir en cola
*/

-- ============================================================
-- 1) Permitir stacking real de planos (quitar unique por usuario+plano)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'user_ship_blueprints'
      AND c.conname = 'user_ship_blueprints_user_id_blueprint_id_key'
  ) THEN
    ALTER TABLE public.user_ship_blueprints
      DROP CONSTRAINT user_ship_blueprints_user_id_blueprint_id_key;
  END IF;
END $$;

-- ============================================================
-- 2) Trigger de construccion: consumir planos o exigir requisitos
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_ship_blueprint_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_blueprint_id bigint;
  v_ship_name text;
  v_needed integer;
  v_available integer;
  v_consumed integer;
  v_shipyard_level integer;
  v_validation jsonb;
BEGIN
  IF NEW.item_type <> 'ship' OR NEW.ship_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_needed := GREATEST(1, COALESCE(NEW.quantity, 1));

  SELECT p.user_id INTO v_owner_id
  FROM planets p
  WHERE p.id = NEW.planet_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Siempre requiere Hangar nivel 1 minimo
  SELECT COALESCE(pb.level, 0)
    INTO v_shipyard_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = NEW.planet_id
    AND bt.code = 'shipyard'
  LIMIT 1;

  IF COALESCE(v_shipyard_level, 0) < 1 THEN
    RAISE EXCEPTION 'Necesitas Hangar nivel 1 para construir esta nave.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Buscar si esta nave tiene plano asociado
  SELECT sb.id, st.name
    INTO v_blueprint_id, v_ship_name
  FROM ship_blueprints sb
  JOIN ship_types st ON st.id = sb.ship_type_id
  WHERE sb.ship_type_id = NEW.ship_type_id
    AND sb.is_active = true
  LIMIT 1;

  -- Si no tiene sistema de plano, no se altera el flujo normal
  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer INTO v_available
  FROM user_ship_blueprints usb
  WHERE usb.user_id = v_owner_id
    AND usb.blueprint_id = v_blueprint_id;

  -- Si tiene planos suficientes, consumir y permitir bypass de requisitos
  IF v_available >= v_needed THEN
    WITH to_consume AS (
      SELECT usb.id
      FROM user_ship_blueprints usb
      WHERE usb.user_id = v_owner_id
        AND usb.blueprint_id = v_blueprint_id
      ORDER BY usb.acquired_at ASC, usb.id ASC
      LIMIT v_needed
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM user_ship_blueprints d
    USING to_consume tc
    WHERE d.id = tc.id;

    GET DIAGNOSTICS v_consumed = ROW_COUNT;

    IF v_consumed < v_needed THEN
      RAISE EXCEPTION 'No se pudieron reservar suficientes planos para %.', COALESCE(v_ship_name, 'la nave')
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  -- Si no tiene planos suficientes, validar requisitos completos
  v_validation := validate_ship_requirements(NEW.planet_id, NEW.ship_type_id);
  IF NOT COALESCE((v_validation->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'No cumples los requisitos para construir % sin plano.', COALESCE(v_ship_name, 'esta nave')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ship_blueprint_requirement ON shipyard_queue;
CREATE TRIGGER trg_enforce_ship_blueprint_requirement
BEFORE INSERT ON shipyard_queue
FOR EACH ROW
EXECUTE FUNCTION enforce_ship_blueprint_requirement();

-- ============================================================
-- 3) Compra tienda oficial: ahora SIEMPRE agrega 1 plano (acumulable)
--    mantiene split 50% admin / 50% pools
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

  PERFORM record_admin_revenue(
    'other',
    v_admin_amount,
    'blueprint_sale (50% admin): ' || v_blueprint.code,
    v_user_id,
    NULL
  );

  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'blueprint_sale:' || v_blueprint.code, v_user_id);
  END IF;

  -- Entregar 1 unidad de plano
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
    'quantity_added', 1,
    'cost', v_blueprint.price_fxu,
    'admin_share', v_admin_amount,
    'pool_share', v_pool_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_ship_blueprint(text) TO authenticated;

-- ============================================================
-- 4) Crear listing P2P: reservar SOLO 1 unidad de plano
-- ============================================================
CREATE OR REPLACE FUNCTION create_blueprint_market_listing(
  p_blueprint_code text,
  p_price_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_blueprint_id bigint;
  v_listing_id uuid;
  v_owned_row_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF p_price_total IS NULL OR p_price_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio invalido');
  END IF;

  SELECT sb.id INTO v_blueprint_id
  FROM ship_blueprints sb
  WHERE sb.code = p_blueprint_code
    AND sb.is_active = true;

  IF v_blueprint_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano invalido');
  END IF;

  -- Tomar 1 unidad concreta para escrow
  SELECT usb.id INTO v_owned_row_id
  FROM user_ship_blueprints usb
  WHERE usb.user_id = v_user_id
    AND usb.blueprint_id = v_blueprint_id
  ORDER BY usb.acquired_at ASC, usb.id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_owned_row_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No posees este plano');
  END IF;

  DELETE FROM user_ship_blueprints
  WHERE id = v_owned_row_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se pudo reservar el plano para venta');
  END IF;

  INSERT INTO market_listings (
    seller_id, listing_type, item_code, quantity, price_per_unit, total_price, planet_id, status
  ) VALUES (
    v_user_id, 'blueprint', p_blueprint_code, 1, p_price_total, p_price_total, NULL, 'active'
  ) RETURNING id INTO v_listing_id;

  INSERT INTO blueprint_market_escrow (listing_id, seller_id, blueprint_id)
  VALUES (v_listing_id, v_user_id, v_blueprint_id);

  RETURN jsonb_build_object('success', true, 'listing_id', v_listing_id);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al crear listing de plano: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_blueprint_market_listing(text, numeric) TO authenticated;

-- ============================================================
-- 5) Compra de listing P2P: buyer ahora puede acumular
--    (se mantiene fee 5% con split 50/50)
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

  SELECT COALESCE(fxu_balance, 0) INTO v_buyer_balance
  FROM profiles
  WHERE id = v_buyer_id
  FOR UPDATE;

  IF v_buyer_balance < v_listing.total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente');
  END IF;

  v_fee := ROUND(v_listing.total_price * 0.05, 8);
  v_seller_receive := v_listing.total_price - v_fee;

  v_fee_pool_share  := ROUND(v_fee * 0.50, 8);
  v_fee_admin_share := v_fee - v_fee_pool_share;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_listing.total_price
  WHERE id = v_buyer_id;

  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + v_seller_receive
  WHERE id = v_listing.seller_id;

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

  IF v_fee_pool_share > 0 THEN
    PERFORM contribute_to_jackpot(
      v_fee_pool_share,
      'market_blueprint_fee:' || v_listing.item_code,
      v_buyer_id
    );
  END IF;

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

  UPDATE blueprint_market_escrow
  SET delivered_at = now(), buyer_id = v_buyer_id
  WHERE listing_id = p_listing_id;

  UPDATE market_listings
  SET status = 'sold', updated_at = now()
  WHERE id = p_listing_id;

  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, 'blueprint', v_listing.item_code, 1, v_listing.total_price);

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
    'quantity_added', 1,
    'price', v_listing.total_price,
    'fee', v_fee,
    'fee_admin_share', v_fee_admin_share,
    'fee_pool_share', v_fee_pool_share,
    'seller_received', v_seller_receive
  );
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_blueprint_market_listing(uuid) TO authenticated;

-- ============================================================
-- 6) Cancel listing y trigger retorno: devolver 1 unidad sin ON CONFLICT
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_blueprint_market_listing(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_listing market_listings%ROWTYPE;
  v_escrow blueprint_market_escrow%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
    AND seller_id = v_user_id
    AND listing_type = 'blueprint'
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing no encontrado');
  END IF;

  SELECT * INTO v_escrow
  FROM blueprint_market_escrow
  WHERE listing_id = p_listing_id
    AND delivered_at IS NULL
    AND returned_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow no disponible');
  END IF;

  UPDATE market_listings
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_listing_id;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    v_escrow.seller_id,
    v_escrow.blueprint_id,
    'admin',
    jsonb_build_object('reason', 'listing_cancelled', 'listing_id', p_listing_id)
  );

  UPDATE blueprint_market_escrow
  SET returned_at = now()
  WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object('success', true, 'message', 'Listing cancelado y plano devuelto');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_blueprint_market_listing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION trg_return_blueprint_on_listing_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_escrow blueprint_market_escrow%ROWTYPE;
BEGIN
  IF NEW.listing_type = 'blueprint'
     AND OLD.status = 'active'
     AND NEW.status = 'cancelled' THEN

    SELECT * INTO v_escrow
    FROM blueprint_market_escrow
    WHERE listing_id = NEW.id
      AND delivered_at IS NULL
      AND returned_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
      INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
      VALUES (
        v_escrow.seller_id,
        v_escrow.blueprint_id,
        'admin',
        jsonb_build_object('reason', 'trigger_cancel_return', 'listing_id', NEW.id)
      );

      UPDATE blueprint_market_escrow
      SET returned_at = now()
      WHERE listing_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_blueprint_on_listing_cancel ON market_listings;
CREATE TRIGGER trg_return_blueprint_on_listing_cancel
AFTER UPDATE OF status ON market_listings
FOR EACH ROW
EXECUTE FUNCTION trg_return_blueprint_on_listing_cancel();

-- ============================================================
-- 7) Drop expediciones: 1% y acumulable
-- ============================================================
UPDATE expedition_blueprint_drop_config
SET drop_chance = 0.01,
    only_unowned = false,
    is_enabled = true,
    updated_at = now()
WHERE id = 1;

CREATE OR REPLACE FUNCTION award_expedition_blueprint_drop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg expedition_blueprint_drop_config%ROWTYPE;
  v_roll numeric;
  v_blueprint_id bigint;
BEGIN
  IF NOT (NEW.mission_type = 'expedition' AND NEW.is_completed = true AND COALESCE(OLD.is_completed, false) = false) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM expedition_blueprint_drops WHERE fleet_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cfg FROM expedition_blueprint_drop_config WHERE id = 1;
  IF v_cfg IS NULL OR v_cfg.is_enabled = false THEN
    RETURN NEW;
  END IF;

  v_roll := random();
  IF v_roll > v_cfg.drop_chance THEN
    RETURN NEW;
  END IF;

  -- Para consumibles, permitimos repetidos (acumulables)
  SELECT sb.id INTO v_blueprint_id
  FROM ship_blueprints sb
  WHERE sb.is_active = true
  ORDER BY random()
  LIMIT 1;

  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    NEW.user_id,
    v_blueprint_id,
    'expedition',
    jsonb_build_object('fleet_id', NEW.id, 'roll', v_roll, 'chance', v_cfg.drop_chance)
  );

  INSERT INTO expedition_blueprint_drops (fleet_id, user_id, blueprint_id, roll_value, chance_used)
  VALUES (NEW.id, NEW.user_id, v_blueprint_id, v_roll, v_cfg.drop_chance)
  ON CONFLICT (fleet_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_expedition_blueprint_drop ON fleets;
CREATE TRIGGER trg_award_expedition_blueprint_drop
AFTER UPDATE OF is_completed ON fleets
FOR EACH ROW
EXECUTE FUNCTION award_expedition_blueprint_drop();
