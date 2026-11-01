-- =====================================================================
-- Fix 1: Supply box revenue split 50% admin / 50% jackpot pools
-- Fix 2: Add 10 USDT (=100,000 FXU) to jackpot pools
-- =====================================================================

-- FIX 1: Modify purchase_supply_box to split revenue
CREATE OR REPLACE FUNCTION purchase_supply_box(p_box_code text, p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
v_user_id uuid;
v_box supply_boxes%ROWTYPE;
v_planet planets%ROWTYPE;
v_current_fxu numeric;
v_calculated jsonb;
v_synced_metal numeric;
v_synced_crystal numeric;
v_synced_deuterium numeric;
v_admin_id uuid;
v_admin_amount numeric;
v_pool_amount numeric;
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

SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

IF v_current_fxu IS NULL OR v_current_fxu < v_box.price_fxu THEN
RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_box.price_fxu || ' FXU');
END IF;

v_calculated := calculate_planet_resources(p_planet_id);

IF v_calculated ? 'error' THEN
RETURN jsonb_build_object('success', false, 'error', 'Error calculando recursos del planeta');
END IF;

v_synced_metal := (v_calculated->>'metal')::numeric;
v_synced_crystal := (v_calculated->>'crystal')::numeric;
v_synced_deuterium := (v_calculated->>'deuterium')::numeric;

UPDATE planet_resources
SET 
metal = v_synced_metal,
crystal = v_synced_crystal,
deuterium = v_synced_deuterium,
metal_per_hour = (v_calculated->>'metal_per_hour')::numeric,
crystal_per_hour = (v_calculated->>'crystal_per_hour')::numeric,
deuterium_per_hour = (v_calculated->>'deuterium_per_hour')::numeric,
metal_storage = (v_calculated->>'metal_storage')::numeric,
crystal_storage = (v_calculated->>'crystal_storage')::numeric,
deuterium_storage = (v_calculated->>'deuterium_storage')::numeric,
energy_used = (v_calculated->>'energy_used')::numeric,
energy_max = (v_calculated->>'energy_max')::numeric,
last_update = now()
WHERE planet_id = p_planet_id;

PERFORM _internal_set_fxu_context();

UPDATE profiles 
SET fxu_balance = fxu_balance - v_box.price_fxu 
WHERE id = v_user_id;

-- 50% admin / 50% jackpot pools
v_admin_amount := FLOOR(v_box.price_fxu * 0.50);
v_pool_amount := v_box.price_fxu - v_admin_amount;

SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id AND v_admin_amount > 0 THEN
  UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
END IF;

IF v_pool_amount > 0 THEN
  PERFORM contribute_to_jackpot(v_pool_amount, 'supply_box', v_user_id);
END IF;

UPDATE planet_resources
SET 
metal = v_synced_metal + v_box.metal_amount,
crystal = v_synced_crystal + v_box.crystal_amount,
deuterium = v_synced_deuterium + v_box.deuterium_amount,
last_update = now()
WHERE planet_id = p_planet_id;

INSERT INTO supply_box_purchases (user_id, planet_id, box_id, box_name, metal_received, crystal_received, deuterium_received, fxu_paid)
VALUES (v_user_id, p_planet_id, v_box.id, v_box.name, v_box.metal_amount, v_box.crystal_amount, v_box.deuterium_amount, v_box.price_fxu);

INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
VALUES ('supply_box', v_admin_amount, v_user_id, 'Caja 50% admin: ' || v_box.name);

RETURN jsonb_build_object(
'success', true,
'message', 'Caja comprada! Recursos agregados a ' || v_planet.name,
'metal', v_box.metal_amount,
'crystal', v_box.crystal_amount,
'deuterium', v_box.deuterium_amount,
'fxu_spent', v_box.price_fxu,
'storage_limited', false
);
END;
$$;

-- FIX 2: Add 10 USDT (100,000 FXU) to jackpot pools distributed by %
DO $$
DECLARE
  v_total bigint := 100000;
  v_exp bigint := FLOOR(v_total * 0.10);
  v_mon bigint := FLOOR(v_total * 0.20);
  v_plus bigint := FLOOR(v_total * 0.20);
  v_dest bigint := v_total - v_exp - v_mon - v_plus;
BEGIN
  UPDATE jackpot_pools
  SET expedition_balance = expedition_balance + v_exp,
      expedition_total = expedition_total + v_exp,
      monthly_balance = monthly_balance + v_mon,
      monthly_total = monthly_total + v_mon,
      plus_balance = plus_balance + v_plus,
      plus_total = plus_total + v_plus,
      destruction_balance = destruction_balance + v_dest,
      destruction_total = destruction_total + v_dest
  WHERE id = 1;

  UPDATE jackpot SET balance = balance + v_total WHERE id = 1;
END;
$$;
