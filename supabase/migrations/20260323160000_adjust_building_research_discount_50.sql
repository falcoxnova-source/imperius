-- ============================================================================
-- AJUSTE: Descuento VIP en edificios e investigaciones de 75% → 50%
-- ============================================================================
-- Antes: VIP pagaba 25% del coste (75% descuento) → * 0.25
-- Ahora: VIP paga 50% del coste (50% descuento) → * 0.50
-- Afecta: calculate_fxu_cost_building, calculate_fxu_cost_research,
--         instant_complete_research
-- ============================================================================

-- 1. calculate_fxu_cost_building: 75% → 50%
CREATE OR REPLACE FUNCTION calculate_fxu_cost_building(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_building_type building_types%ROWTYPE;
  v_seconds_remaining integer;
  v_total_build_time integer;
  v_time_ratio numeric;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
  v_cost_factor numeric;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;

  IF v_queue IS NULL THEN
    RETURN 0;
  END IF;

  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue.end_time - now()))::integer);

  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;

  v_total_build_time := GREATEST(1, EXTRACT(EPOCH FROM (v_queue.end_time - v_queue.start_time))::integer);
  v_time_ratio := v_seconds_remaining::numeric / v_total_build_time::numeric;

  SELECT * INTO v_building_type FROM building_types WHERE id = v_queue.building_type_id;

  v_cost_factor := COALESCE(v_building_type.cost_factor::numeric, 1.5);

  v_metal_cost := FLOOR(COALESCE(v_building_type.base_metal, 0) * POWER(v_cost_factor, v_queue.target_level - 1));
  v_crystal_cost := FLOOR(COALESCE(v_building_type.base_crystal, 0) * POWER(v_cost_factor, v_queue.target_level - 1));
  v_deut_cost := FLOOR(COALESCE(v_building_type.base_deuterium, 0) * POWER(v_cost_factor, v_queue.target_level - 1));

  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);

  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_building';

  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 5000;
  END IF;

  v_fxu_cost := v_resource_value / v_fxu_ratio;
  v_fxu_cost := v_fxu_cost * v_time_ratio;

  -- VIP discount: 50% off building acceleration (changed from 75%)
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL AND is_user_plus(v_user_id) THEN
    v_fxu_cost := v_fxu_cost * 0.50;
  END IF;

  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- 2. calculate_fxu_cost_research: 75% → 50%
CREATE OR REPLACE FUNCTION calculate_fxu_cost_research(p_technology_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tech user_technologies%ROWTYPE;
  v_tech_type technology_types%ROWTYPE;
  v_seconds_remaining integer;
  v_total_research_time integer;
  v_time_ratio numeric;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_tech FROM user_technologies WHERE id = p_technology_id;

  IF v_tech IS NULL OR NOT v_tech.is_researching THEN
    RETURN 0;
  END IF;

  IF v_tech.research_end_time IS NULL THEN
    RETURN 1;
  END IF;

  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_tech.research_end_time - now()))::integer);

  IF v_seconds_remaining <= 0 THEN
    RETURN 1;
  END IF;

  IF v_tech.research_start_time IS NOT NULL THEN
    v_total_research_time := GREATEST(1, EXTRACT(EPOCH FROM (v_tech.research_end_time - v_tech.research_start_time))::integer);
  ELSE
    v_total_research_time := v_seconds_remaining;
  END IF;

  v_time_ratio := LEAST(1, GREATEST(0.01, v_seconds_remaining::numeric / v_total_research_time::numeric));

  SELECT * INTO v_tech_type FROM technology_types WHERE id = v_tech.technology_type_id;

  IF v_tech_type IS NULL THEN
    RETURN 1;
  END IF;

  v_metal_cost := FLOOR(COALESCE(v_tech_type.base_metal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_crystal_cost := FLOOR(COALESCE(v_tech_type.base_crystal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_deut_cost := FLOOR(COALESCE(v_tech_type.base_deuterium, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));

  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);

  IF v_resource_value <= 0 THEN
    RETURN 1;
  END IF;

  SELECT COALESCE(value::numeric, 3000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_research';

  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 3000;
  END IF;

  v_fxu_cost := v_resource_value / v_fxu_ratio;
  v_fxu_cost := v_fxu_cost * v_time_ratio;

  -- VIP discount: 50% off research acceleration (changed from 75%)
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL AND is_user_plus(v_user_id) THEN
    v_fxu_cost := v_fxu_cost * 0.50;
  END IF;

  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- 3. instant_complete_research: 75% → 50% (inline cost calc)
CREATE OR REPLACE FUNCTION instant_complete_research(p_technology_type_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item record;
  v_tech record;
  v_tech_type technology_types%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
  v_seconds_remaining integer;
  v_total_research_time integer;
  v_time_ratio numeric;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_resource_value numeric;
  v_fxu_ratio numeric;
BEGIN
  v_user_id := auth.uid();
  IF is_user_in_vacation_mode(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use instant complete while in vacation mode');
  END IF;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_queue_item FROM research_queue
  WHERE user_id = v_user_id AND technology_type_id = p_technology_type_id AND status = 'in_progress' LIMIT 1;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay investigacion en progreso');
  END IF;

  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now()))::integer);

  IF v_seconds_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already complete');
  END IF;

  SELECT * INTO v_tech_type FROM technology_types WHERE id = p_technology_type_id;

  IF v_tech_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology type not found');
  END IF;

  v_total_research_time := GREATEST(1, EXTRACT(EPOCH FROM (v_queue_item.end_time - v_queue_item.start_time))::integer);
  v_time_ratio := LEAST(1, GREATEST(0.01, v_seconds_remaining::numeric / v_total_research_time::numeric));

  v_metal_cost := FLOOR(COALESCE(v_tech_type.base_metal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_queue_item.target_level - 1));
  v_crystal_cost := FLOOR(COALESCE(v_tech_type.base_crystal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_queue_item.target_level - 1));
  v_deut_cost := FLOOR(COALESCE(v_tech_type.base_deuterium, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_queue_item.target_level - 1));

  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);

  SELECT COALESCE(value::numeric, 3000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_research';
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 3000;
  END IF;

  v_fxu_cost := GREATEST(1, CEIL((v_resource_value / v_fxu_ratio) * v_time_ratio))::integer;

  -- VIP discount: 50% off (changed from 75%)
  IF is_user_plus(v_user_id) THEN
    v_fxu_cost := GREATEST(1, CEIL(v_fxu_cost * 0.50))::integer;
  END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_fxu_cost);
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue('instant_research', v_fxu_cost,
    'Investigacion: ' || v_tech_type.name, v_user_id, v_queue_item.id);

  INSERT INTO user_technologies (user_id, technology_type_id, level)
  VALUES (v_user_id, p_technology_type_id, v_queue_item.target_level)
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET level = v_queue_item.target_level;

  DELETE FROM research_queue WHERE id = v_queue_item.id;

  UPDATE research_queue SET status = 'in_progress', start_time = now(), end_time = now() + (end_time - start_time)
  WHERE user_id = v_user_id AND status = 'pending'
  AND queue_position = (SELECT MIN(queue_position) FROM research_queue WHERE user_id = v_user_id AND status = 'pending');

  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_queue_item.target_level);
END;
$$;
