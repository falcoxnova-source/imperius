-- ============================================================
-- VIP REQUIRED to sell blueprints in P2P market
-- ============================================================
-- Solo cuentas con VIP Plus activo pueden publicar planos a la venta.
-- Cualquiera puede CONSUMIR sus planos para construir naves o
-- conseguir nuevos en expediciones / tienda oficial.
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
  v_is_plus boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- ENFORCE: vendedor debe tener VIP Plus activo
  SELECT EXISTS (
    SELECT 1
    FROM plus_subscriptions ps
    WHERE ps.user_id = v_user_id
      AND ps.is_active = true
      AND ps.expires_at > NOW()
  ) INTO v_is_plus;

  IF NOT v_is_plus THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Solo cuentas con VIP Plus activo pueden vender planos en el mercado P2P'
    );
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
