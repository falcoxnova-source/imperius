/*
  # Progressive FXU Cost Based on Remaining Time
  
  ## Description
  FXU cost for instant completion now decreases proportionally with remaining time.
  - If 100% time remains: pay 100% FXU
  - If 50% time remains: pay 50% FXU
  - If 10% time remains: pay 10% FXU
  
  ## Changes
  1. calculate_fxu_cost_building - uses time ratio
  2. calculate_fxu_cost_research - uses time ratio
  3. calculate_fxu_cost_shipyard - uses time ratio for remaining units
*/

-- Building FXU cost with progressive reduction
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
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  
  IF v_queue IS NULL THEN
    RETURN 0;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue.end_time - now()))::integer);
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Calculate total build time from start_time to end_time
  v_total_build_time := GREATEST(1, EXTRACT(EPOCH FROM (v_queue.end_time - v_queue.start_time))::integer);
  
  -- Calculate time ratio (percentage of time remaining)
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
  
  -- Base FXU cost
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  
  -- Apply time ratio - cost decreases as time passes
  v_fxu_cost := v_fxu_cost * v_time_ratio;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- Research FXU cost with progressive reduction
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
BEGIN
  SELECT * INTO v_tech FROM user_technologies WHERE id = p_technology_id;
  
  IF v_tech IS NULL OR NOT v_tech.is_researching THEN
    RETURN 0;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_tech.research_end_time - now()))::integer);
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Calculate total research time
  v_total_research_time := GREATEST(1, EXTRACT(EPOCH FROM (v_tech.research_end_time - v_tech.research_start_time))::integer);
  
  -- Calculate time ratio
  v_time_ratio := v_seconds_remaining::numeric / v_total_research_time::numeric;
  
  SELECT * INTO v_tech_type FROM technology_types WHERE id = v_tech.technology_type_id;
  
  v_metal_cost := FLOOR(COALESCE(v_tech_type.base_metal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_crystal_cost := FLOOR(COALESCE(v_tech_type.base_crystal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_deut_cost := FLOOR(COALESCE(v_tech_type.base_deuterium, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  
  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);
  
  SELECT COALESCE(value::numeric, 3000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_research';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 3000;
  END IF;
  
  -- Base FXU cost
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  
  -- Apply time ratio
  v_fxu_cost := v_fxu_cost * v_time_ratio;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- Shipyard FXU cost with progressive reduction
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
  v_current_unit_time_remaining integer;
  v_total_time_remaining integer;
  v_total_time_for_remaining_units integer;
  v_time_ratio numeric;
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
  
  -- Time remaining for current unit being built
  v_current_unit_time_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue.current_unit_end_time - now()))::integer);
  
  -- Calculate remaining units (including current one being built)
  v_units_remaining := v_queue.quantity - v_queue.quantity_completed;
  
  IF v_units_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Total time remaining = current unit remaining + (other remaining units * build_time_per_unit)
  v_total_time_remaining := v_current_unit_time_remaining;
  IF v_units_remaining > 1 THEN
    v_total_time_remaining := v_total_time_remaining + ((v_units_remaining - 1) * v_queue.build_time_per_unit);
  END IF;
  
  IF v_total_time_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Total time for all remaining units at full build time
  v_total_time_for_remaining_units := v_units_remaining * v_queue.build_time_per_unit;
  
  -- Calculate time ratio for remaining units
  v_time_ratio := v_total_time_remaining::numeric / GREATEST(1, v_total_time_for_remaining_units)::numeric;
  
  -- Get cost per unit based on type
  IF v_queue.item_type = 'ship' THEN
    SELECT * INTO v_ship_type FROM ship_types WHERE id = v_queue.ship_type_id;
    v_metal_cost := COALESCE(v_ship_type.metal_cost, 0);
    v_crystal_cost := COALESCE(v_ship_type.crystal_cost, 0);
    v_deut_cost := COALESCE(v_ship_type.deuterium_cost, 0);
    
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
    
    SELECT COALESCE(value::numeric, 10000) INTO v_fxu_ratio
    FROM game_settings WHERE key = 'fxu_cost_ratio_defense';
    
    IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
      v_fxu_ratio := 10000;
    END IF;
  END IF;
  
  -- Calculate total resource value for all remaining units
  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost) * v_units_remaining;
  
  -- Base FXU cost
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  
  -- Apply time ratio
  v_fxu_cost := v_fxu_cost * v_time_ratio;
  
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;
