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
  v_fields_decrease integer := 0;
BEGIN
  -- [COLMKT5] colonia en venta: bloqueada hasta cancelar la venta
  IF public._colony_listed_since(p_planet_id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.');
  END IF;
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF is_user_in_vacation_mode(auth.uid()) THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while in vacation mode'); END IF;

  -- Demoler es GRATIS: no se cobra ninguna comision en TUNG.

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
    -- al cambiar level en planet_buildings. Aqui solo ajustamos fields_used.
    UPDATE planets SET fields_used = GREATEST(0, fields_used - 1) WHERE id = p_planet_id;
  ELSE
    UPDATE planets SET fields_used = GREATEST(0, fields_used - 1) WHERE id = p_planet_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_level', v_current_level - 1,
    'refund_metal', v_refund_metal, 'refund_crystal', v_refund_crystal,
    'refund_deuterium', v_refund_deuterium, 'fxu_charged', 0);
END;
$function$

