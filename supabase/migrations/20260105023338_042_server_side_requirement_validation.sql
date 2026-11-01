/*
  # Server-Side Requirement Validation

  1. Purpose
    - Add server-side validation functions to prevent cheating
    - Validates requirements BEFORE allowing building, research, or shipyard actions
    - This ensures security even if frontend validation is bypassed

  2. New Functions
    - `validate_building_requirements(p_planet_id, p_building_type_id)` - Validates building prerequisites
    - `validate_research_requirements(p_user_id, p_planet_id, p_tech_type_id)` - Validates research prerequisites
    - `validate_ship_requirements(p_planet_id, p_ship_type_id)` - Validates ship prerequisites
    - `validate_defense_requirements(p_planet_id, p_defense_type_id)` - Validates defense prerequisites
    - `secure_add_to_building_queue(...)` - Secure building queue function
    - `secure_start_research(...)` - Secure research start function
    - `secure_add_to_shipyard_queue(...)` - Secure shipyard queue function

  3. Security
    - All functions validate ownership and requirements
    - Cannot bypass by calling frontend directly
*/

-- Function to validate building requirements
CREATE OR REPLACE FUNCTION validate_building_requirements(
  p_planet_id uuid,
  p_building_type_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requirement RECORD;
  v_current_level integer;
  v_missing_reqs jsonb := '[]'::jsonb;
  v_planet RECORD;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Planet not found');
  END IF;

  FOR v_requirement IN
    SELECT br.*, 
           bt.name as building_name, 
           tt.name as tech_name
    FROM building_requirements br
    LEFT JOIN building_types bt ON bt.id = br.required_building_id
    LEFT JOIN technology_types tt ON tt.id = br.required_tech_id
    WHERE br.building_type_id = p_building_type_id
  LOOP
    IF v_requirement.required_building_id IS NOT NULL THEN
      SELECT COALESCE(pb.level, 0) INTO v_current_level
      FROM planet_buildings pb
      WHERE pb.planet_id = p_planet_id
        AND pb.building_type_id = v_requirement.required_building_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_building_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'building',
          'name', v_requirement.building_name,
          'required', v_requirement.required_building_level,
          'current', v_current_level
        );
      END IF;
    END IF;

    IF v_requirement.required_tech_id IS NOT NULL THEN
      SELECT COALESCE(ut.level, 0) INTO v_current_level
      FROM user_technologies ut
      WHERE ut.user_id = v_planet.user_id
        AND ut.technology_type_id = v_requirement.required_tech_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_tech_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'technology',
          'name', v_requirement.tech_name,
          'required', v_requirement.required_tech_level,
          'current', v_current_level
        );
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_missing_reqs) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'missing', v_missing_reqs);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- Function to validate research requirements
CREATE OR REPLACE FUNCTION validate_research_requirements(
  p_user_id uuid,
  p_planet_id uuid,
  p_tech_type_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requirement RECORD;
  v_current_level integer;
  v_missing_reqs jsonb := '[]'::jsonb;
BEGIN
  FOR v_requirement IN
    SELECT tr.*, 
           bt.name as building_name, 
           tt.name as tech_name
    FROM technology_requirements tr
    LEFT JOIN building_types bt ON bt.id = tr.required_building_id
    LEFT JOIN technology_types tt ON tt.id = tr.required_tech_id
    WHERE tr.technology_type_id = p_tech_type_id
  LOOP
    IF v_requirement.required_building_id IS NOT NULL THEN
      SELECT COALESCE(pb.level, 0) INTO v_current_level
      FROM planet_buildings pb
      WHERE pb.planet_id = p_planet_id
        AND pb.building_type_id = v_requirement.required_building_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_building_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'building',
          'name', v_requirement.building_name,
          'required', v_requirement.required_building_level,
          'current', v_current_level
        );
      END IF;
    END IF;

    IF v_requirement.required_tech_id IS NOT NULL THEN
      SELECT COALESCE(ut.level, 0) INTO v_current_level
      FROM user_technologies ut
      WHERE ut.user_id = p_user_id
        AND ut.technology_type_id = v_requirement.required_tech_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_tech_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'technology',
          'name', v_requirement.tech_name,
          'required', v_requirement.required_tech_level,
          'current', v_current_level
        );
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_missing_reqs) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'missing', v_missing_reqs);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- Function to validate ship requirements
CREATE OR REPLACE FUNCTION validate_ship_requirements(
  p_planet_id uuid,
  p_ship_type_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requirement RECORD;
  v_current_level integer;
  v_missing_reqs jsonb := '[]'::jsonb;
  v_planet RECORD;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Planet not found');
  END IF;

  FOR v_requirement IN
    SELECT sr.*, 
           bt.name as building_name, 
           tt.name as tech_name
    FROM ship_requirements sr
    LEFT JOIN building_types bt ON bt.id = sr.required_building_id
    LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
    WHERE sr.ship_type_id = p_ship_type_id
  LOOP
    IF v_requirement.required_building_id IS NOT NULL THEN
      SELECT COALESCE(pb.level, 0) INTO v_current_level
      FROM planet_buildings pb
      WHERE pb.planet_id = p_planet_id
        AND pb.building_type_id = v_requirement.required_building_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_building_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'building',
          'name', v_requirement.building_name,
          'required', v_requirement.required_building_level,
          'current', v_current_level
        );
      END IF;
    END IF;

    IF v_requirement.required_tech_id IS NOT NULL THEN
      SELECT COALESCE(ut.level, 0) INTO v_current_level
      FROM user_technologies ut
      WHERE ut.user_id = v_planet.user_id
        AND ut.technology_type_id = v_requirement.required_tech_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_tech_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'technology',
          'name', v_requirement.tech_name,
          'required', v_requirement.required_tech_level,
          'current', v_current_level
        );
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_missing_reqs) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'missing', v_missing_reqs);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- Function to validate defense requirements
CREATE OR REPLACE FUNCTION validate_defense_requirements(
  p_planet_id uuid,
  p_defense_type_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requirement RECORD;
  v_current_level integer;
  v_missing_reqs jsonb := '[]'::jsonb;
  v_planet RECORD;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Planet not found');
  END IF;

  FOR v_requirement IN
    SELECT dr.*, 
           bt.name as building_name, 
           tt.name as tech_name
    FROM defense_requirements dr
    LEFT JOIN building_types bt ON bt.id = dr.required_building_id
    LEFT JOIN technology_types tt ON tt.id = dr.required_tech_id
    WHERE dr.defense_type_id = p_defense_type_id
  LOOP
    IF v_requirement.required_building_id IS NOT NULL THEN
      SELECT COALESCE(pb.level, 0) INTO v_current_level
      FROM planet_buildings pb
      WHERE pb.planet_id = p_planet_id
        AND pb.building_type_id = v_requirement.required_building_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_building_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'building',
          'name', v_requirement.building_name,
          'required', v_requirement.required_building_level,
          'current', v_current_level
        );
      END IF;
    END IF;

    IF v_requirement.required_tech_id IS NOT NULL THEN
      SELECT COALESCE(ut.level, 0) INTO v_current_level
      FROM user_technologies ut
      WHERE ut.user_id = v_planet.user_id
        AND ut.technology_type_id = v_requirement.required_tech_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_tech_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'technology',
          'name', v_requirement.tech_name,
          'required', v_requirement.required_tech_level,
          'current', v_current_level
        );
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_missing_reqs) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'missing', v_missing_reqs);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- Secure function to add to building queue with server-side validation
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  v_validation := validate_building_requirements(p_planet_id, p_building_type_id);
  IF NOT (v_validation->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
  END IF;

  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building type not found');
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

  v_build_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (2500 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600));

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

  RETURN jsonb_build_object('success', true, 'target_level', v_target_level);
