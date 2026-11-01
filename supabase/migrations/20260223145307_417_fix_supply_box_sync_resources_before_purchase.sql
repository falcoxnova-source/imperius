/*
  # Fix supply box purchase - sync resources and block insufficient storage

  ## Problem
  The `purchase_supply_box` function reads stale resource values from
  `planet_resources` without first syncing production. This causes the
  storage space calculation to be incorrect, and users receive fewer
  resources than expected while paying the full FXU price.
  
  Additionally, the function silently caps resources by storage space
  without warning the user, leading to confusion and lost FXU.

  ## Fix
  1. Sync planet resources using `calculate_planet_resources()` before
     checking storage space
  2. Block the purchase entirely if the planet doesn't have at least 50%
     storage space available for any of the three resource types
  3. Show a clear error message telling the user to free up storage first

  ## Security
  - No security changes
*/

CREATE OR REPLACE FUNCTION public.purchase_supply_box(p_box_code text, p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
v_calculated jsonb;
v_synced_metal numeric;
v_synced_crystal numeric;
v_synced_deuterium numeric;
v_metal_storage numeric;
v_crystal_storage numeric;
v_deuterium_storage numeric;
BEGIN
v_user_id := auth.uid();

IF v_user_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
END IF;

SELECT * INTO v_box FROM supply_boxes WHERE code = p_box_code AND is_active = true;

IF v_box.id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Caja no encontrada o no disponible');
END IF;

SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;

IF v_planet.id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado o no te pertenece');
END IF;

v_calculated := calculate_planet_resources(p_planet_id);

IF v_calculated ? 'error' THEN
RETURN jsonb_build_object('success', false, 'error', 'Error calculando recursos del planeta');
END IF;

v_synced_metal := (v_calculated->>'metal')::numeric;
v_synced_crystal := (v_calculated->>'crystal')::numeric;
v_synced_deuterium := (v_calculated->>'deuterium')::numeric;
v_metal_storage := (v_calculated->>'metal_storage')::numeric;
v_crystal_storage := (v_calculated->>'crystal_storage')::numeric;
v_deuterium_storage := (v_calculated->>'deuterium_storage')::numeric;

UPDATE planet_resources
SET 
metal = v_synced_metal,
crystal = v_synced_crystal,
deuterium = v_synced_deuterium,
metal_per_hour = (v_calculated->>'metal_per_hour')::numeric,
crystal_per_hour = (v_calculated->>'crystal_per_hour')::numeric,
deuterium_per_hour = (v_calculated->>'deuterium_per_hour')::numeric,
metal_storage = v_metal_storage,
crystal_storage = v_crystal_storage,
deuterium_storage = v_deuterium_storage,
energy_used = (v_calculated->>'energy_used')::numeric,
energy_max = (v_calculated->>'energy_max')::numeric,
last_update = now()
WHERE planet_id = p_planet_id;

v_metal_space := GREATEST(0, v_metal_storage - FLOOR(v_synced_metal)::bigint);
v_crystal_space := GREATEST(0, v_crystal_storage - FLOOR(v_synced_crystal)::bigint);
v_deuterium_space := GREATEST(0, v_deuterium_storage - FLOOR(v_synced_deuterium)::bigint);

IF v_metal_space < (v_box.metal_amount * 0.5) OR 
   v_crystal_space < (v_box.crystal_amount * 0.5) OR 
   v_deuterium_space < (v_box.deuterium_amount * 0.5) THEN
RETURN jsonb_build_object(
'success', false, 
'error', 'Almacen insuficiente. Necesitas al menos 50% de espacio libre. Metal: ' || v_metal_space || '/' || v_box.metal_amount || ', Cristal: ' || v_crystal_space || '/' || v_box.crystal_amount || ', Deuterio: ' || v_deuterium_space || '/' || v_box.deuterium_amount
);
END IF;

v_metal_to_add := LEAST(v_box.metal_amount, v_metal_space);
v_crystal_to_add := LEAST(v_box.crystal_amount, v_crystal_space);
v_deuterium_to_add := LEAST(v_box.deuterium_amount, v_deuterium_space);

SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

IF v_current_fxu IS NULL OR v_current_fxu < v_box.price_fxu THEN
RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_box.price_fxu || ' FXU');
END IF;

PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

UPDATE profiles 
SET fxu_balance = fxu_balance - v_box.price_fxu 
WHERE id = v_user_id;

PERFORM set_config('fxu.allow_update_9x7k2m', '', true);

UPDATE planet_resources
SET 
metal = v_synced_metal + v_metal_to_add,
crystal = v_synced_crystal + v_crystal_to_add,
deuterium = v_synced_deuterium + v_deuterium_to_add,
last_update = now()
WHERE planet_id = p_planet_id;

INSERT INTO supply_box_purchases (user_id, planet_id, box_id, box_name, metal_received, crystal_received, deuterium_received, fxu_paid)
VALUES (v_user_id, p_planet_id, v_box.id, v_box.name, v_metal_to_add, v_crystal_to_add, v_deuterium_to_add, v_box.price_fxu);

INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
VALUES ('supply_box', v_box.price_fxu, v_user_id, 'Compra: ' || v_box.name);

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
$function$;
