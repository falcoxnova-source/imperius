/*
  # Moon Buildings Validation and Lunar Base Fields

  ## Summary
  This migration fixes two critical issues with moon buildings:
  
  1. **Server-side validation for moon/planet-only buildings**
     - lunar_base, sensor_phalanx, jump_gate can ONLY be built on moons
     - terraformer can ONLY be built on planets
     - Prevents exploit via direct API calls
  
  2. **Lunar Base now properly increases moon fields**
     - Each level of Lunar Base adds 3 fields to the moon
     - Formula: fields_max = base_fields + (lunar_base_level * 3)
  
  ## Changes
  - Updated `secure_add_to_building_queue` to validate moon/planet restrictions
  - Updated `complete_building_queue_item` to increase fields_max when Lunar Base completes
  
  ## Security
  - Closes exploit where users could build moon-only buildings on planets
*/

-- First, create helper arrays for moon/planet only buildings
CREATE OR REPLACE FUNCTION get_moon_only_buildings()
RETURNS text[] AS $$
BEGIN
  RETURN ARRAY['lunar_base', 'sensor_phalanx', 'jump_gate'];
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_planet_only_buildings()
RETURNS text[] AS $$
BEGIN
  RETURN ARRAY['terraformer', 'metal_mine', 'crystal_mine', 'deuterium_synthesizer', 'solar_plant', 'fusion_reactor', 'metal_storage', 'crystal_storage', 'deuterium_tank', 'research_lab', 'missile_silo'];
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public;

-- Update secure_add_to_building_queue with moon/planet validation
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

-- Update complete_building_queue_item to handle Lunar Base fields increase
CREATE OR REPLACE FUNCTION complete_building_queue_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
  v_building_type building_types%ROWTYPE;
  v_fields_increase integer := 0;
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = v_queue.planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  IF v_queue.end_time IS NULL OR v_queue.end_time > (NOW() + INTERVAL '2 seconds') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Build not complete yet');
  END IF;

  SELECT * INTO v_building_type FROM building_types WHERE id = v_queue.building_type_id;

  SELECT * INTO v_existing_building 
  FROM planet_buildings 
  WHERE planet_id = v_queue.planet_id AND building_type_id = v_queue.building_type_id;

  IF FOUND THEN
    v_levels_added := v_queue.target_level - v_existing_building.level;
    UPDATE planet_buildings 
    SET level = v_queue.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    v_levels_added := v_queue.target_level;
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue.planet_id, v_queue.building_type_id, v_queue.target_level, false);
  END IF;

  IF v_building_type.code = 'lunar_base' THEN
    v_fields_increase := v_levels_added * 3;
    
    UPDATE planets 
    SET 
      fields_used = fields_used + v_levels_added,
      fields_max = fields_max + v_fields_increase
    WHERE id = v_queue.planet_id;
  ELSIF v_building_type.code = 'terraformer' THEN
    v_fields_increase := v_levels_added * 5;
    
    UPDATE planets 
    SET 
      fields_used = fields_used + v_levels_added,
      fields_max = fields_max + v_fields_increase
    WHERE id = v_queue.planet_id;
  ELSE
    IF v_levels_added > 0 THEN
      UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue.planet_id;
    END IF;
  END IF;

  DELETE FROM building_queue WHERE id = p_queue_id;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue.planet_id
  )
  UPDATE building_queue bq
  SET 
    queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND bq.start_time IS NULL THEN NOW() ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND bq.end_time IS NULL THEN NOW() + (bq.build_time || ' seconds')::interval ELSE bq.end_time END
  FROM reordered r
  WHERE bq.id = r.id;

  RETURN jsonb_build_object(
    'success', true, 
    'building_type_id', v_queue.building_type_id, 
    'new_level', v_queue.target_level,
    'fields_increase', v_fields_increase
  );
END;
$$;
