CREATE OR REPLACE FUNCTION public.refill_colony_resources(p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_planet planets%ROWTYPE;
  v_price_usdt numeric;
  v_live_price numeric;
  v_current_fxu numeric;
  v_metal_init numeric; v_crystal_init numeric; v_deut_init numeric;
  v_metal_cur numeric; v_crystal_cur numeric; v_deut_cur numeric;
  v_total_init numeric; v_total_cur numeric;
  v_deficit numeric;
  v_cost_usdt numeric;
  v_cost_tung numeric;
BEGIN
  -- [COLMKT5] colonia en venta: bloqueada hasta cancelar la venta
  IF public._colony_listed_since(p_planet_id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.');
  END IF;
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Bloquea la fila para evitar doble cobro / condiciones de carrera.
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id FOR UPDATE;
  IF v_planet.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado o no te pertenece');
  END IF;

  v_metal_init   := COALESCE(v_planet.metal_initial_deposit, 0);
  v_crystal_init := COALESCE(v_planet.crystal_initial_deposit, 0);
  v_deut_init    := COALESCE(v_planet.deuterium_initial_deposit, 0);
  v_total_init   := v_metal_init + v_crystal_init + v_deut_init;

  IF v_planet.is_main_planet OR v_total_init <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia no usa el sistema de agotamiento');
  END IF;

  v_metal_cur   := LEAST(GREATEST(COALESCE(v_planet.metal_deposit, 0), 0), v_metal_init);
  v_crystal_cur := LEAST(GREATEST(COALESCE(v_planet.crystal_deposit, 0), 0), v_crystal_init);
  v_deut_cur    := LEAST(GREATEST(COALESCE(v_planet.deuterium_deposit, 0), 0), v_deut_init);
  v_total_cur   := v_metal_cur + v_crystal_cur + v_deut_cur;

  v_deficit := 1 - (v_total_cur / v_total_init);
  IF v_deficit < 0 THEN v_deficit := 0; END IF;

  IF v_deficit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La colonia ya tiene los recursos llenos');
  END IF;

  v_price_usdt := COALESCE((SELECT value::numeric FROM game_settings WHERE key = 'depletion_refill_price_usdt'), 10);
  v_cost_usdt := ROUND(v_price_usdt * v_deficit, 4);

  v_live_price := get_live_tung_price_usd();
  IF v_live_price IS NULL OR v_live_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio de TUNG no disponible, intenta de nuevo en unos segundos');
  END IF;

  v_cost_tung := CEIL(v_cost_usdt / v_live_price);
  IF v_cost_tung < 1 THEN v_cost_tung := 1; END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu IS NULL OR v_current_fxu < v_cost_tung THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente. Necesitas ' || v_cost_tung || ' TUNG');
  END IF;

  -- Cobro (trigger de proteccion de balance)
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  UPDATE profiles SET fxu_balance = fxu_balance - v_cost_tung WHERE id = v_user_id;
  PERFORM set_config('fxu.allow_update_9x7k2m', '', true);

  -- Restaura los depositos al 100% y reactiva la colonia.
  UPDATE planets SET
    metal_deposit     = v_metal_init,
    crystal_deposit   = v_crystal_init,
    deuterium_deposit = v_deut_init,
    planet_status     = 'active',
    depleted_at       = NULL,
    regenerates_at    = NULL
  WHERE id = p_planet_id;

  -- Reparto empresa/pool/referido del costo (revenue_type 'other' permitido por el CHECK)
  PERFORM distribute_spend_fee(v_cost_tung, 'colony_refill', 'other',
    v_user_id, 'Recarga de recursos: ' || v_planet.name, NULL);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Recursos recargados en ' || v_planet.name,
    'cost_tung', v_cost_tung,
    'cost_usdt', v_cost_usdt,
    'depletion_percent', ROUND(v_deficit * 100, 1)
  );
END;
$function$

