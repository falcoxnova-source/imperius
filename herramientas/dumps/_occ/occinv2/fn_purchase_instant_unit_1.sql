CREATE OR REPLACE FUNCTION public.purchase_instant_unit(p_code text, p_planet_id uuid, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid;
  v_offer      instant_unit_offers%ROWTYPE;
  v_qty        integer;
  v_planet_id  uuid;
  v_planet_name text;
  v_tung_usd   numeric;
  v_total_usd  numeric;
  v_cost       numeric;
  v_balance    numeric;
  v_max_planet integer;
  v_owned      bigint;
  v_unit_name  text;
BEGIN
  -- [COLMKT5] colonia en venta: bloqueada hasta cancelar la venta
  IF public._colony_listed_since(p_planet_id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.');
  END IF;
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Cantidad: entero estricto dentro del tope de la oferta
  v_qty := FLOOR(COALESCE(p_quantity, 0))::integer;
  IF v_qty <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad invalida');
  END IF;

  SELECT * INTO v_offer
  FROM instant_unit_offers
  WHERE code = p_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unidad no disponible en el astillero');
  END IF;

  IF v_qty > v_offer.max_per_order THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Maximo ' || v_offer.max_per_order || ' unidades por pedido');
  END IF;

  IF COALESCE(v_offer.price_usd, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta unidad no tiene precio configurado');
  END IF;

  -- Planeta destino: tiene que ser del comprador y estar operativo
  SELECT p.id, p.name INTO v_planet_id, v_planet_name
  FROM planets p
  WHERE p.id = p_planet_id
    AND p.user_id = v_user_id
    AND COALESCE(p.is_destroyed, false) = false;
  IF v_planet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no valido');
  END IF;

  -- Limites de la unidad (cupulas y plataformas)
  IF v_offer.item_type = 'defense' THEN
    SELECT dt.max_per_planet, dt.name INTO v_max_planet, v_unit_name
    FROM defense_types dt WHERE dt.id = v_offer.defense_type_id;

    IF v_max_planet IS NOT NULL AND v_max_planet > 0 THEN
      SELECT COALESCE(SUM(pd.quantity), 0) INTO v_owned
      FROM planet_defenses pd
      WHERE pd.planet_id = v_planet_id AND pd.defense_type_id = v_offer.defense_type_id;

      IF v_owned + v_qty > v_max_planet THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Limite alcanzado: maximo ' || v_max_planet || ' por planeta');
      END IF;
    END IF;

    -- Misma regla que el hangar: cupula planetaria/gigante, una por cuenta
    IF v_offer.defense_type_id IN (7, 8) THEN
      IF EXISTS (
        SELECT 1 FROM planet_defenses pd
        JOIN planets pl ON pl.id = pd.planet_id
        WHERE pl.user_id = v_user_id
          AND pd.defense_type_id = v_offer.defense_type_id
          AND pd.quantity > 0
      ) THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Ya posees esta cupula (solo se permite una por cuenta)');
      END IF;
      IF v_qty > 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo se permite una cupula por cuenta');
      END IF;
    END IF;
  ELSE
    SELECT st.name INTO v_unit_name FROM ship_types st WHERE st.id = v_offer.ship_type_id;
  END IF;

  -- Precio en TUNG al cambio vivo
  v_tung_usd := get_live_tung_price_usd();
  IF v_tung_usd IS NULL OR v_tung_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Precio de TUNG no disponible en este momento, intenta mas tarde');
  END IF;

  v_total_usd := v_offer.price_usd * v_qty;
  v_cost      := CEIL(v_total_usd / v_tung_usd);
  IF v_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Importe invalido');
  END IF;

  -- Serializa compras concurrentes del mismo comprador
  SELECT COALESCE(fxu_balance, 0) INTO v_balance
  FROM profiles WHERE id = v_user_id FOR UPDATE;

  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente',
      'required', v_cost, 'balance', v_balance);
  END IF;

  -- Cobro
  PERFORM _internal_set_fxu_context();
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_cost
  WHERE id = v_user_id;

  -- Reparto estandar: pool / empresa (y de ahi accionistas) / referido
  PERFORM distribute_spend_fee(
    v_cost,
    'instant_unit',
    'instant_unit_sale',
    v_user_id,
    'Astillero: ' || v_qty || 'x ' || COALESCE(v_unit_name, v_offer.name),
    NULL
  );

  -- Entrega inmediata
  IF v_offer.item_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_planet_id, v_offer.ship_type_id, v_qty)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
  ELSE
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    VALUES (v_planet_id, v_offer.defense_type_id, v_qty)
    ON CONFLICT (planet_id, defense_type_id)
    DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity;
  END IF;

  INSERT INTO instant_unit_purchases (
    user_id, planet_id, offer_code, item_type, ship_type_id, defense_type_id,
    quantity, unit_price_usd, total_usd, tung_price_usd, cost_tung
  ) VALUES (
    v_user_id, v_planet_id, v_offer.code, v_offer.item_type,
    v_offer.ship_type_id, v_offer.defense_type_id,
    v_qty, v_offer.price_usd, v_total_usd, v_tung_usd, v_cost
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', v_qty || 'x ' || COALESCE(v_unit_name, v_offer.name)
               || ' entregadas en ' || COALESCE(v_planet_name, 'tu planeta'),
    'code', v_offer.code,
    'item_type', v_offer.item_type,
    'quantity', v_qty,
    'cost', v_cost,
    'total_usd', v_total_usd,
    'planet_id', v_planet_id,
    'planet_name', v_planet_name
  );
END;
$function$

