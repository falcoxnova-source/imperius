const { Client } = require('pg');
const fs = require('fs');

const SQL = `
INSERT INTO game_settings (key, value, description)
VALUES
  ('blueprint_admin_pct', '50', 'Porcentaje del precio de planos que va a la wallet del admin (0-100). Suma con blueprint_pool_pct = 100.'),
  ('blueprint_pool_pct', '50', 'Porcentaje del precio de planos que va a las pools de recompensa (0-100). Suma con blueprint_admin_pct = 100.')
ON CONFLICT (key) DO NOTHING;

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
  v_admin_pct numeric;
  v_pool_pct numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_blueprint FROM ship_blueprints WHERE code = p_blueprint_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no disponible');
  END IF;

  IF EXISTS (SELECT 1 FROM user_ship_blueprints WHERE user_id = v_user_id AND blueprint_id = v_blueprint.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya posees este plano');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_balance < v_blueprint.price_fxu THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_blueprint.price_fxu, 'balance', v_balance);
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) - v_blueprint.price_fxu WHERE id = v_user_id;

  SELECT COALESCE(NULLIF(value, '')::numeric, 50) INTO v_admin_pct FROM game_settings WHERE key = 'blueprint_admin_pct';
  IF v_admin_pct IS NULL THEN v_admin_pct := 50; END IF;
  SELECT COALESCE(NULLIF(value, '')::numeric, 50) INTO v_pool_pct FROM game_settings WHERE key = 'blueprint_pool_pct';
  IF v_pool_pct IS NULL THEN v_pool_pct := 50; END IF;
  IF (v_admin_pct + v_pool_pct) <= 0 THEN v_admin_pct := 50; v_pool_pct := 50; END IF;

  v_pool_amount  := FLOOR(v_blueprint.price_fxu * (v_pool_pct / 100.0));
  v_admin_amount := v_blueprint.price_fxu - v_pool_amount;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;

  IF v_admin_id IS NOT NULL AND v_admin_id <> v_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_admin_amount WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue('other', v_admin_amount, 'blueprint_sale (' || v_admin_pct || '% admin): ' || v_blueprint.code, v_user_id, NULL);

  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'blueprint_sale:' || v_blueprint.code, v_user_id);
  END IF;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (v_user_id, v_blueprint.id, 'shop',
    jsonb_build_object('price_fxu', v_blueprint.price_fxu, 'admin_share', v_admin_amount, 'pool_share', v_pool_amount, 'admin_pct', v_admin_pct, 'pool_pct', v_pool_pct));

  RETURN jsonb_build_object('success', true, 'message', 'Plano comprado exitosamente', 'blueprint_code', v_blueprint.code, 'cost', v_blueprint.price_fxu, 'admin_share', v_admin_amount, 'pool_share', v_pool_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_ship_blueprint(text) TO authenticated;

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
  v_admin_pct numeric;
  v_pool_pct numeric;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_listing FROM market_listings WHERE id = p_listing_id AND status = 'active' AND listing_type = 'blueprint' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Listing no disponible'); END IF;
  IF v_listing.seller_id = v_buyer_id THEN RETURN jsonb_build_object('success', false, 'error', 'No puedes comprar tu propio listing'); END IF;

  SELECT * INTO v_escrow FROM blueprint_market_escrow WHERE listing_id = p_listing_id AND delivered_at IS NULL AND returned_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Escrow de plano invalido'); END IF;

  IF EXISTS (SELECT 1 FROM user_ship_blueprints WHERE user_id = v_buyer_id AND blueprint_id = v_escrow.blueprint_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya posees este plano');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_buyer_balance FROM profiles WHERE id = v_buyer_id FOR UPDATE;
  IF v_buyer_balance < v_listing.total_price THEN RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente'); END IF;

  v_fee := ROUND(v_listing.total_price * 0.05, 8);
  v_seller_receive := v_listing.total_price - v_fee;

  SELECT COALESCE(NULLIF(value, '')::numeric, 50) INTO v_admin_pct FROM game_settings WHERE key = 'blueprint_admin_pct';
  IF v_admin_pct IS NULL THEN v_admin_pct := 50; END IF;
  SELECT COALESCE(NULLIF(value, '')::numeric, 50) INTO v_pool_pct FROM game_settings WHERE key = 'blueprint_pool_pct';
  IF v_pool_pct IS NULL THEN v_pool_pct := 50; END IF;
  IF (v_admin_pct + v_pool_pct) <= 0 THEN v_admin_pct := 50; v_pool_pct := 50; END IF;

  v_fee_pool_share  := ROUND(v_fee * (v_pool_pct / 100.0), 8);
  v_fee_admin_share := v_fee - v_fee_pool_share;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) - v_listing.total_price WHERE id = v_buyer_id;
  UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_seller_receive WHERE id = v_listing.seller_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;

  IF v_admin_id IS NOT NULL AND v_admin_id <> v_buyer_id AND v_fee_admin_share > 0 THEN
    UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_fee_admin_share WHERE id = v_admin_id;
  END IF;

  IF v_fee_pool_share > 0 THEN
    PERFORM contribute_to_jackpot(v_fee_pool_share, 'market_blueprint_fee:' || v_listing.item_code, v_buyer_id);
  END IF;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (v_buyer_id, v_escrow.blueprint_id, 'p2p',
    jsonb_build_object('listing_id', p_listing_id, 'price_fxu', v_listing.total_price, 'fee', v_fee, 'seller_received', v_seller_receive, 'admin_pct', v_admin_pct, 'pool_pct', v_pool_pct));

  UPDATE blueprint_market_escrow SET delivered_at = now(), buyer_id = v_buyer_id WHERE listing_id = p_listing_id;
  UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;

  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, 'blueprint', v_listing.item_code, 1, v_listing.total_price);

  PERFORM record_admin_revenue('market_fee', v_fee_admin_share, 'market_blueprint_fee (' || v_admin_pct || '% admin): ' || v_listing.item_code, v_buyer_id, p_listing_id);

  RETURN jsonb_build_object('success', true, 'message', 'Plano comprado exitosamente', 'price', v_listing.total_price, 'fee', v_fee, 'fee_admin_share', v_fee_admin_share, 'fee_pool_share', v_fee_pool_share, 'seller_received', v_seller_receive);
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_blueprint_market_listing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION admin_update_blueprint_revenue_split(p_admin_pct numeric, p_pool_pct numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_is_admin boolean;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  SELECT COALESCE(is_admin, false) INTO v_is_admin FROM profiles WHERE id = v_caller;
  IF NOT v_is_admin THEN RETURN jsonb_build_object('success', false, 'error', 'Solo admin'); END IF;

  IF p_admin_pct IS NULL OR p_pool_pct IS NULL OR p_admin_pct < 0 OR p_admin_pct > 100 OR p_pool_pct < 0 OR p_pool_pct > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cada % debe estar entre 0 y 100');
  END IF;
  IF (p_admin_pct + p_pool_pct) <> 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La suma debe ser 100');
  END IF;

  INSERT INTO game_settings (key, value, description)
  VALUES ('blueprint_admin_pct', p_admin_pct::text, 'Porcentaje del precio de planos que va a la wallet del admin (0-100). Suma con blueprint_pool_pct = 100.')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO game_settings (key, value, description)
  VALUES ('blueprint_pool_pct', p_pool_pct::text, 'Porcentaje del precio de planos que va a las pools de recompensa (0-100). Suma con blueprint_admin_pct = 100.')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object('success', true, 'admin_pct', p_admin_pct, 'pool_pct', p_pool_pct);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_blueprint_revenue_split(numeric, numeric) TO authenticated;
`;

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  await c.query(SQL);
  const r = await c.query(`SELECT key, value FROM game_settings WHERE key IN ('blueprint_admin_pct','blueprint_pool_pct')`);
  console.log('Settings:', r.rows);
  const fns = await c.query(`SELECT proname FROM pg_proc WHERE proname IN ('admin_update_blueprint_revenue_split','purchase_ship_blueprint','purchase_blueprint_market_listing')`);
  console.log('Functions:', fns.rows);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
