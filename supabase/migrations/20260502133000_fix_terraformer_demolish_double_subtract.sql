-- =====================================================================
-- FIX: Terraformador no debe descontar fields_max dos veces al demoler.
--
-- Root cause:
-- - secure_demolish_building baja nivel de terraformer (dispara trigger
--   update_planet_fields_on_terraformer que recalcula fields_max)
-- - luego volvía a restar manualmente el bonus del terraformer
--   => doble descuento.
--
-- Efecto:
-- - planets.fields_max podía quedar por debajo del valor real.
-- - casos visibles como 185/176 en planeta 2:14:4.
--
-- Este fix:
-- 1) Corrige secure_demolish_building para NO restar fields_max manualmente
--    en terraformer (el trigger ya recalcula).
-- 2) Repara datos existentes en planetas (no lunas) con recálculo masivo.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.secure_demolish_building(p_planet_id uuid, p_building_type_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_planet planets%ROWTYPE; v_building planet_buildings%ROWTYPE; v_building_type building_types%ROWTYPE;
  v_queue_count integer; v_current_level integer;
  v_refund_metal bigint; v_refund_crystal bigint; v_refund_deuterium bigint;
  v_fields_decrease integer := 0; v_fxu_fee numeric; v_user_fxu numeric; v_admin_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF is_user_in_vacation_mode(auth.uid()) THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while in vacation mode'); END IF;

  SELECT COALESCE(value::numeric, 0) INTO v_fxu_fee FROM game_settings WHERE key = 'fxu_demolish_fee';
  IF v_fxu_fee IS NULL THEN v_fxu_fee := 0; END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned'); END IF;
  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Building type not found'); END IF;
  SELECT * INTO v_building FROM planet_buildings WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;
  IF NOT FOUND OR COALESCE(v_building.level,0) <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Building not found or already at level 0'); END IF;
  v_current_level := v_building.level;
  SELECT COUNT(*) INTO v_queue_count FROM building_queue WHERE planet_id = p_planet_id;
  IF v_queue_count > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while construction queue is active'); END IF;
  IF v_building.is_upgrading THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while building is upgrading'); END IF;

  IF v_fxu_fee > 0 THEN
    SELECT COALESCE(fxu_balance,0) INTO v_user_fxu FROM profiles WHERE id = auth.uid();
    IF v_user_fxu < v_fxu_fee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU. Required: ' || v_fxu_fee::text || ', Available: ' || v_user_fxu::text);
    END IF;
    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = auth.uid();
    v_admin_id := get_admin_account_id();
    IF v_admin_id IS NOT NULL THEN UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id; END IF;
  END IF;

  v_refund_metal := FLOOR(v_building_type.base_metal * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);
  v_refund_crystal := FLOOR(v_building_type.base_crystal * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);
  v_refund_deuterium := FLOOR(v_building_type.base_deuterium * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);

  UPDATE planet_buildings SET level = v_current_level - 1 WHERE id = v_building.id;
  UPDATE planet_resources SET metal = metal + v_refund_metal, crystal = crystal + v_refund_crystal,
    deuterium = deuterium + v_refund_deuterium, last_update = now() WHERE planet_id = p_planet_id;

  IF v_building_type.code = 'lunar_base' THEN
    v_fields_decrease := 3;
    UPDATE planets SET fields_used = GREATEST(0, fields_used - 1), fields_max = GREATEST(1, fields_max - v_fields_decrease) WHERE id = p_planet_id;
  ELSIF v_building_type.code = 'terraformer' THEN
    -- IMPORTANTE: trigger_update_fields_on_terraformer ya recalcula fields_max
    -- al cambiar level en planet_buildings. Aquí solo ajustamos fields_used.
    UPDATE planets SET fields_used = GREATEST(0, fields_used - 1) WHERE id = p_planet_id;
  ELSE
    UPDATE planets SET fields_used = GREATEST(0, fields_used - 1) WHERE id = p_planet_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_level', v_current_level - 1,
    'refund_metal', v_refund_metal, 'refund_crystal', v_refund_crystal,
    'refund_deuterium', v_refund_deuterium, 'fxu_charged', v_fxu_fee);
END;
$function$;

-- Repara fields_max en planetas (NO lunas) afectados por descuentos dobles.
WITH fixed AS (
  SELECT p.id,
         p.fields_used,
         p.fields_max AS old_max,
         public.calculate_planet_max_fields(p.id) AS calc_max,
         GREATEST(p.fields_used, public.calculate_planet_max_fields(p.id)) AS new_max
  FROM planets p
  WHERE p.planet_type <> 'moon'
)
UPDATE planets p
SET fields_max = f.new_max
FROM fixed f
WHERE p.id = f.id
  AND p.fields_max <> f.new_max;

-- Verificación rápida.
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM planets p
  WHERE p.planet_type <> 'moon'
    AND p.fields_max < public.calculate_planet_max_fields(p.id)
    AND p.fields_max < p.fields_used;

  IF v_bad > 0 THEN
    RAISE WARNING 'Quedan % planetas con fields_max por debajo de expected y used', v_bad;
  ELSE
    RAISE NOTICE 'OK: planetas reparados para fields_max';
  END IF;
END$$;
