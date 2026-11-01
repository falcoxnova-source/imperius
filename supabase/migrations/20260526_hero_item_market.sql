-- ==========================================================================
-- Hero Item P2P Market
-- Tabla de listados + pool separado para ranking futuro
-- Fee: 10% del precio, 50% admin / 50% pool hero market
-- ==========================================================================

CREATE TABLE IF NOT EXISTS hero_item_market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES hero_ship_items(id) ON DELETE CASCADE,
  item_level integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  price_fxu bigint NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  sold_at timestamptz
);

CREATE TABLE IF NOT EXISTS hero_market_pool (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance numeric NOT NULL DEFAULT 0,
  total_contributed numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO hero_market_pool (id, balance, total_contributed)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- Listar un item del inventario en el mercado
-- ==========================================================================
CREATE OR REPLACE FUNCTION create_hero_item_listing(
  p_item_id uuid,
  p_item_level integer,
  p_quantity integer,
  p_price_fxu bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_inv record;
  v_new_qty integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF p_quantity < 1 OR p_price_fxu < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad o precio invalido');
  END IF;

  SELECT * INTO v_inv
  FROM user_hero_ship_inventory
  WHERE user_id = v_user_id AND item_id = p_item_id AND item_level = p_item_level
  FOR UPDATE;

  IF NOT FOUND OR v_inv.quantity < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes suficientes items en inventario');
  END IF;

  v_new_qty := v_inv.quantity - p_quantity;
  IF v_new_qty <= 0 THEN
    DELETE FROM user_hero_ship_inventory WHERE id = v_inv.id;
  ELSE
    UPDATE user_hero_ship_inventory SET quantity = v_new_qty WHERE id = v_inv.id;
  END IF;

  INSERT INTO hero_item_market_listings (seller_id, item_id, item_level, quantity, price_fxu)
  VALUES (v_user_id, p_item_id, p_item_level, p_quantity, p_price_fxu);

  RETURN jsonb_build_object('success', true, 'message', 'Item listado en el mercado');
END;
$$;

-- ==========================================================================
-- Cancelar un listado propio
-- ==========================================================================
CREATE OR REPLACE FUNCTION cancel_hero_item_listing(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_listing record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_listing
  FROM hero_item_market_listings
  WHERE id = p_listing_id AND seller_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listado no encontrado o no te pertenece');
  END IF;

  UPDATE hero_item_market_listings SET status = 'cancelled' WHERE id = p_listing_id;

  INSERT INTO user_hero_ship_inventory (user_id, item_id, item_level, quantity)
  VALUES (v_user_id, v_listing.item_id, v_listing.item_level, v_listing.quantity)
  ON CONFLICT (user_id, item_id, item_level)
    DO UPDATE SET quantity = user_hero_ship_inventory.quantity + v_listing.quantity;

  RETURN jsonb_build_object('success', true, 'message', 'Listado cancelado, item devuelto al inventario');
END;
$$;

-- ==========================================================================
-- Comprar un item del mercado
-- Fee: 10% del precio, 50% admin / 50% hero_market_pool
-- ==========================================================================
CREATE OR REPLACE FUNCTION buy_hero_item_listing(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_listing record;
  v_total_price bigint;
  v_fee bigint;
  v_admin_fee bigint;
  v_pool_fee bigint;
  v_seller_amount bigint;
  v_admin_id uuid;
  v_item record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_listing
  FROM hero_item_market_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listado no encontrado o ya no esta activo');
  END IF;

  IF v_listing.seller_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes comprar tus propios items');
  END IF;

  SELECT * INTO v_item FROM hero_ship_items WHERE id = v_listing.item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item no encontrado');
  END IF;

  v_total_price := v_listing.price_fxu * v_listing.quantity;
  v_fee := FLOOR(v_total_price * 10 / 100);
  v_admin_fee := FLOOR(v_fee / 2);
  v_pool_fee := v_fee - v_admin_fee;
  v_seller_amount := v_total_price - v_fee;

  -- Check buyer balance
  IF (SELECT fxu_balance FROM profiles WHERE id = v_user_id) < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente');
  END IF;

  -- Deduct FXU from buyer
  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;

  -- Credit seller (net of fee)
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  -- Admin fee: credit first admin profile
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;
    PERFORM record_admin_revenue('p2p_fee', v_admin_fee, 'Hero item market fee', v_listing.seller_id, p_listing_id);
  END IF;

  -- Pool contribution
  IF v_pool_fee > 0 THEN
    UPDATE hero_market_pool SET
      balance = balance + v_pool_fee,
      total_contributed = total_contributed + v_pool_fee,
      updated_at = now()
    WHERE id = 1;
  END IF;

  -- Mark listing as sold
  UPDATE hero_item_market_listings SET status = 'sold', sold_at = now() WHERE id = p_listing_id;

  -- Add item to buyer's inventory (stack if same item_id + item_level)
  INSERT INTO user_hero_ship_inventory (user_id, item_id, item_level, quantity)
  VALUES (v_user_id, v_listing.item_id, v_listing.item_level, v_listing.quantity)
  ON CONFLICT (user_id, item_id, item_level)
    DO UPDATE SET quantity = user_hero_ship_inventory.quantity + v_listing.quantity;

  RETURN jsonb_build_object('success', true, 'message', 'Item comprado exitosamente');
END;
$$;

-- ==========================================================================
-- Obtener listados activos del mercado (con datos del item)
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_hero_market_listings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'listing_id', l.id,
    'seller_id', l.seller_id,
    'seller_name', p.username,
    'item_id', l.item_id,
    'item_name', i.name,
    'rarity', i.rarity,
    'slot_type', i.slot_type,
    'min_level', i.min_level,
    'is_repair_kit', i.is_repair_kit,
    'repair_amount', i.repair_amount,
    'description', i.description,
    'item_level', l.item_level,
    'quantity', l.quantity,
    'price_fxu', l.price_fxu,
    'attack_bonus', FLOOR(COALESCE(i.attack_bonus, 0) * l.item_level),
    'defense_bonus', FLOOR(COALESCE(i.defense_bonus, 0) * l.item_level),
    'shield_bonus', FLOOR(COALESCE(i.shield_bonus, 0) * l.item_level),
    'speed_bonus', FLOOR(COALESCE(i.speed_bonus, 0) * l.item_level),
    'loot_bonus', FLOOR(COALESCE(i.loot_bonus, 0) * l.item_level),
    'created_at', l.created_at
  ) ORDER BY l.created_at DESC), '[]'::jsonb) INTO v_result
  FROM hero_item_market_listings l
  JOIN hero_ship_items i ON i.id = l.item_id
  LEFT JOIN profiles p ON p.id = l.seller_id
  WHERE l.status = 'active';

  RETURN v_result;
END;
$$;

-- ==========================================================================
-- Obtener balance del pool
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_hero_market_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool hero_market_pool%ROWTYPE;
BEGIN
  SELECT * INTO v_pool FROM hero_market_pool WHERE id = 1;
  RETURN jsonb_build_object('balance', COALESCE(v_pool.balance, 0), 'total_contributed', COALESCE(v_pool.total_contributed, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION create_hero_item_listing(uuid, int, int, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_hero_item_listing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION buy_hero_item_listing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_market_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_market_pool() TO authenticated;
