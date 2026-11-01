/*
  # Fix instant_complete_research to use correct FXU cost calculation

  1. Problem
    - instant_complete_research used a time-bracket formula that produced
      very low FXU costs (e.g. <500 FXU for research worth 3000+ FXU)
    - calculate_fxu_cost_research already had the correct resource-value-based
      formula with time_ratio, but instant_complete_research didn't use it

  2. Fix
    - Replace the inline time-bracket formula in instant_complete_research(uuid)
      with a call to calculate_fxu_cost_research(p_technology_id) so the charged
      amount matches what the frontend previews
    - The overload instant_complete_research(integer) is also updated to use the
      same resource-based calculation for consistency
*/

CREATE OR REPLACE FUNCTION instant_complete_research(p_technology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '30s'
SET lock_timeout = '15s'
AS $$
DECLARE
  v_user_id uuid;
  v_tech_record record;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT ut.*, tt.name as tech_name, tt.id as type_id
  INTO v_tech_record
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.id = p_technology_id
    AND ut.user_id = v_user_id
    AND ut.is_researching = true
    AND ut.research_end_time IS NOT NULL;

  IF v_tech_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay investigacion en progreso');
  END IF;

  v_fxu_cost := calculate_fxu_cost_research(p_technology_id);

  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already complete');
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

  PERFORM record_admin_revenue(
    'instant_research',
    v_fxu_cost,
    'Investigacion: ' || v_tech_record.tech_name || ' Lv' || (v_tech_record.level + 1),
    v_user_id,
    p_technology_id
  );

  UPDATE user_technologies
  SET
    level = level + 1,
    is_researching = false,
    research_end_time = NULL,
    research_planet_id = NULL
  WHERE id = p_technology_id;

  PERFORM update_player_points_no_rank(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_tech_record.level + 1);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Error de base de datos: ' || SQLERRM);
END;
$$;


CREATE OR REPLACE FUNCTION instant_complete_research(p_technology_type_id integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
