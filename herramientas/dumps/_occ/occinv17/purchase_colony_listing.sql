CREATE OR REPLACE FUNCTION public.purchase_colony_listing(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_buyer uuid := auth.uid();
  v_listing market_listings%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_moon_id uuid;
  v_main_id uuid;
  v_ids uuid[];
  v_block text;
  v_coords text;
  v_total numeric;
  v_buyer_fxu numeric;
  v_pct numeric;
  v_fee numeric;
  v_seller_amount numeric;
  v_jackpot numeric;
  v_referral numeric;
  v_admin_fee numeric;
  v_referrer uuid;
  v_admin_id uuid;
  v_tx uuid;
  v_metal numeric := 0;
  v_crystal numeric := 0;
  v_deuterium numeric := 0;
  v_ships_moved bigint := 0;
  v_defenses_destroyed bigint := 0;
  v_fleets_redirected integer := 0;
  v_buyer_planets integer;
  v_astro integer;
  v_max_planets integer;
BEGIN
  IF v_buyer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_listing FROM market_listings
   WHERE id = p_listing_id AND status = 'active' AND listing_type = 'colony'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada o ya no esta activa');
  END IF;

  IF v_listing.purchasable_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta aun no esta disponible para compra.', 'cooldown_remaining', EXTRACT(EPOCH FROM (v_listing.purchasable_at - now()))::integer);
  END IF;

  IF v_listing.seller_id = v_buyer THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes comprar tu propia oferta');
  END IF;

  -- [COLMKT7] Limite de planetas por Astrofisica del comprador
  -- (misma regla que validate_fleet_mission). Se bloquea el perfil del
  -- comprador para que dos compras simultaneas no superen el limite.
  PERFORM 1 FROM profiles WHERE id = v_buyer FOR UPDATE;
  SELECT COUNT(*) INTO v_buyer_planets FROM planets
   WHERE user_id = v_buyer AND NOT is_destroyed AND planet_type = 'planet';
  SELECT COALESCE(MAX(ut.level), 0) INTO v_astro
    FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id
   WHERE ut.user_id = v_buyer AND tt.code = 'astrophysics';
  v_max_planets := 1 + FLOOR((v_astro + 1) / 2);
  IF v_buyer_planets >= v_max_planets THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Tienes %s de %s planetas que permite tu Astrofisica nivel %s. Para obtener una colonia mas sube Astrofisica a nivel %s.', v_buyer_planets, v_max_planets, v_astro, 2 * v_buyer_planets - 1),
      'requires_astrophysics_level', 2 * v_buyer_planets - 1);
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = v_listing.planet_id FOR UPDATE;
  IF NOT FOUND
     OR v_planet.user_id IS DISTINCT FROM v_listing.seller_id
     OR v_planet.planet_type IS DISTINCT FROM 'planet'
     OR v_planet.is_main_planet
     OR COALESCE(v_planet.is_destroyed, false) THEN
    UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
    RETURN jsonb_build_object('success', false, 'error', 'La colonia ya no pertenece al vendedor (oferta cancelada)');
  END IF;

  IF NOT is_user_plus(v_listing.seller_id) THEN
    UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = p_listing_id AND status = 'active';
    RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene VIP activo (oferta cancelada)');
  END IF;

  SELECT id INTO v_moon_id FROM planets
   WHERE user_id = v_listing.seller_id AND planet_type = 'moon' AND NOT COALESCE(is_destroyed, false)
     AND galaxy = v_planet.galaxy AND solar_system = v_planet.solar_system AND position = v_planet.position
   ORDER BY created_at LIMIT 1
   FOR UPDATE;

  v_block := _colony_sale_activity_block(v_listing.seller_id, v_planet.id, v_moon_id);
  IF v_block IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'La colonia no se puede transferir ahora (' || v_block || '). Intentalo mas tarde.');
  END IF;

  -- [COLMKT2] Planeta principal del vendedor: destino de sus naves y recursos
  SELECT id INTO v_main_id FROM planets
   WHERE user_id = v_listing.seller_id AND is_main_planet AND planet_type = 'planet'
     AND NOT COALESCE(is_destroyed, false) AND id <> v_planet.id
   ORDER BY created_at LIMIT 1
   FOR UPDATE;
  IF v_main_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'La colonia no se puede transferir ahora (el vendedor no tiene planeta principal). Intentalo mas tarde.');
  END IF;

  v_total := v_listing.total_price;
  IF v_total IS NULL OR v_total <= 0 OR v_total > 1000000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio invalido');
  END IF;

  SELECT fxu_balance INTO v_buyer_fxu FROM profiles WHERE id = v_buyer FOR UPDATE;
  IF COALESCE(v_buyer_fxu, 0) < v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  v_coords := '[' || v_planet.galaxy || ':' || v_planet.solar_system || ':' || v_planet.position || ']';
  v_ids := array_remove(ARRAY[v_planet.id, v_moon_id], NULL);

  -- [COLMKT3] Flotas en vuelo que salieron de la colonia/luna -> origen = planeta
  -- principal (al regresar descargan alli naves y carga). Va antes de mover las
  -- naves: process_fleet_arrival bloquea la flota (FOR UPDATE), asi que un regreso
  -- en curso termina primero y sus naves se recogen abajo, o lee ya el nuevo origen.
  UPDATE fleets SET origin_planet_id = v_main_id
   WHERE origin_planet_id = ANY (v_ids)
     AND user_id = v_listing.seller_id
     AND NOT COALESCE(is_completed, false);
  GET DIAGNOSTICS v_fleets_redirected = ROW_COUNT;

  -- [COLMKT3] Naves estacionadas en fortaleza / planeta tesoro con origen en la
  -- colonia/luna: al retirarlas vuelven al principal (mismo destino que el fallback actual)
  UPDATE fortress_ships SET origin_planet_id = v_main_id
   WHERE origin_planet_id = ANY (v_ids) AND user_id = v_listing.seller_id;
  UPDATE treasure_planet_ships SET origin_planet_id = v_main_id
   WHERE origin_planet_id = ANY (v_ids) AND user_id = v_listing.seller_id;

  -- Consolidar produccion pendiente con los bonus del vendedor antes del traspaso
  -- (bloquea las filas de planet_resources hasta el final de la transaccion)
  PERFORM calculate_and_sync_resources_internal(v_planet.id, v_listing.seller_id);
  IF v_moon_id IS NOT NULL THEN
    PERFORM calculate_and_sync_resources_internal(v_moon_id, v_listing.seller_id);
  END IF;
  PERFORM calculate_and_sync_resources_internal(v_main_id, v_listing.seller_id);

  -- Fee: mismo reparto que la venta de recursos (pool 50% / empresa / referido 20% de empresa)
  v_pct := get_market_fee_for_user(v_listing.seller_id);
  v_fee := v_total * (v_pct / 100);
  v_seller_amount := v_total - v_fee;
  v_jackpot := floor(v_fee * 50 / 100);

  SELECT referred_by INTO v_referrer FROM profiles WHERE id = v_listing.seller_id;
  IF v_referrer IS NOT NULL THEN
    v_referral := floor((v_fee - v_jackpot) * 20 / 100);
    v_admin_fee := v_fee - v_jackpot - v_referral;
  ELSE
    v_referral := 0;
    v_admin_fee := v_fee - v_jackpot;
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_total WHERE id = v_buyer;
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;
    PERFORM record_admin_revenue('market_fee', v_admin_fee,
      'Venta colonia ' || v_coords || ' (fee ' || v_pct || '%, admin ' || round(v_admin_fee / v_fee * 100) || '%)',
      v_listing.seller_id, p_listing_id);
  END IF;

  IF v_jackpot > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot, 'market_fee', v_listing.seller_id);
  END IF;

  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_buyer, v_listing.seller_id, 'colony', v_listing.item_code, 1, v_total)
  RETURNING id INTO v_tx;

  IF v_referrer IS NOT NULL AND v_referral >= 1 THEN
    UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral WHERE id = v_referrer;
    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
    VALUES (v_referrer, v_listing.seller_id, v_tx, 'market_referral', 'fxu', v_referral, v_referral);
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (v_referrer, v_listing.seller_id, 'Comision de referido por venta en mercado',
            'Has recibido ' || ROUND(v_referral, 2) || ' FXU como comision por la venta de tu referido en el mercado.', 'system');
  END IF;

  -- [COLMKT2] Naves de la colonia y su luna -> planeta principal del vendedor
  -- (DELETE ... RETURNING en una sola sentencia: toma la cantidad vigente de cada fila)
  WITH moved AS (
    DELETE FROM planet_ships WHERE planet_id = ANY (v_ids)
    RETURNING ship_type_id, quantity
  ), ins AS (
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    SELECT v_main_id, ship_type_id, SUM(quantity)
      FROM moved WHERE quantity > 0
     GROUP BY ship_type_id
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity
    RETURNING 1
  )
  SELECT COALESCE(SUM(quantity) FILTER (WHERE quantity > 0), 0) INTO v_ships_moved FROM moved;

  -- [COLMKT2] Recursos almacenados de la colonia y su luna -> planeta principal
  -- (filas ya bloqueadas por calculate_and_sync_resources_internal; last_update
  --  no se toca para no contarlo como recoleccion en misiones diarias)
  SELECT COALESCE(SUM(metal), 0), COALESCE(SUM(crystal), 0), COALESCE(SUM(deuterium), 0)
    INTO v_metal, v_crystal, v_deuterium
    FROM planet_resources WHERE planet_id = ANY (v_ids);

  UPDATE planet_resources
     SET metal = metal + v_metal, crystal = crystal + v_crystal, deuterium = deuterium + v_deuterium
   WHERE planet_id = v_main_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'planet_resources del planeta principal no encontrado';
  END IF;

  UPDATE planet_resources SET metal = 0, crystal = 0, deuterium = 0
   WHERE planet_id = ANY (v_ids);

  -- [COLMKT2] Defensas de la colonia y su luna: se destruyen
  WITH destroyed AS (
    DELETE FROM planet_defenses WHERE planet_id = ANY (v_ids)
    RETURNING quantity
  )
  SELECT COALESCE(SUM(quantity), 0) INTO v_defenses_destroyed FROM destroyed;

  -- Cerrar la oferta ANTES del traspaso (el trigger de perdida de planeta
  -- cancela las demas ofertas activas del vendedor ligadas a la colonia/luna)
  PERFORM set_config('xnova.colony_market_op', 'purchase', true);
  UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  PERFORM set_config('xnova.colony_market_op', '', true);

  -- Traspaso
  DELETE FROM ai_planet_custom_orders WHERE planet_id = ANY (v_ids);
  UPDATE planets SET user_id = v_buyer WHERE id = ANY (v_ids);

  INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
  VALUES (v_buyer, v_buyer, 'Colonia comprada',
          'Has comprado la colonia ' || COALESCE(v_planet.name, 'Colonia') || ' ' || v_coords
          || CASE WHEN v_moon_id IS NOT NULL THEN ' (con su luna)' ELSE '' END
          || ' por ' || ROUND(v_total, 2) || ' TUNG. La recibes sin naves ni defensas y con los recursos en 0;'
          || ' a partir de ahora producira segun el nivel de sus minas.', 'system');

  INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
  VALUES (v_listing.seller_id, v_listing.seller_id, 'Colonia vendida',
          'Tu colonia ' || COALESCE(v_planet.name, 'Colonia') || ' ' || v_coords
          || CASE WHEN v_moon_id IS NOT NULL THEN ' (con su luna)' ELSE '' END
          || ' se vendio por ' || ROUND(v_total, 2) || ' TUNG. Recibiste ' || ROUND(v_seller_amount, 2)
          || ' TUNG (fee ' || v_pct || '%).'
          || ' Se enviaron a tu planeta principal ' || v_ships_moved || ' naves y '
          || floor(v_metal) || ' metal, ' || floor(v_crystal) || ' cristal y ' || floor(v_deuterium) || ' deuterio.'
          || CASE WHEN v_defenses_destroyed > 0 THEN ' Se destruyeron ' || v_defenses_destroyed || ' defensas.' ELSE '' END
          || CASE WHEN v_fleets_redirected > 0 THEN ' ' || v_fleets_redirected || ' flota(s) en vuelo regresaran a tu planeta principal.' ELSE '' END,
          'system');

  RETURN jsonb_build_object(
    'success', true,
    'colony', true,
    'planet_id', v_planet.id,
    'moon_included', v_moon_id IS NOT NULL,
    'quantity', 1,
    'total_price', v_total,
    'jackpot_contribution', v_jackpot,
    'fee_percent', v_pct
  );
END;
$function$

