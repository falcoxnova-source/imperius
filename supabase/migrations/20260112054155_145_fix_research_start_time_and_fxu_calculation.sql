/*
  # Fix Research Start Time and FXU Cost Calculation
  
  ## Problem
  The user_technologies table was missing research_start_time column,
  and secure_start_research was not setting it, causing calculate_fxu_cost_research 
  to fail when calculating time ratios.
  
  ## Solution
  1. Add research_start_time column to user_technologies
  2. Update secure_start_research to set research_start_time
  3. Update calculate_fxu_cost_research to handle NULL research_start_time gracefully
  
  ## Changes
  - Added research_start_time column to user_technologies
  - secure_start_research: Now sets research_start_time = now()
  - calculate_fxu_cost_research: Always returns at least 1 for active research
*/

-- Add research_start_time column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_technologies' AND column_name = 'research_start_time'
  ) THEN
    ALTER TABLE user_technologies ADD COLUMN research_start_time timestamptz;
  END IF;
END $$;

-- Fix any existing research that has NULL research_start_time
UPDATE user_technologies
SET research_start_time = COALESCE(research_end_time - INTERVAL '1 hour', now())
WHERE is_researching = true 
  AND research_start_time IS NULL;

-- Fix secure_start_research to include research_start_time
CREATE OR REPLACE FUNCTION secure_start_research(p_planet_id uuid, p_tech_type_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation jsonb;
  v_planet RECORD;
  v_tech_type RECORD;
  v_current_level integer;
  v_resources RECORD;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_effective_lab_level integer;
  v_research_time integer;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_existing_research boolean;
  v_game_speed integer;
  v_has_technocrat boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_technologies 
    WHERE user_id = auth.uid() AND is_researching = true
  ) INTO v_existing_research;

  IF v_existing_research THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already in progress');
  END IF;

  v_validation := validate_research_requirements(auth.uid(), p_planet_id, p_tech_type_id);
  IF NOT (v_validation->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
  END IF;

  SELECT * INTO v_tech_type FROM technology_types WHERE id = p_tech_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology type not found');
  END IF;

  SELECT COALESCE(ut.level, 0) INTO v_current_level
  FROM user_technologies ut
  WHERE ut.user_id = auth.uid() AND ut.technology_type_id = p_tech_type_id;
  IF v_current_level IS NULL THEN v_current_level := 0; END IF;

  IF v_current_level >= v_tech_type.max_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max level reached');
  END IF;

  v_cost_metal := FLOOR(v_tech_type.base_metal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_crystal := FLOOR(v_tech_type.base_crystal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_deuterium := FLOOR(v_tech_type.base_deuterium * POWER(v_tech_type.cost_factor, v_current_level));

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF v_resources.metal < v_cost_metal OR v_resources.crystal < v_cost_crystal OR v_resources.deuterium < v_cost_deuterium THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  v_effective_lab_level := calculate_irn_lab_level(auth.uid(), p_planet_id);
  IF v_effective_lab_level IS NULL OR v_effective_lab_level < 1 THEN
    v_effective_lab_level := 1;
  END IF;

  v_game_speed := get_game_speed();
  v_has_technocrat := has_active_officer(auth.uid(), 'technocrat');

  v_research_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_effective_lab_level)) * 3600 / v_game_speed));

  IF v_has_technocrat THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * 0.75));
  END IF;

  v_start_time := now();
  v_end_time := v_start_time + (v_research_time || ' seconds')::interval;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium,
      last_update = now()
  WHERE planet_id = p_planet_id;

  INSERT INTO user_technologies (
    user_id, technology_type_id, level, is_researching, 
    research_start_time, research_end_time, research_planet_id
  ) VALUES (
    auth.uid(), p_tech_type_id, v_current_level, true, 
    v_start_time, v_end_time, p_planet_id
  )
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
    is_researching = true,
    research_start_time = v_start_time,
    research_end_time = v_end_time,
    research_planet_id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true, 
    'target_level', v_current_level + 1, 
    'start_time', v_start_time,
    'end_time', v_end_time, 
    'research_time_seconds', v_research_time,
    'technocrat_bonus', v_has_technocrat
  );
END;
$$;

-- Fix calculate_fxu_cost_research to handle NULL research_start_time
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

  -- If no tech found or not researching, return 0
  IF v_tech IS NULL OR NOT v_tech.is_researching THEN
    RETURN 0;
  END IF;

  -- If no end_time set, return minimum cost
  IF v_tech.research_end_time IS NULL THEN
    RETURN 1;
  END IF;

  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_tech.research_end_time - now()))::integer);

  -- If research is complete or almost complete, return minimum cost
  IF v_seconds_remaining <= 0 THEN
    RETURN 1;
  END IF;

  -- Calculate total research time, handling NULL research_start_time
  IF v_tech.research_start_time IS NOT NULL THEN
    v_total_research_time := GREATEST(1, EXTRACT(EPOCH FROM (v_tech.research_end_time - v_tech.research_start_time))::integer);
  ELSE
    -- Fallback: use seconds remaining as total time (worst case estimate)
    v_total_research_time := v_seconds_remaining;
  END IF;

  -- Calculate time ratio (capped between 0.01 and 1)
  v_time_ratio := LEAST(1, GREATEST(0.01, v_seconds_remaining::numeric / v_total_research_time::numeric));

  SELECT * INTO v_tech_type FROM technology_types WHERE id = v_tech.technology_type_id;

  IF v_tech_type IS NULL THEN
    RETURN 1;
  END IF;

  v_metal_cost := FLOOR(COALESCE(v_tech_type.base_metal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_crystal_cost := FLOOR(COALESCE(v_tech_type.base_crystal, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));
  v_deut_cost := FLOOR(COALESCE(v_tech_type.base_deuterium, 0) * POWER(COALESCE(v_tech_type.cost_factor, 2), v_tech.level));

  v_resource_value := calculate_resource_value(v_metal_cost, v_crystal_cost, v_deut_cost);

  -- If resource value is 0, return minimum cost
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

  -- Always return at least 1 FXU for active research
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;