END;
$$;

-- Secure function to start research with server-side validation
CREATE OR REPLACE FUNCTION secure_start_research(
  p_planet_id uuid,
  p_tech_type_id integer
)
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
  v_lab_level integer;
  v_research_time integer;
  v_end_time timestamptz;
  v_existing_research boolean;
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

  SELECT COALESCE(pb.level, 0) INTO v_lab_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'research_lab';
  IF v_lab_level IS NULL THEN v_lab_level := 0; END IF;

  v_research_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (1000 * (1 + v_lab_level)) * 3600));
  v_end_time := now() + (v_research_time || ' seconds')::interval;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium,
      last_update = now()
  WHERE planet_id = p_planet_id;

  INSERT INTO user_technologies (
    user_id, technology_type_id, level, is_researching, research_end_time, research_planet_id
  ) VALUES (
    auth.uid(), p_tech_type_id, v_current_level, true, v_end_time, p_planet_id
  )
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
    is_researching = true,
    research_end_time = v_end_time,
    research_planet_id = p_planet_id;

  RETURN jsonb_build_object('success', true, 'target_level', v_current_level + 1, 'end_time', v_end_time);
END;
$$;

-- Secure function to add to shipyard queue with server-side validation
CREATE OR REPLACE FUNCTION secure_add_to_shipyard_queue(
  p_planet_id uuid,
  p_item_type text,
  p_type_id integer,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation jsonb;
  v_planet RECORD;
  v_item_type RECORD;
  v_resources RECORD;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_shipyard_level integer;
  v_nanite_level integer;
  v_build_time_per_unit integer;
  v_queue_position integer;
  v_is_first boolean;
  v_start_time timestamptz;
  v_current_unit_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  IF p_item_type = 'ship' THEN
    v_validation := validate_ship_requirements(p_planet_id, p_type_id);
    IF NOT (v_validation->>'valid')::boolean THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
    END IF;

    SELECT * INTO v_item_type FROM ship_types WHERE id = p_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
    END IF;

    v_cost_metal := v_item_type.metal_cost * p_quantity;
    v_cost_crystal := v_item_type.crystal_cost * p_quantity;
    v_cost_deuterium := v_item_type.deuterium_cost * p_quantity;

  ELSIF p_item_type = 'defense' THEN
    v_validation := validate_defense_requirements(p_planet_id, p_type_id);
    IF NOT (v_validation->>'valid')::boolean THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
    END IF;

    SELECT * INTO v_item_type FROM defense_types WHERE id = p_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Defense type not found');
    END IF;

    v_cost_metal := v_item_type.metal_cost * p_quantity;
    v_cost_crystal := v_item_type.crystal_cost * p_quantity;
    v_cost_deuterium := v_item_type.deuterium_cost * p_quantity;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid item type');
  END IF;

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF v_resources.metal < v_cost_metal OR v_resources.crystal < v_cost_crystal OR v_resources.deuterium < v_cost_deuterium THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'shipyard';
  IF v_shipyard_level IS NULL THEN v_shipyard_level := 0; END IF;

  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';
  IF v_nanite_level IS NULL THEN v_nanite_level := 0; END IF;

  v_build_time_per_unit := GREATEST(1, FLOOR((v_item_type.metal_cost + v_item_type.crystal_cost) / (2500 * (1 + v_shipyard_level) * POWER(2, v_nanite_level)) * 3600));

  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_queue_position FROM shipyard_queue WHERE planet_id = p_planet_id;

  v_is_first := v_queue_position = 1;
  IF v_is_first THEN
    v_start_time := now();
    v_current_unit_end := now() + (v_build_time_per_unit || ' seconds')::interval;
  ELSE
    v_start_time := NULL;
    v_current_unit_end := NULL;
  END IF;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium,
      last_update = now()
  WHERE planet_id = p_planet_id;

  INSERT INTO shipyard_queue (
    planet_id, item_type, 
    ship_type_id, defense_type_id,
    quantity, quantity_completed,
    metal_cost, crystal_cost, deuterium_cost,
    build_time_per_unit, queue_position,
    start_time, current_unit_end_time
  ) VALUES (
    p_planet_id, p_item_type,
    CASE WHEN p_item_type = 'ship' THEN p_type_id ELSE NULL END,
    CASE WHEN p_item_type = 'defense' THEN p_type_id ELSE NULL END,
    p_quantity, 0,
    v_cost_metal, v_cost_crystal, v_cost_deuterium,
    v_build_time_per_unit, v_queue_position,
    v_start_time, v_current_unit_end
  );

  RETURN jsonb_build_object('success', true, 'quantity', p_quantity);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION validate_building_requirements(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_research_requirements(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_ship_requirements(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_defense_requirements(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION secure_add_to_building_queue(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION secure_start_research(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION secure_add_to_shipyard_queue(uuid, text, integer, integer) TO authenticated;