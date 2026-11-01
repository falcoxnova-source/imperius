CREATE OR REPLACE FUNCTION public.secure_rename_planet(p_planet_id uuid, p_new_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_planet record;
  v_cost integer;
  v_user_fxu numeric;
  v_is_plus boolean;
  v_admin_id uuid;
  v_final_cost integer;
  v_admin_amount integer;
  v_pool_amount integer;
  v_usd numeric;
  v_price numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_new_name IS NULL OR LENGTH(TRIM(p_new_name)) < 2 OR LENGTH(TRIM(p_new_name)) > 24 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre debe tener entre 2 y 24 caracteres');
  END IF;

  p_new_name := TRIM(p_new_name);

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado');
  END IF;

  IF v_planet.name = p_new_name THEN
    RETURN jsonb_build_object('success', true, 'message', 'Nombre sin cambios', 'cost', 0);
  END IF;

  IF v_planet.name_changed = false THEN
    UPDATE planets SET name = p_new_name, name_changed = true WHERE id = p_planet_id;
    RETURN jsonb_build_object('success', true, 'message', 'Planeta renombrado gratis (primera vez)', 'cost', 0);
  END IF;

  -- Costo base: USD dinamico (opcional) o TUNG clasico (fallback)
  SELECT NULLIF(value,'')::numeric INTO v_usd
  FROM game_settings WHERE key = 'fxu_rename_planet_cost_usd';
  v_price := get_live_tung_price_usd();

  IF v_usd IS NOT NULL AND v_usd > 0 AND v_price IS NOT NULL AND v_price > 0 THEN
    v_cost := GREATEST(1, CEIL(v_usd / v_price))::integer;
  ELSE
    SELECT COALESCE(value::integer, 100) INTO v_cost
    FROM game_settings WHERE key = 'fxu_rename_planet_cost';
    IF v_cost IS NULL THEN v_cost := 100; END IF;
  END IF;

  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_cost * 0.50);
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  IF v_user_fxu < v_final_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente. Necesitas ' || v_final_cost || ' FXU, tienes ' || v_user_fxu || ' FXU',
      'required', v_final_cost,
      'available', v_user_fxu
    );
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_final_cost WHERE id = v_user_id;

  v_pool_amount := FLOOR(v_final_cost * 0.50);
  v_admin_amount := v_final_cost - v_pool_amount;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue('planet_rename', v_admin_amount, 'Rename planet (50% admin): ' || v_planet.name || ' -> ' || p_new_name, v_user_id, p_planet_id);

  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'planet_rename', v_user_id);
  END IF;

  UPDATE planets SET name = p_new_name WHERE id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Planeta renombrado exitosamente',
    'cost', v_final_cost,
    'admin_share', v_admin_amount,
    'pool_share', v_pool_amount,
    'new_name', p_new_name,
    'vip_discount', v_is_plus
  );
END;
$function$

