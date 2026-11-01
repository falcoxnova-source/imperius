CREATE OR REPLACE FUNCTION public.purchase_ship_blueprint(p_blueprint_code text, p_planet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     uuid;
  v_bp          ship_blueprints%ROWTYPE;
  v_balance     numeric;
  v_tung_usd    numeric;
  v_cost        numeric;
  v_owned       integer;
  v_usb_id      uuid;

  -- entrega de recursos
  v_grant_on    boolean := true;
  v_target      uuid;
  v_planet_name text;
  v_metal       numeric := 0;
  v_crystal     numeric := 0;
  v_deuterium   numeric := 0;
  v_calc        jsonb;
  v_granted     boolean := false;
  v_grant_note  text := NULL;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_bp
  FROM ship_blueprints
  WHERE code = p_blueprint_code AND is_active = true AND is_for_sale = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no disponible');
  END IF;

  -- CONSUMIBLE: se permite comprar varios planos (se apilan en el inventario).

  -- Coste en TUNG
  IF COALESCE(v_bp.price_usd, 0) > 0 THEN
    v_tung_usd := get_live_tung_price_usd();
    IF v_tung_usd IS NULL OR v_tung_usd <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Precio de TUNG no disponible en este momento, intenta mas tarde');
    END IF;
    v_cost := CEIL(v_bp.price_usd / v_tung_usd);
  ELSE
    v_cost := COALESCE(v_bp.price_fxu, 0);
  END IF;

  IF v_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este plano no tiene precio configurado');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance
  FROM profiles WHERE id = v_user_id FOR UPDATE;

  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente',
      'required', v_cost, 'balance', v_balance);
  END IF;

  -- ---------------------------------------------------------------
  -- Coste en recursos de la unidad (nave o defensa) que fabrica este plano
  -- ---------------------------------------------------------------
  SELECT COALESCE(st.metal_cost, 0), COALESCE(st.crystal_cost, 0), COALESCE(st.deuterium_cost, 0)
    INTO v_metal, v_crystal, v_deuterium
  FROM ship_types st WHERE st.id = v_bp.ship_type_id;

  IF NOT FOUND THEN
    SELECT COALESCE(dt.metal_cost, 0), COALESCE(dt.crystal_cost, 0), COALESCE(dt.deuterium_cost, 0)
      INTO v_metal, v_crystal, v_deuterium
    FROM defense_types dt WHERE dt.id = v_bp.defense_type_id;
  END IF;

  v_metal     := COALESCE(v_metal, 0);
  v_crystal   := COALESCE(v_crystal, 0);
  v_deuterium := COALESCE(v_deuterium, 0);

  SELECT COALESCE(NULLIF(lower(gs.value), ''), 'true') <> 'false'
    INTO v_grant_on
  FROM game_settings gs WHERE gs.key = 'blueprint_includes_resources';
  v_grant_on := COALESCE(v_grant_on, true);

  -- Planeta destino: el que envia el cliente, si no el principal, si no cualquiera
  IF v_grant_on AND (v_metal + v_crystal + v_deuterium) > 0 THEN
    SELECT p.id, p.name INTO v_target, v_planet_name
    FROM planets p
    WHERE p.user_id = v_user_id
      AND COALESCE(p.is_destroyed, false) = false
      AND (p_planet_id IS NULL OR p.id = p_planet_id)
    ORDER BY (p.id = p_planet_id) DESC, p.is_main_planet DESC, p.created_at ASC
    LIMIT 1;

    IF v_target IS NULL THEN
      SELECT p.id, p.name INTO v_target, v_planet_name
      FROM planets p
      WHERE p.user_id = v_user_id AND COALESCE(p.is_destroyed, false) = false
      ORDER BY p.is_main_planet DESC, p.created_at ASC
      LIMIT 1;
    END IF;

    IF v_target IS NULL THEN
      v_grant_note := 'Sin planeta disponible para depositar los recursos';
    END IF;
  ELSIF NOT v_grant_on THEN
    v_grant_note := 'Entrega de recursos desactivada por el administrador';
  END IF;

  -- ---------------------------------------------------------------
  -- Cobro
  -- ---------------------------------------------------------------
  PERFORM _internal_set_fxu_context();
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_cost
  WHERE id = v_user_id;

  -- Reparto global (Opcion B): 50% pool / 40% empresa / 10% referido
  PERFORM distribute_spend_fee(
    v_cost,
    'blueprint',
    'blueprint_sale',
    v_user_id,
    'Plano: ' || v_bp.code,
    NULL
  );

  -- ---------------------------------------------------------------
  -- Entrega de los recursos de fabricacion
  -- ---------------------------------------------------------------
  IF v_target IS NOT NULL THEN
    -- Se sincroniza produccion primero (mismo patron que purchase_supply_box)
    PERFORM 1 FROM planet_resources WHERE planet_id = v_target FOR UPDATE;
    v_calc := calculate_planet_resources(v_target);

    IF v_calc IS NULL OR v_calc ? 'error' THEN
      -- Sin sincronizar: suma relativa, nunca se pierde el deposito
      UPDATE planet_resources
      SET metal      = COALESCE(metal, 0)      + v_metal,
          crystal    = COALESCE(crystal, 0)    + v_crystal,
          deuterium  = COALESCE(deuterium, 0)  + v_deuterium,
          last_update = now()
      WHERE planet_id = v_target;
    ELSE
      UPDATE planet_resources
      SET metal       = (v_calc->>'metal')::numeric      + v_metal,
          crystal     = (v_calc->>'crystal')::numeric    + v_crystal,
          deuterium   = (v_calc->>'deuterium')::numeric  + v_deuterium,
          metal_per_hour     = (v_calc->>'metal_per_hour')::numeric,
          crystal_per_hour   = (v_calc->>'crystal_per_hour')::numeric,
          deuterium_per_hour = (v_calc->>'deuterium_per_hour')::numeric,
          metal_storage      = (v_calc->>'metal_storage')::numeric,
          crystal_storage    = (v_calc->>'crystal_storage')::numeric,
          deuterium_storage  = (v_calc->>'deuterium_storage')::numeric,
          energy_used        = (v_calc->>'energy_used')::numeric,
          energy_max         = (v_calc->>'energy_max')::numeric,
          last_update = now()
      WHERE planet_id = v_target;
    END IF;

    IF FOUND THEN
      v_granted := true;
    ELSE
      v_grant_note := 'El planeta no tiene fila de recursos';
    END IF;
  END IF;

  -- ---------------------------------------------------------------
  -- Registrar el plano (consumible: 1 fila = 1 uso)
  -- ---------------------------------------------------------------
  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    v_user_id,
    v_bp.id,
    'shop',
    jsonb_build_object(
      'price_usd',         v_bp.price_usd,
      'cost_tung',         v_cost,
      'resources_granted', v_granted,
      'granted_planet_id', v_target,
      'granted_metal',     CASE WHEN v_granted THEN v_metal     ELSE 0 END,
      'granted_crystal',   CASE WHEN v_granted THEN v_crystal   ELSE 0 END,
      'granted_deuterium', CASE WHEN v_granted THEN v_deuterium ELSE 0 END
    )
  )
  RETURNING id INTO v_usb_id;

  SELECT COUNT(*)::integer INTO v_owned
  FROM user_ship_blueprints
  WHERE user_id = v_user_id AND blueprint_id = v_bp.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN v_granted
                    THEN 'Plano comprado. Recursos depositados en ' || COALESCE(v_planet_name, 'tu planeta')
                    ELSE 'Plano comprado' END,
    'blueprint_code', v_bp.code,
    'cost', v_cost,
    'owned', v_owned,
    'resources_granted', v_granted,
    'planet_id', v_target,
    'planet_name', v_planet_name,
    'metal', CASE WHEN v_granted THEN v_metal     ELSE 0 END,
    'crystal', CASE WHEN v_granted THEN v_crystal   ELSE 0 END,
    'deuterium', CASE WHEN v_granted THEN v_deuterium ELSE 0 END,
    'note', v_grant_note
  );
END;
$function$

