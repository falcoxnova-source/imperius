-- Fix buy_hero_item_listing: add _internal_set_fxu_context() and use get_admin_account_id()
-- The trigger protect_fxu_balance blocks direct UPDATE on profiles.fxu_balance unless the
-- session variable fxu.allow_update_9x7k2m is set (done by _internal_set_fxu_context()).
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

  -- Bypass fxu_balance protection trigger
  PERFORM _internal_set_fxu_context();

  -- Deduct FXU from buyer
  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;

  -- Credit seller (net of fee)
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  -- Admin fee: credit first admin profile
  v_admin_id := get_admin_account_id();
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
