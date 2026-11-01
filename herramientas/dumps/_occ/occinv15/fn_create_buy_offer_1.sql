CREATE OR REPLACE FUNCTION public.create_buy_offer(p_listing_type text, p_item_code text, p_quantity bigint, p_price_per_unit numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_total_price numeric;
  v_fxu_balance numeric;
  v_telegram_id bigint;
  v_is_member boolean;
  v_offer_id uuid;
  v_vacation boolean;
  v_pref jsonb;
  v_dyn_min numeric;
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

  IF p_listing_type NOT IN ('resource', 'ship') THEN
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

  -- Precio minimo DINAMICO (20% por debajo del promedio del mercado) para recurso y nave.
  IF p_listing_type IN ('resource', 'ship') THEN
    v_pref := get_market_price_reference(p_listing_type, p_item_code);
    v_dyn_min := (v_pref->>'min_price')::numeric;
    IF v_dyn_min IS NOT NULL AND p_price_per_unit < v_dyn_min THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'El precio minimo para ' || p_item_code || ' es ' || v_dyn_min || ' FXU (20% por debajo del promedio del mercado).',
        'min_price', v_dyn_min,
        'reference_avg', (v_pref->>'reference_avg')
      );
    END IF;
  END IF;

  -- Precio total minimo de 1 FXU para evitar microtransacciones.
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

  INSERT INTO market_buy_offers (buyer_id, listing_type, item_code, quantity, price_per_unit, total_price, status)
  VALUES (v_user_id, p_listing_type, p_item_code, p_quantity, p_price_per_unit, v_total_price, 'active')
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
$function$

