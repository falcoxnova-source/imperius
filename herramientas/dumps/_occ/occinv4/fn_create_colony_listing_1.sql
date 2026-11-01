CREATE OR REPLACE FUNCTION public.create_colony_listing(p_planet_id uuid, p_price numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_planet planets%ROWTYPE;
  v_moon_id uuid;
  v_price numeric;
  v_block text;
  v_listing_id uuid;
  v_telegram_id bigint;
  v_is_member boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF p_planet_id IS NULL OR p_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Datos invalidos');
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND vacation_mode = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes usar el mercado en modo vacaciones. Desactiva el modo vacaciones primero.');
  END IF;

  SELECT telegram_id INTO v_telegram_id FROM telegram_links WHERE user_id = v_user_id;
  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes vincular tu cuenta de Telegram para usar el mercado. Ve a la seccion de Tareas para vincular tu cuenta.', 'requires_telegram', true);
  END IF;

  SELECT is_member INTO v_is_member FROM telegram_task_rewards WHERE user_id = v_user_id AND task_type = 'join_group';
  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes ser miembro del grupo de Telegram para usar el mercado. Unete al grupo desde la seccion de Tareas.', 'requires_telegram', true);
  END IF;

  IF NOT is_user_plus(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo los usuarios con VIP activo pueden vender colonias en el mercado.', 'requires_vip', true);
  END IF;

  v_price := round(p_price, 2);
  IF v_price <= 0 OR v_price > 1000000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio invalido');
  END IF;

  -- [COLMKT4] precio minimo en USD convertido a TUNG al precio en vivo
  DECLARE
    v_minp jsonb := get_colony_min_price();
  BEGIN
    IF (v_minp->>'min_tung') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Precio de TUNG no disponible en este momento. Intentalo mas tarde.');
    END IF;
    IF v_price < (v_minp->>'min_tung')::numeric THEN
      RETURN jsonb_build_object('success', false, 'error', 'El precio minimo para vender una colonia es ' || (v_minp->>'min_tung') || ' TUNG (~' || (v_minp->>'min_usd') || ' USD).', 'min_price', (v_minp->>'min_tung')::numeric);
    END IF;
  END;
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres dueno de este planeta');
  END IF;
  IF v_planet.planet_type IS DISTINCT FROM 'planet' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden vender colonias (la luna se incluye automaticamente con su planeta)');
  END IF;
  IF v_planet.is_main_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes vender tu planeta principal');
  END IF;
  IF COALESCE(v_planet.is_destroyed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este planeta no se puede vender');
  END IF;

  IF (SELECT COUNT(*) FROM market_listings WHERE seller_id = v_user_id AND status = 'active') >= 15 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximo 15 ofertas activas permitidas. Cancela o espera que se vendan algunas.');
  END IF;

  IF EXISTS (SELECT 1 FROM market_listings WHERE planet_id = v_planet.id AND listing_type = 'colony' AND status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia ya esta en venta');
  END IF;

  SELECT id INTO v_moon_id FROM planets
   WHERE user_id = v_user_id AND planet_type = 'moon' AND NOT COALESCE(is_destroyed, false)
     AND galaxy = v_planet.galaxy AND solar_system = v_planet.solar_system AND position = v_planet.position
   ORDER BY created_at LIMIT 1;

  v_block := _colony_sale_activity_block(v_user_id, v_planet.id, v_moon_id);
  IF v_block IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes publicar esta colonia: ' || v_block || '.');
  END IF;

  PERFORM set_config('xnova.colony_market_op', 'create', true);
  INSERT INTO market_listings (seller_id, listing_type, item_code, quantity, price_per_unit, total_price, planet_id, status)
  VALUES (v_user_id, 'colony',
          'Colonia [' || v_planet.galaxy || ':' || v_planet.solar_system || ':' || v_planet.position || ']',
          1, v_price, v_price, v_planet.id, 'active')
  RETURNING id INTO v_listing_id;
  PERFORM set_config('xnova.colony_market_op', '', true);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Colonia publicada en el mercado.' || CASE WHEN v_moon_id IS NOT NULL THEN ' Incluye su luna.' ELSE '' END,
    'listing_id', v_listing_id,
    'moon_included', v_moon_id IS NOT NULL
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia ya esta en venta');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al publicar la colonia: ' || SQLERRM);
END;
$function$

