/*
  # Mega Reciclador + Sistema de Planos permanentes (P2P + expediciones)

  Objetivos:
  1) Agregar nave civil `mega_recycler` (capacidad 1,000,000)
  2) Rebalancear `falco_x_clasica` para quedar > star_destroyer y < deathstar
  3) Implementar planos permanentes por nave
  4) Habilitar venta/compra de planos en mercado P2P
  5) Permitir drops raros de planos en expediciones

  Nota de seguridad/compatibilidad:
  - Se evita modificar funciones troncales gigantes del juego.
  - Se agregan funciones y triggers aislados para minimizar riesgo sobre lógica existente.
*/

-- ---------------------------------------------------------------------------
-- 1) NUEVA NAVE: Mega Reciclador (civil)
-- ---------------------------------------------------------------------------
INSERT INTO ship_types (
  code, name, description, category,
  metal_cost, crystal_cost, deuterium_cost,
  build_time_seconds, structural_integrity, shield_power, weapon_power,
  cargo_capacity, base_speed, fuel_consumption,
  rapid_fire, image_url
)
SELECT
  'mega_recycler',
  'Mega Reciclador',
  'Nave civil avanzada de reciclaje masivo. Diseñada para recuperar grandes campos de escombros con eficiencia extrema.',
  'civil',
  300000, 180000, 70000,
  36000,
  80000,
  100,
  5,
  1000000,
  1500,
  1200,
  '{}'::jsonb,
  'https://falcox.net/assets/ships/mega_recycler.png'
WHERE NOT EXISTS (
  SELECT 1 FROM ship_types WHERE code = 'mega_recycler'
);

-- Requisitos de mega_recycler (sin duplicar)
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
SELECT st.id, 11, 12, NULL, NULL
FROM ship_types st
WHERE st.code = 'mega_recycler'
  AND NOT EXISTS (
    SELECT 1 FROM ship_requirements sr
    WHERE sr.ship_type_id = st.id
      AND sr.required_building_id = 11
      AND sr.required_building_level = 12
      AND sr.required_tech_id IS NULL
  );

INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
SELECT st.id, NULL, NULL, 7, 8
FROM ship_types st
WHERE st.code = 'mega_recycler'
  AND NOT EXISTS (
    SELECT 1 FROM ship_requirements sr
    WHERE sr.ship_type_id = st.id
      AND sr.required_tech_id = 7
      AND sr.required_tech_level = 8
  );

INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
SELECT st.id, NULL, NULL, 8, 6
FROM ship_types st
WHERE st.code = 'mega_recycler'
  AND NOT EXISTS (
    SELECT 1 FROM ship_requirements sr
    WHERE sr.ship_type_id = st.id
      AND sr.required_tech_id = 8
      AND sr.required_tech_level = 6
  );

INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
SELECT st.id, NULL, NULL, 4, 5
FROM ship_types st
WHERE st.code = 'mega_recycler'
  AND NOT EXISTS (
    SELECT 1 FROM ship_requirements sr
    WHERE sr.ship_type_id = st.id
      AND sr.required_tech_id = 4
      AND sr.required_tech_level = 5
  );

-- ---------------------------------------------------------------------------
-- 2) REBALANCEO FALCO-X CLASICA
--    Objetivo: mejor que star_destroyer y menor que deathstar
-- ---------------------------------------------------------------------------
UPDATE ship_types
SET
  category = 'combat',
  description = 'Nave de combate elite. Superior al Destructor de Estrellas, pero por debajo de la Estrella de la Muerte.',
  metal_cost = 3500000,
  crystal_cost = 2500000,
  deuterium_cost = 900000,
  build_time_seconds = 120000,
  structural_integrity = 1200000,
  shield_power = 12000,
  weapon_power = 120000,
  cargo_capacity = 350000,
  base_speed = 8000,
  fuel_consumption = 1800,
  rapid_fire = '{"light_fighter": 80, "heavy_fighter": 50, "cruiser": 25, "battleship": 12, "battlecruiser": 10, "bomber": 10, "destroyer": 6, "star_destroyer": 2, "small_cargo": 120, "large_cargo": 70, "recycler": 100, "espionage_probe": 300, "solar_satellite": 300, "rocket_launcher": 150, "light_laser": 80, "heavy_laser": 40, "gauss_cannon": 10, "ion_cannon": 18, "plasma_turret": 4}'::jsonb
WHERE code = 'falco_x_clasica';

