/*
  # Fix FXU Cost Functions to Use Admin Ratios
  
  ## Problem
  The calculate_fxu_cost_building, calculate_fxu_cost_research, and calculate_fxu_cost_shipyard
  functions had hardcoded ratios instead of reading from game_settings.
  
  ## Solution
  Update all three functions to read the configurable ratios from game_settings table.
  
  ## Settings Used
  - fxu_cost_ratio_building: Resources per 1 FXU for buildings
  - fxu_cost_ratio_research: Resources per 1 FXU for research
  - fxu_cost_ratio_ships: Resources per 1 FXU for ships
  - fxu_cost_ratio_defense: Resources per 1 FXU for defense
*/

-- Building FXU cost - Now reads ratio from game_settings
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
  
  -- Calculate actual resource cost at target level (using xnova formula: base * 1.5^(level-1))
  v_metal_cost := FLOOR(COALESCE(v_building_type.base_metal, 0) * POWER(1.5, v_queue.target_level - 1));
  v_crystal_cost := FLOOR(COALESCE(v_building_type.base_crystal, 0) * POWER(1.5, v_queue.target_level - 1));
  v_deut_cost := FLOOR(COALESCE(v_building_type.base_deuterium, 0) * POWER(1.5, v_queue.target_level - 1));
  
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

-- Research FXU cost - Now reads ratio from game_settings
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
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
BEGIN
  SELECT * INTO v_tech FROM user_technologies WHERE id = p_technology_id;
  
  IF v_tech IS NULL OR NOT v_tech.is_researching THEN
    RETURN 0;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_tech.research_end_time - now()))::integer);
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  SELECT * INTO v_tech_type FROM technology_types WHERE id = v_tech.technology_type_id;
  
  -- Calculate actual resource cost for the level being researched
  v_metal_cost := FLOOR(COALESCE(v_tech_type.base_metal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_crystal_cost := FLOOR(COALESCE(v_tech_type.base_crystal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_deut_cost := FLOOR(COALESCE(v_tech_type.base_deuterium, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  
  -- Calculate weighted resource value
  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);
  
  -- Get FXU ratio from admin settings
  SELECT COALESCE(value::numeric, 3000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_research';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 3000;
  END IF;
  
  -- FXU cost = resource_value / ratio
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- Shipyard FXU cost - Now reads ratio from game_settings
CREATE OR REPLACE FUNCTION calculate_fxu_cost_shipyard(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue shipyard_queue%ROWTYPE;
  v_ship_type ship_types%ROWTYPE;
  v_defense_type defense_types%ROWTYPE;
  v_seconds_remaining integer;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_units_remaining integer;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
BEGIN
  SELECT * INTO v_queue FROM shipyard_queue WHERE id = p_queue_id;
  
  IF v_queue IS NULL THEN
    RETURN 0;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue.current_unit_end_time - now()))::integer);
  
  IF v_queue.quantity > v_queue.quantity_completed THEN
    v_seconds_remaining := v_seconds_remaining + 
      ((v_queue.quantity - v_queue.quantity_completed - 1) * v_queue.build_time_per_unit);
  END IF;
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Calculate remaining units (including current one being built)
  v_units_remaining := v_queue.quantity - v_queue.quantity_completed;
  
  -- Get cost per unit based on type
  IF v_queue.item_type = 'ship' THEN
    SELECT * INTO v_ship_type FROM ship_types WHERE id = v_queue.ship_type_id;
    v_metal_cost := COALESCE(v_ship_type.metal_cost, 0);
    v_crystal_cost := COALESCE(v_ship_type.crystal_cost, 0);
    v_deut_cost := COALESCE(v_ship_type.deuterium_cost, 0);
    
    -- Get FXU ratio for ships from admin settings
    SELECT COALESCE(value::numeric, 8000) INTO v_fxu_ratio
    FROM game_settings WHERE key = 'fxu_cost_ratio_ships';
    
    IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
      v_fxu_ratio := 8000;
    END IF;
  ELSE
    SELECT * INTO v_defense_type FROM defense_types WHERE id = v_queue.defense_type_id;
    v_metal_cost := COALESCE(v_defense_type.metal_cost, 0);
    v_crystal_cost := COALESCE(v_defense_type.crystal_cost, 0);
    v_deut_cost := COALESCE(v_defense_type.deuterium_cost, 0);
    
    -- Get FXU ratio for defense from admin settings
    SELECT COALESCE(value::numeric, 10000) INTO v_fxu_ratio
    FROM game_settings WHERE key = 'fxu_cost_ratio_defense';
    
    IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
      v_fxu_ratio := 10000;
    END IF;
  END IF;
  
  -- Calculate total resource value for all remaining units
  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost) * v_units_remaining;
  
  -- FXU cost = resource_value / ratio
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;
