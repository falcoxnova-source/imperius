/*
  # Fix Research FXU Cost Calculation
  
  1. Bug Fix
    - The calculate_fxu_cost_research function was referencing wrong column names
    - Changed base_metal_cost to base_metal
    - Changed base_crystal_cost to base_crystal  
    - Changed base_deuterium_cost to base_deuterium
*/

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
  v_resource_multiplier numeric;
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
  
  -- Fixed: use correct column names (base_metal, base_crystal, base_deuterium)
  -- Research costs more FXU than buildings (multiplier 0.25 instead of 0.15)
  v_resource_multiplier := (COALESCE(v_tech_type.base_metal, 0) + COALESCE(v_tech_type.base_crystal, 0) + COALESCE(v_tech_type.base_deuterium, 0))::numeric / 10000;
  v_resource_multiplier := v_resource_multiplier * POWER(2, v_tech.level);
  v_base_cost := (v_seconds_remaining::numeric / 60) * (1 + v_resource_multiplier * 0.25);
  
  RETURN GREATEST(1, CEIL(v_base_cost))::integer;
END;
$$;