-- ---------------------------------------------------------------------------
-- 3) SISTEMA DE PLANOS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ship_blueprints (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  ship_type_id integer NOT NULL REFERENCES ship_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  image_url text,
  price_fxu numeric NOT NULL CHECK (price_fxu > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ship_type_id)
);

CREATE TABLE IF NOT EXISTS user_ship_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blueprint_id bigint NOT NULL REFERENCES ship_blueprints(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'shop' CHECK (source IN ('shop','p2p','expedition','admin')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id, blueprint_id)
);

CREATE INDEX IF NOT EXISTS idx_user_ship_blueprints_user ON user_ship_blueprints(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ship_blueprints_blueprint ON user_ship_blueprints(blueprint_id);

ALTER TABLE ship_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ship_blueprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Blueprint catalog visible to authenticated" ON ship_blueprints;
CREATE POLICY "Blueprint catalog visible to authenticated"
  ON ship_blueprints FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Users can read own blueprints" ON user_ship_blueprints;
CREATE POLICY "Users can read own blueprints"
  ON user_ship_blueprints FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Seed planos Falco-X y Mega Reciclador
INSERT INTO ship_blueprints (code, ship_type_id, name, description, image_url, price_fxu, is_active)
SELECT
  'bp_falco_x_clasica', st.id,
  'Plano Falco-X Clasica',
  'Plano permanente de ensamblaje de la Falco-X Clasica. Transferible en mercado P2P.',
  'https://falcox.net/assets/blueprints/bp_falco_x_clasica.png',
  100000,
  true
FROM ship_types st
WHERE st.code = 'falco_x_clasica'
  AND NOT EXISTS (SELECT 1 FROM ship_blueprints WHERE code = 'bp_falco_x_clasica');

INSERT INTO ship_blueprints (code, ship_type_id, name, description, image_url, price_fxu, is_active)
SELECT
  'bp_mega_recycler', st.id,
  'Plano Mega Reciclador',
  'Plano permanente de ensamblaje del Mega Reciclador. Transferible en mercado P2P.',
  'https://falcox.net/assets/blueprints/bp_mega_recycler.png',
  50000,
  true
FROM ship_types st
WHERE st.code = 'mega_recycler'
  AND NOT EXISTS (SELECT 1 FROM ship_blueprints WHERE code = 'bp_mega_recycler');

-- ---------------------------------------------------------------------------
-- 4) ENFORCE: SI NAVE REQUIERE PLANO, NO SE PUEDE COLAR EN SHIPYARD SIN EL
-- ---------------------------------------------------------------------------
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
BEGIN
  IF NEW.item_type <> 'ship' OR NEW.ship_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_owner_id
  FROM planets p
  WHERE p.id = NEW.planet_id;

  -- Si no hay owner encontrado, dejamos que otra validación falle
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sb.id, st.name
    INTO v_blueprint_id, v_ship_name
  FROM ship_blueprints sb
  JOIN ship_types st ON st.id = sb.ship_type_id
  WHERE sb.ship_type_id = NEW.ship_type_id
    AND sb.is_active = true
  LIMIT 1;

  -- Si esta nave no tiene plano asociado, no bloqueamos
  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_ship_blueprints usb
    WHERE usb.user_id = v_owner_id
      AND usb.blueprint_id = v_blueprint_id
  ) THEN
    RAISE EXCEPTION 'Necesitas el plano % para construir esta nave.', COALESCE(v_ship_name, 'requerido')
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

