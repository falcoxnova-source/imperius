/*
  # Tiered FXU Cost System
  
  1. Changes
    - Research: Most expensive (strategic value) - level^2 scaling
    - Buildings: Medium cost - linear level scaling
    - Shipyard (ships): Low-medium cost
    - Shipyard (defense): Lowest cost
    
  2. Cost Hierarchy (from highest to lowest)
    - Research: 3.0x multiplier, level squared
    - Buildings: 1.0x multiplier, linear level
    - Ships: 0.5x multiplier
    - Defense: 0.3x multiplier
*/

-- Research FXU cost - MUCH more expensive, scales with level squared
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
  v_resource_value numeric;
  v_level_multiplier numeric;
  v_base_cost numeric;
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
  
  -- Resource value factor (crystal worth 1.5x, deuterium worth 3x)
  v_resource_value := (COALESCE(v_tech_type.base_metal, 0) + COALESCE(v_tech_type.base_crystal, 0) * 1.5 + COALESCE(v_tech_type.base_deuterium, 0) * 3)::numeric / 5000;
  
  -- Level multiplier: scales QUADRATICALLY (level^2) - research gets exponentially more expensive
  v_level_multiplier := POWER(v_tech.level + 1, 2);
  
  -- Base cost from time remaining (1 FXU per 30 seconds minimum)
  v_base_cost := v_seconds_remaining::numeric / 30;
  
  -- Final cost: time * resources * level^2 * research_multiplier(3.0)
  v_base_cost := v_base_cost * (1 + v_resource_value) * v_level_multiplier * 3.0;
  
  -- Minimum 5 FXU for any research
  RETURN GREATEST(5, CEIL(v_base_cost))::integer;
END;
$$;

-- Building FXU cost - Medium cost, scales linearly with level
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
  v_resource_value numeric;
  v_level_multiplier numeric;
  v_base_cost numeric;
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
  
  -- Resource value factor
  v_resource_value := (COALESCE(v_building_type.base_metal, 0) + COALESCE(v_building_type.base_crystal, 0) * 1.5 + COALESCE(v_building_type.base_deuterium, 0) * 3)::numeric / 8000;
  
  -- Level multiplier: linear scaling
  v_level_multiplier := v_queue.target_level;
  
  -- Base cost from time (1 FXU per 60 seconds)
  v_base_cost := v_seconds_remaining::numeric / 60;
  
  -- Final cost: time * resources * level * building_multiplier(1.0)
  v_base_cost := v_base_cost * (1 + v_resource_value) * v_level_multiplier * 1.0;
  
  -- Minimum 2 FXU
  RETURN GREATEST(2, CEIL(v_base_cost))::integer;
END;
$$;

-- Shipyard FXU cost - Different rates for ships vs defense
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
  v_resource_value numeric;
  v_base_cost numeric;
  v_type_multiplier numeric;
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
  
  -- Different handling for ships vs defense
  IF v_queue.item_type = 'ship' THEN
    SELECT * INTO v_ship_type FROM ship_types WHERE id = v_queue.ship_type_id;
    v_resource_value := (COALESCE(v_ship_type.metal_cost, 0) + COALESCE(v_ship_type.crystal_cost, 0) * 1.5 + COALESCE(v_ship_type.deuterium_cost, 0) * 3)::numeric / 15000;
    v_type_multiplier := 0.5; -- Ships: medium-low cost
  ELSE
    SELECT * INTO v_defense_type FROM defense_types WHERE id = v_queue.defense_type_id;
    v_resource_value := (COALESCE(v_defense_type.metal_cost, 0) + COALESCE(v_defense_type.crystal_cost, 0) * 1.5 + COALESCE(v_defense_type.deuterium_cost, 0) * 3)::numeric / 20000;
    v_type_multiplier := 0.3; -- Defense: lowest cost
  END IF;
  
  -- Base cost from time (1 FXU per 90 seconds)
  v_base_cost := v_seconds_remaining::numeric / 90;
  
  -- Final cost
  v_base_cost := v_base_cost * (1 + v_resource_value) * v_type_multiplier;
  
  -- Minimum 1 FXU
  RETURN GREATEST(1, CEIL(v_base_cost))::integer;
END;
$$;