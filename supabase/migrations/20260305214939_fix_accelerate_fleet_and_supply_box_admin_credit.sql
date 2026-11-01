/*
  # Fix accelerate_fleet and purchase_supply_box admin FXU credit

  ## Problem
  1. `accelerate_fleet`: Deducts FXU from player and records admin_revenue, but NEVER credits
     the admin's fxu_balance with the revenue portion (non-jackpot part).
     - 1,262 transactions totaling 1,383,231 FXU recorded but never credited.
  2. `purchase_supply_box`: Deducts FXU from player and records admin_revenue, but NEVER credits
     the admin's fxu_balance.
     - 13 transactions totaling 387,000 FXU recorded but never credited.

  ## Changes
  1. Recreate `accelerate_fleet` with admin FXU credit added
  2. Recreate `purchase_supply_box` with admin FXU credit added
  3. Credit historical missing FXU to admin account (1,383,231 + 387,000 = 1,770,231 FXU)

  ## Security
  - No RLS changes
  - Uses existing _internal_set_fxu_context pattern
*/

-- ============================================================
-- 1. FIX accelerate_fleet: add admin fxu_balance credit
-- ============================================================
CREATE OR REPLACE FUNCTION accelerate_fleet(p_fleet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
v_user_id uuid;
v_fleet fleets%ROWTYPE;
v_fxu_cost integer;
v_current_fxu numeric;
v_jackpot_percent numeric;
v_jackpot_amount numeric;
v_revenue_amount numeric;
v_target_planet planets%ROWTYPE;
v_defender_id uuid;
v_origin_coords text;
v_is_hostile boolean;
v_one_way_flight_interval interval;
v_admin_id uuid;
BEGIN
v_user_id := auth.uid();

IF v_user_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
END IF;

SELECT * INTO v_fleet
FROM fleets
WHERE id = p_fleet_id
FOR UPDATE;

IF v_fleet IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada');
END IF;

IF v_fleet.user_id != v_user_id THEN
RETURN jsonb_build_object('success', false, 'error', 'No eres el propietario de esta flota');
END IF;

IF v_fleet.is_completed THEN
RETURN jsonb_build_object('success', false, 'error', 'La flota ya ha llegado');
END IF;

IF v_fleet.acs_id IS NOT NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'No se puede acelerar flotas en ataque grupal (ACS)');
END IF;

v_fxu_cost := calculate_fxu_cost_fleet(p_fleet_id);

IF v_fxu_cost <= 0 THEN
RETURN jsonb_build_object('success', false, 'error', 'La flota esta a punto de llegar');
END IF;

SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
RETURN jsonb_build_object(
'success', false,
'error', 'FXU insuficiente. Necesitas ' || v_fxu_cost || ' FXU (tienes ' || COALESCE(v_current_fxu, 0)::integer || ')'
);
END IF;

SELECT COALESCE(value::numeric, 49) INTO v_jackpot_percent
FROM game_settings WHERE key = 'fleet_acceleration_jackpot_percent';

IF v_jackpot_percent < 0 THEN v_jackpot_percent := 0; END IF;
IF v_jackpot_percent > 100 THEN v_jackpot_percent := 100; END IF;

v_jackpot_amount := FLOOR(v_fxu_cost * v_jackpot_percent / 100);
v_revenue_amount := v_fxu_cost - v_jackpot_amount;

PERFORM _internal_set_fxu_context();

UPDATE profiles
SET fxu_balance = fxu_balance - v_fxu_cost
WHERE id = v_user_id;

SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
IF v_admin_id IS NOT NULL AND v_revenue_amount > 0 AND v_admin_id != v_user_id THEN
  UPDATE profiles SET fxu_balance = fxu_balance + v_revenue_amount WHERE id = v_admin_id;
END IF;

IF v_revenue_amount > 0 THEN
INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
VALUES ('fleet_acceleration', v_revenue_amount, v_user_id,
'Aceleracion de flota ' || v_fleet.mission_type ||
CASE WHEN v_fleet.is_returning THEN ' (regreso)' ELSE '' END
);
END IF;

IF v_jackpot_amount > 0 THEN
PERFORM contribute_to_jackpot(v_jackpot_amount, 'fleet_acceleration', v_user_id);
END IF;

v_is_hostile := v_fleet.mission_type IN ('attack', 'espionage', 'acs_attack') AND NOT v_fleet.is_returning;

IF v_is_hostile THEN
SELECT p.* INTO v_target_planet
FROM planets p
WHERE p.galaxy = v_fleet.target_galaxy
AND p.solar_system = v_fleet.target_system
AND p.position = v_fleet.target_position
LIMIT 1;

IF v_target_planet IS NOT NULL AND v_target_planet.user_id != v_user_id THEN
v_defender_id := v_target_planet.user_id;

SELECT '[' || p.galaxy || ':' || p.solar_system || ':' || p.position || ']' INTO v_origin_coords
FROM planets p WHERE p.id = v_fleet.origin_planet_id;

INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
v_defender_id,
'ALERTA: Flota hostil acelerada',
'Una flota hostil de tipo "' || v_fleet.mission_type || '" procedente de ' || COALESCE(v_origin_coords, 'coordenadas desconocidas') ||
' ha sido ACELERADA y llegara antes de lo previsto a tu planeta en [' ||
v_fleet.target_galaxy || ':' || v_fleet.target_system || ':' || v_fleet.target_position || '].' ||
E'\\n\\nPrepara tus defensas inmediatamente.',
'combat'
);
END IF;
END IF;

IF v_fleet.is_returning THEN
UPDATE fleets
SET return_time = now() - interval '1 second'
WHERE id = p_fleet_id;
ELSE
v_one_way_flight_interval := v_fleet.arrival_time - v_fleet.departure_time;

UPDATE fleets
SET arrival_time = now() - interval '1 second',
return_time = now() + v_one_way_flight_interval
WHERE id = p_fleet_id;
END IF;

PERFORM process_fleet_arrival(p_fleet_id);

RETURN jsonb_build_object(
'success', true,
'message', 'Flota acelerada exitosamente',
'fxu_spent', v_fxu_cost,
'jackpot_contribution', v_jackpot_amount
);
END;
$$;

-- ============================================================
-- 2. FIX purchase_supply_box: add admin fxu_balance credit
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_supply_box(p_box_code text, p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
  UPDATE profiles SET fxu_balance = fxu_balance + v_box.price_fxu WHERE id = v_admin_id;
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
VALUES ('supply_box', v_box.price_fxu, v_user_id, 'Compra: ' || v_box.name);

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

-- ============================================================
-- 3. Credit historical missing FXU to admin account
-- ============================================================
DO $$
DECLARE
  v_admin_id uuid;
  v_missing_fleet_accel numeric;
  v_missing_supply_box numeric;
  v_total_missing numeric;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin account found';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_missing_fleet_accel
  FROM admin_revenue WHERE revenue_type = 'fleet_acceleration';

  SELECT COALESCE(SUM(amount), 0) INTO v_missing_supply_box
  FROM admin_revenue WHERE revenue_type = 'supply_box';

  v_total_missing := v_missing_fleet_accel + v_missing_supply_box;

  IF v_total_missing > 0 THEN
    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    
    UPDATE profiles 
    SET fxu_balance = fxu_balance + v_total_missing 
    WHERE id = v_admin_id;
  END IF;
END $$;
