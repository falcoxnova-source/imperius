/*
  # FXU Cost Ratio Admin Functions
  
  ## Overview
  Adds admin functions to get and update the FXU cost ratio settings
  that control how much FXU is needed to complete items instantly.
  
  ## Functions
  1. get_fxu_cost_ratios - Returns all FXU cost ratio settings
  2. update_fxu_cost_ratios - Updates one or more FXU cost ratio settings
  
  ## Settings Keys
  - fxu_cost_ratio_building: Resources per 1 FXU for buildings
  - fxu_cost_ratio_research: Resources per 1 FXU for research
  - fxu_cost_ratio_ships: Resources per 1 FXU for ships
  - fxu_cost_ratio_defense: Resources per 1 FXU for defense
*/

-- Function to get all FXU cost ratio settings
CREATE OR REPLACE FUNCTION get_fxu_cost_ratios()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_building numeric;
  v_research numeric;
  v_ships numeric;
  v_defense numeric;
BEGIN
  -- Get building ratio
  SELECT COALESCE(value::numeric, 5000) INTO v_building
  FROM game_settings WHERE key = 'fxu_cost_ratio_building';
  
  -- Get research ratio
  SELECT COALESCE(value::numeric, 3000) INTO v_research
  FROM game_settings WHERE key = 'fxu_cost_ratio_research';
  
  -- Get ships ratio
  SELECT COALESCE(value::numeric, 8000) INTO v_ships
  FROM game_settings WHERE key = 'fxu_cost_ratio_ships';
  
  -- Get defense ratio
  SELECT COALESCE(value::numeric, 10000) INTO v_defense
  FROM game_settings WHERE key = 'fxu_cost_ratio_defense';
  
  RETURN jsonb_build_object(
    'success', true,
    'building_ratio', COALESCE(v_building, 5000),
    'research_ratio', COALESCE(v_research, 3000),
    'ships_ratio', COALESCE(v_ships, 8000),
    'defense_ratio', COALESCE(v_defense, 10000)
  );
END;
$$;

-- Function to update FXU cost ratio settings (admin only)
CREATE OR REPLACE FUNCTION update_fxu_cost_ratios(
  p_building_ratio numeric DEFAULT NULL,
  p_research_ratio numeric DEFAULT NULL,
  p_ships_ratio numeric DEFAULT NULL,
  p_defense_ratio numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Check if user is admin
  SELECT is_admin INTO v_is_admin
  FROM profiles
  WHERE id = auth.uid();
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Validate ratios (minimum 100 to avoid extreme costs)
  IF p_building_ratio IS NOT NULL AND p_building_ratio < 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building ratio must be at least 100');
  END IF;
  
  IF p_research_ratio IS NOT NULL AND p_research_ratio < 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research ratio must be at least 100');
  END IF;
  
  IF p_ships_ratio IS NOT NULL AND p_ships_ratio < 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ships ratio must be at least 100');
  END IF;
  
  IF p_defense_ratio IS NOT NULL AND p_defense_ratio < 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Defense ratio must be at least 100');
  END IF;
  
  -- Update building ratio
  IF p_building_ratio IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('fxu_cost_ratio_building', p_building_ratio::text, 'Resource value per 1 FXU for buildings')
    ON CONFLICT (key) DO UPDATE SET value = p_building_ratio::text;
  END IF;
  
  -- Update research ratio
  IF p_research_ratio IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('fxu_cost_ratio_research', p_research_ratio::text, 'Resource value per 1 FXU for research')
    ON CONFLICT (key) DO UPDATE SET value = p_research_ratio::text;
  END IF;
  
  -- Update ships ratio
  IF p_ships_ratio IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('fxu_cost_ratio_ships', p_ships_ratio::text, 'Resource value per 1 FXU for ships')
    ON CONFLICT (key) DO UPDATE SET value = p_ships_ratio::text;
  END IF;
  
  -- Update defense ratio
  IF p_defense_ratio IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('fxu_cost_ratio_defense', p_defense_ratio::text, 'Resource value per 1 FXU for defense')
    ON CONFLICT (key) DO UPDATE SET value = p_defense_ratio::text;
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$;
