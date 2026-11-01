/*
  # Fix Supply Box - Use planet_resources table

  1. Changes
    - Use planet_resources table instead of planets for resources
    - Use correct storage columns (metal_storage, crystal_storage, deuterium_storage)
*/

CREATE OR REPLACE FUNCTION purchase_supply_box(
  p_box_code text,
  p_planet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_box supply_boxes%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_resources planet_resources%ROWTYPE;
  v_current_fxu numeric;
  v_metal_to_add bigint;
  v_crystal_to_add bigint;
  v_deuterium_to_add bigint;
  v_metal_space bigint;
  v_crystal_space bigint;
  v_deuterium_space bigint;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Get box details
  SELECT * INTO v_box FROM supply_boxes WHERE code = p_box_code AND is_active = true;
  
  IF v_box.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caja no encontrada o no disponible');
  END IF;

  -- Verify planet ownership
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
  
  IF v_planet.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado o no te pertenece');
  END IF;

  -- Get planet resources
  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  
  IF v_resources.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos del planeta no encontrados');
  END IF;

  -- Check FXU balance
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_current_fxu IS NULL OR v_current_fxu < v_box.price_fxu THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_box.price_fxu || ' FXU');
  END IF;

  -- Calculate available space for each resource
  v_metal_space := GREATEST(0, v_resources.metal_storage - FLOOR(v_resources.metal)::bigint);
  v_crystal_space := GREATEST(0, v_resources.crystal_storage - FLOOR(v_resources.crystal)::bigint);
  v_deuterium_space := GREATEST(0, v_resources.deuterium_storage - FLOOR(v_resources.deuterium)::bigint);
  
  -- Cap resources by available space
  v_metal_to_add := LEAST(v_box.metal_amount, v_metal_space);
  v_crystal_to_add := LEAST(v_box.crystal_amount, v_crystal_space);
  v_deuterium_to_add := LEAST(v_box.deuterium_amount, v_deuterium_space);

  -- Set FXU context to allow deduction
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Deduct FXU from user
  UPDATE profiles 
  SET fxu_balance = fxu_balance - v_box.price_fxu 
  WHERE id = v_user_id;

  -- Clear context
  PERFORM set_config('fxu.allow_update_9x7k2m', '', true);

  -- Add resources to planet (capped by storage)
  UPDATE planet_resources
  SET 
    metal = metal + v_metal_to_add,
    crystal = crystal + v_crystal_to_add,
    deuterium = deuterium + v_deuterium_to_add,
    last_update = now()
  WHERE planet_id = p_planet_id;

  -- Record purchase with actual amounts received
  INSERT INTO supply_box_purchases (user_id, planet_id, box_id, box_name, metal_received, crystal_received, deuterium_received, fxu_paid)
  VALUES (v_user_id, p_planet_id, v_box.id, v_box.name, v_metal_to_add, v_crystal_to_add, v_deuterium_to_add, v_box.price_fxu);

  -- Record as admin revenue
  INSERT INTO admin_revenue (type, amount, user_id, description)
  VALUES ('supply_box', v_box.price_fxu, v_user_id, 'Compra: ' || v_box.name);

  -- Build response message
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Caja comprada! Recursos agregados a ' || v_planet.name,
    'metal', v_metal_to_add,
    'crystal', v_crystal_to_add,
    'deuterium', v_deuterium_to_add,
    'fxu_spent', v_box.price_fxu,
    'storage_limited', (v_metal_to_add < v_box.metal_amount OR v_crystal_to_add < v_box.crystal_amount OR v_deuterium_to_add < v_box.deuterium_amount)
  );
END;
$$;
