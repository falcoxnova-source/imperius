/*
  # Enforce global minimum price of 0.001 FXU on buy offers

  1. Changes
    - `create_buy_offer`: Changes the `p_price_per_unit <= 0` check to `p_price_per_unit < 0.001`
    - This ensures ships and dark_matter buy offers also respect the 0.001 minimum

  2. Reason
    - Consistent minimum price across all market operations (sell and buy)
*/

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

  IF p_price_per_unit < 0.001 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El precio minimo por unidad es 0.001 FXU', 'min_price', 0.001);
  END IF;

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
