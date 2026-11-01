/*
  # Resource-Based FXU Cost System
  
  ## Overview
  Changes the FXU instant-completion cost to be proportional to the actual resource
  cost of the item being built/researched, rather than time-based.
  
  ## Changes
  1. New game settings for FXU cost ratios
  2. Updated calculate_fxu_cost for buildings
  3. Updated calculate_fxu_cost_research for technologies
  4. Updated calculate_fxu_cost_shipyard for ships/defense
  
  ## Formula
  FXU Cost = Total Resource Value / FXU Ratio
  Resource Value = metal + (crystal * 1.5) + (deuterium * 3)
  
  ## Examples (with ratio of 5000)
  - Level 1 building (500 metal) = 1 FXU
  - Level 10 building (50,000 total resources) = 10 FXU
  - Level 20 building (500,000 total resources) = 100 FXU
*/

-- Add FXU cost ratio settings
INSERT INTO game_settings (key, value, description)
VALUES 
  ('fxu_cost_ratio_building', '5000', 'Resource value per 1 FXU for buildings'),
  ('fxu_cost_ratio_research', '3000', 'Resource value per 1 FXU for research (more expensive)'),
  ('fxu_cost_ratio_ships', '8000', 'Resource value per 1 FXU for ships'),
  ('fxu_cost_ratio_defense', '10000', 'Resource value per 1 FXU for defense (cheapest)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Building FXU cost - Based on actual resource cost for target level
CREATE OR REPLACE FUNCTION calculate_fxu_cost(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_building_type building_types%ROWTYPE;
  v_seconds_remaining integer;
  v_metal_cost numeric;
  v_crystal_cost numeric;
  v_deuterium_cost numeric;
  v_total_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost integer;
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
  
  -- Calculate actual resource cost for the target level
  -- Formula: base_cost * (cost_factor ^ (level - 1))
  v_metal_cost := COALESCE(v_building_type.base_metal, 0) * 
    POWER(COALESCE(v_building_type.cost_factor, 1.5), v_queue.target_level - 1);
  v_crystal_cost := COALESCE(v_building_type.base_crystal, 0) * 
    POWER(COALESCE(v_building_type.cost_factor, 1.5), v_queue.target_level - 1);
  v_deuterium_cost := COALESCE(v_building_type.base_deuterium, 0) * 
    POWER(COALESCE(v_building_type.cost_factor, 1.5), v_queue.target_level - 1);
  
  -- Calculate total resource value (crystal worth 1.5x, deuterium worth 3x)
  v_total_resource_value := v_metal_cost + (v_crystal_cost * 1.5) + (v_deuterium_cost * 3);
  
  -- Get FXU ratio from settings
  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio 
  FROM game_settings WHERE key = 'fxu_cost_ratio_building';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 5000;
  END IF;
  
  -- Calculate FXU cost
  v_fxu_cost := CEIL(v_total_resource_value / v_fxu_ratio)::integer;
  
  -- Minimum 1 FXU
  RETURN GREATEST(1, v_fxu_cost);
END;
$$;

-- Research FXU cost - Based on actual resource cost (more expensive ratio)
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
  v_metal_cost numeric;
  v_crystal_cost numeric;
  v_deuterium_cost numeric;
  v_total_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost integer;
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
  
  -- Calculate actual resource cost for the NEXT level being researched (level + 1)
  -- Research typically uses factor of 2
  v_metal_cost := COALESCE(v_tech_type.base_metal, 0) * 
    POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level);
  v_crystal_cost := COALESCE(v_tech_type.base_crystal, 0) * 
    POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level);
  v_deuterium_cost := COALESCE(v_tech_type.base_deuterium, 0) * 
    POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level);
  
  -- Calculate total resource value
  v_total_resource_value := v_metal_cost + (v_crystal_cost * 1.5) + (v_deuterium_cost * 3);
  
  -- Get FXU ratio from settings (research is more expensive)
  SELECT COALESCE(value::numeric, 3000) INTO v_fxu_ratio 
  FROM game_settings WHERE key = 'fxu_cost_ratio_research';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 3000;
  END IF;
  
  -- Calculate FXU cost
  v_fxu_cost := CEIL(v_total_resource_value / v_fxu_ratio)::integer;
  
  -- Minimum 1 FXU
  RETURN GREATEST(1, v_fxu_cost);
END;
$$;

-- Shipyard FXU cost - Based on total resource cost of all units in queue
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
  v_metal_cost numeric;
  v_crystal_cost numeric;
  v_deuterium_cost numeric;
  v_units_remaining integer;
  v_total_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost integer;
BEGIN
  SELECT * INTO v_queue FROM shipyard_queue WHERE id = p_queue_id;
  
  IF v_queue IS NULL THEN
    RETURN 0;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue.current_unit_end_time - now()))::integer);
  
  -- Add remaining units time
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
    v_deuterium_cost := COALESCE(v_ship_type.deuterium_cost, 0);
    
    -- Get FXU ratio for ships
    SELECT COALESCE(value::numeric, 8000) INTO v_fxu_ratio 
    FROM game_settings WHERE key = 'fxu_cost_ratio_ships';
    
    IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
      v_fxu_ratio := 8000;
    END IF;
  ELSE
    SELECT * INTO v_defense_type FROM defense_types WHERE id = v_queue.defense_type_id;
    v_metal_cost := COALESCE(v_defense_type.metal_cost, 0);
    v_crystal_cost := COALESCE(v_defense_type.crystal_cost, 0);
    v_deuterium_cost := COALESCE(v_defense_type.deuterium_cost, 0);
    
    -- Get FXU ratio for defense (cheapest)
    SELECT COALESCE(value::numeric, 10000) INTO v_fxu_ratio 
    FROM game_settings WHERE key = 'fxu_cost_ratio_defense';
    
    IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
      v_fxu_ratio := 10000;
    END IF;
  END IF;
  
  -- Calculate total resource value for all remaining units
  v_total_resource_value := (v_metal_cost + (v_crystal_cost * 1.5) + (v_deuterium_cost * 3)) * v_units_remaining;
  
  -- Calculate FXU cost
  v_fxu_cost := CEIL(v_total_resource_value / v_fxu_ratio)::integer;
  
  -- Minimum 1 FXU
  RETURN GREATEST(1, v_fxu_cost);