-- ---------------------------------------------------------------------------
-- 5) VENTA/COMPRA DE PLANOS EN MERCADO P2P
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blueprint_market_escrow (
  listing_id uuid PRIMARY KEY REFERENCES market_listings(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blueprint_id bigint NOT NULL REFERENCES ship_blueprints(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  returned_at timestamptz,
  buyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (listing_id, blueprint_id)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_escrow_seller ON blueprint_market_escrow(seller_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_escrow_blueprint ON blueprint_market_escrow(blueprint_id);

-- Extender CHECK listing_type de market_listings para incluir blueprint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'market_listings'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%listing_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.market_listings DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE market_listings
  ADD CONSTRAINT market_listings_listing_type_check
  CHECK (listing_type IN ('resource', 'ship', 'dark_matter', 'blueprint'));

-- Función para comprar plano a la empresa
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
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_blueprint.price_fxu, 'balance', v_balance);
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_blueprint.price_fxu
  WHERE id = v_user_id;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (v_user_id, v_blueprint.id, 'shop', jsonb_build_object('price_fxu', v_blueprint.price_fxu));

  -- Se registra como "other" para no romper constraints evolutivos de revenue_type
  PERFORM record_admin_revenue(
    'other',
    v_blueprint.price_fxu,
    'blueprint_sale:' || v_blueprint.code,
    v_user_id,
    NULL
  );

  RETURN jsonb_build_object('success', true, 'message', 'Plano comprado exitosamente', 'blueprint_code', v_blueprint.code);
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_ship_blueprint(text) TO authenticated;

-- Crear listing de plano en mercado
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

  -- Debe poseer el plano y no estar ya bloqueado en otro listing
  IF NOT EXISTS (
    SELECT 1 FROM user_ship_blueprints usb
    WHERE usb.user_id = v_user_id
      AND usb.blueprint_id = v_blueprint_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No posees este plano');
  END IF;

  -- Sacar de inventario (escrow)
  DELETE FROM user_ship_blueprints
  WHERE user_id = v_user_id
    AND blueprint_id = v_blueprint_id;

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
    -- rollback automatico de toda la transaccion en caso de error
    RETURN jsonb_build_object('success', false, 'error', 'Error al crear listing de plano: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_blueprint_market_listing(text, numeric) TO authenticated;

-- Comprar listing de plano
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

  -- Fee fijo 5% como mercado general
  v_fee := ROUND(v_listing.total_price * 0.05, 8);
  v_seller_receive := v_listing.total_price - v_fee;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_listing.total_price
  WHERE id = v_buyer_id;

  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + v_seller_receive
  WHERE id = v_listing.seller_id;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    v_buyer_id,
    v_escrow.blueprint_id,
    'p2p',
    jsonb_build_object('listing_id', p_listing_id, 'price_fxu', v_listing.total_price)
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
    v_fee,
    'market_blueprint_fee:' || v_listing.item_code,
    v_buyer_id,
    p_listing_id
  );

  RETURN jsonb_build_object('success', true, 'message', 'Plano comprado exitosamente');
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_blueprint_market_listing(uuid) TO authenticated;

-- Cancelar listing de plano (devolver al seller)
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

  -- Devolución inmediata
  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (v_escrow.seller_id, v_escrow.blueprint_id, 'admin', jsonb_build_object('reason', 'listing_cancelled', 'listing_id', p_listing_id))
  ON CONFLICT (user_id, blueprint_id) DO NOTHING;

  UPDATE blueprint_market_escrow
  SET returned_at = now()
  WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object('success', true, 'message', 'Listing cancelado y plano devuelto');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_blueprint_market_listing(uuid) TO authenticated;

-- Trigger de seguridad: si un listing blueprint se cancela por otra via, devolver al seller
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
      )
      ON CONFLICT (user_id, blueprint_id) DO NOTHING;

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

-- ---------------------------------------------------------------------------
-- 6) DROPS DE PLANOS EN EXPEDICIONES (probabilidad baja)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expedition_blueprint_drop_config (
  id integer PRIMARY KEY DEFAULT 1,
  drop_chance numeric NOT NULL DEFAULT 0.003 CHECK (drop_chance >= 0 AND drop_chance <= 1),
  only_unowned boolean NOT NULL DEFAULT true,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO expedition_blueprint_drop_config (id, drop_chance, only_unowned, is_enabled)
VALUES (1, 0.003, true, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS expedition_blueprint_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blueprint_id bigint NOT NULL REFERENCES ship_blueprints(id) ON DELETE CASCADE,
  dropped_at timestamptz NOT NULL DEFAULT now(),
  roll_value numeric,
  chance_used numeric,
  UNIQUE(fleet_id)
);

CREATE INDEX IF NOT EXISTS idx_expedition_blueprint_drops_user ON expedition_blueprint_drops(user_id);

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
  -- Solo cuando una expedición termina por primera vez
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

  IF v_cfg.only_unowned THEN
    SELECT sb.id INTO v_blueprint_id
    FROM ship_blueprints sb
    WHERE sb.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_ship_blueprints usb
        WHERE usb.user_id = NEW.user_id
          AND usb.blueprint_id = sb.id
      )
    ORDER BY random()
    LIMIT 1;
  ELSE
    SELECT sb.id INTO v_blueprint_id
    FROM ship_blueprints sb
    WHERE sb.is_active = true
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    NEW.user_id,
    v_blueprint_id,
    'expedition',
    jsonb_build_object('fleet_id', NEW.id, 'roll', v_roll, 'chance', v_cfg.drop_chance)
  )
  ON CONFLICT (user_id, blueprint_id) DO NOTHING;

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
