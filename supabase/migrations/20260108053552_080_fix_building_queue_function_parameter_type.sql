/*
  # Fix secure_add_to_building_queue parameter type
  
  1. Problem
    - Function expects p_building_type_id as uuid
    - building_types.id is actually integer
    - This causes "invalid input syntax for type uuid" error
  
  2. Solution
    - Drop the function with wrong parameter type (uuid)
    - Recreate with correct parameter type (integer)
    - All business logic remains the same
*/

-- Drop the function with incorrect parameter type
DROP FUNCTION IF EXISTS secure_add_to_building_queue(uuid, uuid);

-- Recreate with correct parameter type (integer for building_type_id)
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
BEGIN
  -- Verify authentication
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify planet ownership
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Check available fields (including queued buildings)
  SELECT COALESCE(COUNT(*), 0) INTO v_total_queued_levels FROM building_queue WHERE planet_id = p_planet_id;
  IF (v_planet.fields_used + v_total_queued_levels) >= v_planet.fields_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available fields on planet');
  END IF;

  -- Validate building requirements
  v_validation := validate_building_requirements(p_planet_id, p_building_type_id);
  IF NOT (v_validation->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
  END IF;

  -- Get building type info
  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building type not found');
  END IF;

  -- Get current level
  SELECT COALESCE(pb.level, 0) INTO v_current_level
  FROM planet_buildings pb
  WHERE pb.planet_id = p_planet_id AND pb.building_type_id = p_building_type_id;
  IF v_current_level IS NULL THEN v_current_level := 0; END IF;

  -- Count queued items for this building
  SELECT COUNT(*) INTO v_queued_count
  FROM building_queue
  WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;

  v_target_level := v_current_level + v_queued_count + 1;

  -- Check max level
  IF v_target_level > v_building_type.max_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max level reached');
  END IF;

  -- Calculate costs for target level
  v_cost_metal := FLOOR(v_building_type.base_metal * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));
  v_cost_crystal := FLOOR(v_building_type.base_crystal * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));
  v_cost_deuterium := FLOOR(v_building_type.base_deuterium * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));

  -- Check resources
  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF v_resources.metal < v_cost_metal OR v_resources.crystal < v_cost_crystal OR v_resources.deuterium < v_cost_deuterium THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  -- Get queue position
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_queue_position FROM building_queue WHERE planet_id = p_planet_id;

  -- Get robotics factory level
  SELECT COALESCE(pb.level, 0) INTO v_robotics_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'robotics_factory';
  IF v_robotics_level IS NULL THEN v_robotics_level := 0; END IF;

  -- Get nanite factory level
  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';
  IF v_nanite_level IS NULL THEN v_nanite_level := 0; END IF;

  -- Get game speed
  v_game_speed := get_game_speed();

  -- Calculate build time (in seconds)
  v_build_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed));

  -- Set start/end times only for first item in queue
  v_is_first := v_queue_position = 1;
  IF v_is_first THEN
    v_start_time := now();
    v_end_time := now() + (v_build_time || ' seconds')::interval;
  ELSE
    v_start_time := NULL;
    v_end_time := NULL;
  END IF;

  -- Deduct resources
  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium,
      last_update = now()
  WHERE planet_id = p_planet_id;

  -- Insert into queue
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