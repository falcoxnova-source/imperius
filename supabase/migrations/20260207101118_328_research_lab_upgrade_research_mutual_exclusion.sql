/*
  # Research Lab / Research Mutual Exclusion

  This migration enforces the classic XNova/OGame rule:
  - The Research Lab cannot be upgraded while research is in progress
  - Research cannot be started while the Research Lab is being upgraded (in building queue)

  ## Changes
  1. `secure_add_to_building_queue` - Added check: if building is research_lab, verify no research is active
  2. `secure_start_research` - Added check: verify research_lab is not in the building queue on the research planet

  ## Security
  - Both validations are server-side, preventing bypass from client manipulation
  - Uses existing building_types.code lookup to identify research_lab
*/

-- 1. Update secure_add_to_building_queue to block research_lab upgrade during research
CREATE OR REPLACE FUNCTION secure_add_to_building_queue(
  p_planet_id uuid,
  p_building_type_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation jsonb;
  v_planet RECORD;
  v_building_type RECORD;
  v_current_level integer;
  v_queued_count integer;
  v_target_level integer;
  v_resources RECORD;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_queue_position integer;
  v_robotics_level integer;
  v_nanite_level integer;
  v_build_time integer;
  v_is_first boolean;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_total_queued_levels integer;
  v_game_speed integer;
  v_is_moon boolean;
  v_moon_only_buildings text[];
  v_planet_only_buildings text[];
  v_has_active_research boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building type not found');
  END IF;

  v_is_moon := v_planet.planet_type = 'moon';
  v_moon_only_buildings := get_moon_only_buildings();
  v_planet_only_buildings := get_planet_only_buildings();

  IF v_building_type.code = ANY(v_moon_only_buildings) AND NOT v_is_moon THEN
    RETURN jsonb_build_object('success', false, 'error', 'This building can only be built on a moon');
  END IF;

  IF v_building_type.code = ANY(v_planet_only_buildings) AND v_is_moon THEN
    RETURN jsonb_build_object('success', false, 'error', 'This building cannot be built on a moon');
  END IF;

  -- Block research_lab upgrade if research is in progress
  IF v_building_type.code = 'research_lab' THEN
    SELECT EXISTS(
      SELECT 1 FROM user_technologies
      WHERE user_id = auth.uid() AND is_researching = true
    ) INTO v_has_active_research;

    IF v_has_active_research THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot upgrade Research Lab while research is in progress');
    END IF;
  END IF;

  SELECT COALESCE(COUNT(*), 0) INTO v_total_queued_levels FROM building_queue WHERE planet_id = p_planet_id;
  IF (v_planet.fields_used + v_total_queued_levels) >= v_planet.fields_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available fields on planet');
  END IF;

  v_validation := validate_building_requirements(p_planet_id, p_building_type_id);
  IF NOT (v_validation->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_current_level
  FROM planet_buildings pb
  WHERE pb.planet_id = p_planet_id AND pb.building_type_id = p_building_type_id;
  IF v_current_level IS NULL THEN v_current_level := 0; END IF;

  SELECT COUNT(*) INTO v_queued_count
  FROM building_queue
  WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;

  v_target_level := v_current_level + v_queued_count + 1;

  IF v_target_level > v_building_type.max_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max level reached');
  END IF;

  v_cost_metal := FLOOR(v_building_type.base_metal * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));
  v_cost_crystal := FLOOR(v_building_type.base_crystal * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));
  v_cost_deuterium := FLOOR(v_building_type.base_deuterium * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF v_resources.metal < v_cost_metal OR v_resources.crystal < v_cost_crystal OR v_resources.deuterium < v_cost_deuterium THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_queue_position FROM building_queue WHERE planet_id = p_planet_id;

  SELECT COALESCE(pb.level, 0) INTO v_robotics_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'robotics_factory';
  IF v_robotics_level IS NULL THEN v_robotics_level := 0; END IF;

  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';
  IF v_nanite_level IS NULL THEN v_nanite_level := 0; END IF;

  v_game_speed := get_game_speed();

  v_build_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed));

  v_is_first := v_queue_position = 1;
  IF v_is_first THEN
    v_start_time := now();
    v_end_time := now() + (v_build_time || ' seconds')::interval;
  ELSE
    v_start_time := NULL;
    v_end_time := NULL;
  END IF;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium,
      last_update = now()
  WHERE planet_id = p_planet_id;

  INSERT INTO building_queue (
    planet_id, building_type_id, target_level,
    metal_cost, crystal_cost, deuterium_cost,
    build_time, queue_position, start_time, end_time
  ) VALUES (
    p_planet_id, p_building_type_id, v_target_level,
    v_cost_metal, v_cost_crystal, v_cost_deuterium,
    v_build_time, v_queue_position, v_start_time, v_end_time
  );

  RETURN jsonb_build_object('success', true, 'target_level', v_target_level, 'build_time', v_build_time);
END;
$$;


-- 2. Update secure_start_research to block research while research_lab is in building queue
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
  v_lab_in_queue boolean;
  v_research_lab_type_id integer;
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

  -- Block research if research_lab is being upgraded on this planet
  SELECT id INTO v_research_lab_type_id FROM building_types WHERE code = 'research_lab';
  IF v_research_lab_type_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM building_queue
      WHERE planet_id = p_planet_id AND building_type_id = v_research_lab_type_id
    ) INTO v_lab_in_queue;

    IF v_lab_in_queue THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot research while Research Lab is being upgraded');
    END IF;
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