END;
$$;

-- Add helper function to preview FXU cost before starting construction
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
BEGIN
  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  
  IF v_building_type IS NULL THEN
    RETURN 0;
  END IF;
  
  v_target_level := p_current_level + 1;
  
  v_metal_cost := COALESCE(v_building_type.base_metal, 0) * 
    POWER(COALESCE(v_building_type.cost_factor, 1.5), v_target_level - 1);
  v_crystal_cost := COALESCE(v_building_type.base_crystal, 0) * 
    POWER(COALESCE(v_building_type.cost_factor, 1.5), v_target_level - 1);
  v_deuterium_cost := COALESCE(v_building_type.base_deuterium, 0) * 
    POWER(COALESCE(v_building_type.cost_factor, 1.5), v_target_level - 1);
  
  v_total_resource_value := v_metal_cost + (v_crystal_cost * 1.5) + (v_deuterium_cost * 3);
  
  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio 
  FROM game_settings WHERE key = 'fxu_cost_ratio_building';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 5000;
  END IF;
  
  RETURN GREATEST(1, CEIL(v_total_resource_value / v_fxu_ratio)::integer);
END;
$$;

-- Add helper function to preview research FXU cost
CREATE OR REPLACE FUNCTION preview_research_fxu_cost(
  p_technology_type_id uuid,
  p_current_level integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tech_type technology_types%ROWTYPE;
  v_metal_cost numeric;
  v_crystal_cost numeric;
  v_deuterium_cost numeric;
  v_total_resource_value numeric;
  v_fxu_ratio numeric;
BEGIN
  SELECT * INTO v_tech_type FROM technology_types WHERE id = p_technology_type_id;
  
  IF v_tech_type IS NULL THEN
    RETURN 0;
  END IF;
  
  v_metal_cost := COALESCE(v_tech_type.base_metal, 0) * 
    POWER(COALESCE(v_tech_type.cost_factor, 2), p_current_level);
  v_crystal_cost := COALESCE(v_tech_type.base_crystal, 0) * 
    POWER(COALESCE(v_tech_type.cost_factor, 2), p_current_level);
  v_deuterium_cost := COALESCE(v_tech_type.base_deuterium, 0) * 
    POWER(COALESCE(v_tech_type.cost_factor, 2), p_current_level);
  
  v_total_resource_value := v_metal_cost + (v_crystal_cost * 1.5) + (v_deuterium_cost * 3);
  
  SELECT COALESCE(value::numeric, 3000) INTO v_fxu_ratio 
  FROM game_settings WHERE key = 'fxu_cost_ratio_research';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 3000;
  END IF;
  
  RETURN GREATEST(1, CEIL(v_total_resource_value / v_fxu_ratio)::integer);
END;
$$;

-- Add helper function to preview shipyard FXU cost
CREATE OR REPLACE FUNCTION preview_shipyard_fxu_cost(
  p_item_type text,
  p_item_id uuid,
  p_quantity integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship_type ship_types%ROWTYPE;
  v_defense_type defense_types%ROWTYPE;
  v_metal_cost numeric;
  v_crystal_cost numeric;
  v_deuterium_cost numeric;
  v_total_resource_value numeric;
  v_fxu_ratio numeric;
BEGIN
  IF p_item_type = 'ship' THEN
    SELECT * INTO v_ship_type FROM ship_types WHERE id = p_item_id;
    IF v_ship_type IS NULL THEN RETURN 0; END IF;
    
    v_metal_cost := COALESCE(v_ship_type.metal_cost, 0);
    v_crystal_cost := COALESCE(v_ship_type.crystal_cost, 0);
    v_deuterium_cost := COALESCE(v_ship_type.deuterium_cost, 0);
    
    SELECT COALESCE(value::numeric, 8000) INTO v_fxu_ratio 
    FROM game_settings WHERE key = 'fxu_cost_ratio_ships';
  ELSE
    SELECT * INTO v_defense_type FROM defense_types WHERE id = p_item_id;
    IF v_defense_type IS NULL THEN RETURN 0; END IF;
    
    v_metal_cost := COALESCE(v_defense_type.metal_cost, 0);
    v_crystal_cost := COALESCE(v_defense_type.crystal_cost, 0);
    v_deuterium_cost := COALESCE(v_defense_type.deuterium_cost, 0);
    
    SELECT COALESCE(value::numeric, 10000) INTO v_fxu_ratio 
    FROM game_settings WHERE key = 'fxu_cost_ratio_defense';
  END IF;
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 8000;
  END IF;
  
  v_total_resource_value := (v_metal_cost + (v_crystal_cost * 1.5) + (v_deuterium_cost * 3)) * p_quantity;
  
  RETURN GREATEST(1, CEIL(v_total_resource_value / v_fxu_ratio)::integer);
END;
$$;
