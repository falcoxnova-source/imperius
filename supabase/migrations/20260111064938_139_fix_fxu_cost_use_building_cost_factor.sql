/*
  # Fix FXU Cost Functions to Use Correct Cost Factor
  
  ## Problem
  The calculate_fxu_cost_building function was using hardcoded 1.5 as cost factor
  instead of reading the actual cost_factor from building_types table.
  
  ## Solution
  Use v_building_type.cost_factor instead of hardcoded 1.5
*/

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
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
  v_cost_factor numeric;
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  
  IF v_queue IS NULL THEN
    RETURN 0;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue.end_time - now()))::integer);
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  SELECT * INTO v_building_type FROM building_types WHERE id = v_queue.building_type_id;
  
  -- Use the actual cost_factor from the building type (default 1.5 if not set)
  v_cost_factor := COALESCE(v_building_type.cost_factor::numeric, 1.5);
  
  -- Calculate actual resource cost at target level using the building's cost_factor
  v_metal_cost := FLOOR(COALESCE(v_building_type.base_metal, 0) * POWER(v_cost_factor, v_queue.target_level - 1));
  v_crystal_cost := FLOOR(COALESCE(v_building_type.base_crystal, 0) * POWER(v_cost_factor, v_queue.target_level - 1));
  v_deut_cost := FLOOR(COALESCE(v_building_type.base_deuterium, 0) * POWER(v_cost_factor, v_queue.target_level - 1));
  
  -- Calculate weighted resource value
  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);
  
  -- Get FXU ratio from admin settings
  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_building';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 5000;
  END IF;
  
  -- FXU cost = resource_value / ratio
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- Also fix the preview function
CREATE OR REPLACE FUNCTION preview_building_fxu_cost(
  p_building_type_id uuid,
  p_current_level integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_building_type building_types%ROWTYPE;
  v_target_level integer;
  v_metal_cost numeric;
  v_crystal_cost numeric;
  v_deuterium_cost numeric;
  v_total_resource_value numeric;
  v_fxu_ratio numeric;
  v_cost_factor numeric;
BEGIN
  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  
  IF v_building_type IS NULL THEN
    RETURN 0;
  END IF;
  
  v_target_level := p_current_level + 1;
  v_cost_factor := COALESCE(v_building_type.cost_factor::numeric, 1.5);
  
  v_metal_cost := COALESCE(v_building_type.base_metal, 0) * 
    POWER(v_cost_factor, v_target_level - 1);
  v_crystal_cost := COALESCE(v_building_type.base_crystal, 0) * 
    POWER(v_cost_factor, v_target_level - 1);
  v_deuterium_cost := COALESCE(v_building_type.base_deuterium, 0) * 
    POWER(v_cost_factor, v_target_level - 1);
  
  v_total_resource_value := v_metal_cost + (v_crystal_cost * 1.5) + (v_deuterium_cost * 3);
  
  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio 
  FROM game_settings WHERE key = 'fxu_cost_ratio_building';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 5000;
  END IF;
  
  RETURN GREATEST(1, CEIL(v_total_resource_value / v_fxu_ratio)::integer);
END;
$$;
