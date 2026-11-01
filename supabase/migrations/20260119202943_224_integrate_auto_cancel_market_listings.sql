/*
  # Integrate Auto-Cancel Market Listings into Resource-Consuming Functions
  
  ## Summary
  This migration updates all functions that consume resources to automatically
  cancel market listings when the user no longer has enough resources to fulfill them.
  
  ## Functions Updated
  
  ### 1. secure_add_to_building_queue
  - Calls auto_cancel_insufficient_listings after deducting resources
  
  ### 2. secure_add_to_shipyard_queue  
  - Calls auto_cancel_insufficient_listings after deducting resources
  
  ### 3. start_research
  - Calls auto_cancel_insufficient_listings after deducting resources
  
  ## How It Works
  - After resources are deducted for any construction/research
  - The system checks all active market listings for that planet
  - Any listings that exceed the new resource balance are automatically cancelled
  - The user receives a system message for each cancelled listing
  
  ## Important Notes
  - This ensures market listings always reflect actual available resources
  - Users cannot accidentally sell resources they don't have
  - Cancellations happen in order from newest to oldest
*/

-- Update secure_add_to_building_queue with auto-cancel
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

  -- Auto-cancel market listings that exceed available resources
  PERFORM auto_cancel_insufficient_listings(p_planet_id);

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


-- Update secure_add_to_shipyard_queue with auto-cancel
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
  v_planet planets%ROWTYPE;
  v_resources planet_resources%ROWTYPE;
  v_shipyard_level integer;
  v_nanite_level integer;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deuterium_cost bigint;
  v_build_time_per_unit integer;
  v_queue_position integer;
  v_validation jsonb;
  v_game_speed integer;
  v_ship_type ship_types%ROWTYPE;
  v_defense_type defense_types%ROWTYPE;
  v_existing_count integer;
  v_queued_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_quantity <= 0 OR p_quantity > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  IF p_item_type = 'ship' THEN
    v_validation := validate_ship_requirements(p_planet_id, p_type_id);
    IF NOT (v_validation->>'valid')::boolean THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
    END IF;

    SELECT * INTO v_ship_type FROM ship_types WHERE id = p_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
    END IF;

    v_metal_cost := v_ship_type.metal_cost * p_quantity;
    v_crystal_cost := v_ship_type.crystal_cost * p_quantity;
    v_deuterium_cost := v_ship_type.deuterium_cost * p_quantity;
  ELSIF p_item_type = 'defense' THEN
    v_validation := validate_defense_requirements(p_planet_id, p_type_id);
    IF NOT (v_validation->>'valid')::boolean THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
    END IF;

    SELECT * INTO v_defense_type FROM defense_types WHERE id = p_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Defense type not found');
    END IF;

    IF v_defense_type.max_per_planet IS NOT NULL THEN
      SELECT COALESCE(pd.quantity, 0) INTO v_existing_count
      FROM planet_defenses pd
      WHERE pd.planet_id = p_planet_id AND pd.defense_type_id = p_type_id;

      SELECT COALESCE(SUM(sq.quantity - sq.quantity_completed), 0) INTO v_queued_count
      FROM shipyard_queue sq
      WHERE sq.planet_id = p_planet_id AND sq.defense_type_id = p_type_id;

      IF (COALESCE(v_existing_count, 0) + COALESCE(v_queued_count, 0) + p_quantity) > v_defense_type.max_per_planet THEN
        RETURN jsonb_build_object('success', false, 'error', 'Maximum limit reached for this defense type');
      END IF;
    END IF;

    v_metal_cost := v_defense_type.metal_cost * p_quantity;
    v_crystal_cost := v_defense_type.crystal_cost * p_quantity;
    v_deuterium_cost := v_defense_type.deuterium_cost * p_quantity;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid item type');
  END IF;

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF v_resources.metal < v_metal_cost OR v_resources.crystal < v_crystal_cost OR v_resources.deuterium < v_deuterium_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'shipyard';

  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';

  v_game_speed := get_game_speed();

  IF p_item_type = 'ship' THEN
    v_build_time_per_unit := GREATEST(1, FLOOR((v_ship_type.metal_cost + v_ship_type.crystal_cost) / (2500.0 * (1 + COALESCE(v_shipyard_level, 0))) * 3600 / POWER(2, COALESCE(v_nanite_level, 0)) / v_game_speed));
  ELSE
    v_build_time_per_unit := GREATEST(1, FLOOR((v_defense_type.metal_cost + v_defense_type.crystal_cost) / (2500.0 * (1 + COALESCE(v_shipyard_level, 0))) * 3600 / POWER(2, COALESCE(v_nanite_level, 0)) / v_game_speed));
  END IF;

  UPDATE planet_resources
  SET metal = metal - v_metal_cost,
      crystal = crystal - v_crystal_cost,
      deuterium = deuterium - v_deuterium_cost,
      last_update = now()
  WHERE planet_id = p_planet_id;

  -- Auto-cancel market listings that exceed available resources
  PERFORM auto_cancel_insufficient_listings(p_planet_id);

  SELECT COALESCE(MAX(queue_position), 0) INTO v_queue_position FROM shipyard_queue WHERE planet_id = p_planet_id;

  INSERT INTO shipyard_queue (
    planet_id, item_type, ship_type_id, defense_type_id,
    quantity, quantity_completed,
    metal_cost, crystal_cost, deuterium_cost,
    build_time_per_unit, queue_position,
    start_time, current_unit_end_time
  ) VALUES (
    p_planet_id, p_item_type,
    CASE WHEN p_item_type = 'ship' THEN p_type_id ELSE NULL END,
    CASE WHEN p_item_type = 'defense' THEN p_type_id ELSE NULL END,
    p_quantity, 0,
    v_metal_cost, v_crystal_cost, v_deuterium_cost,
    v_build_time_per_unit, v_queue_position + 1,
    CASE WHEN v_queue_position = 0 THEN now() ELSE NULL END,
    CASE WHEN v_queue_position = 0 THEN now() + (v_build_time_per_unit || ' seconds')::interval ELSE NULL END
  );

  RETURN jsonb_build_object('success', true, 'build_time_per_unit', v_build_time_per_unit);
END;
$$;


-- Update start_research with auto-cancel
CREATE OR REPLACE FUNCTION start_research(p_technology_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_tech technology_types%ROWTYPE;
  v_current_level integer;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deut_cost bigint;
  v_research_time integer;
  v_lab_level integer;
  v_existing_research RECORD;
  v_game_speed numeric;
  v_technocrat_bonus numeric := 1.0;
  v_has_technocrat boolean;
  v_total_energy integer;
  v_resources RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND vacation_mode = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot research while in vacation mode');
  END IF;

  SELECT p.* INTO v_planet
  FROM planets p
  JOIN profiles pr ON pr.current_planet_id = p.id
  WHERE pr.id = v_user_id;

  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No planet selected');
  END IF;

  SELECT * INTO v_tech FROM technology_types WHERE id = p_technology_id;
  IF v_tech IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology not found');
  END IF;

  SELECT * INTO v_existing_research
  FROM research_queue
  WHERE user_id = v_user_id AND end_time > NOW();

  IF v_existing_research IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already in progress');
  END IF;

  SELECT COALESCE(level, 0) INTO v_current_level
  FROM user_technologies
  WHERE user_id = v_user_id AND technology_type_id = p_technology_id;
  v_current_level := COALESCE(v_current_level, 0);

  IF v_tech.max_level IS NOT NULL AND v_current_level >= v_tech.max_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum level reached');
  END IF;

  SELECT COALESCE(level, 0) INTO v_lab_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = v_planet.id AND bt.code = 'research_lab';
  v_lab_level := COALESCE(v_lab_level, 0);

  IF v_lab_level < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research Lab required');
  END IF;

  IF NOT validate_technology_requirements(v_user_id, p_technology_id, v_planet.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
  END IF;

  IF v_tech.energy_required > 0 THEN
    SELECT COALESCE(energy_production, 0) - COALESCE(energy_consumption, 0)
    INTO v_total_energy
    FROM planets
    WHERE id = v_planet.id;

    IF COALESCE(v_total_energy, 0) < v_tech.energy_required THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Insufficient energy production. Required: ' || v_tech.energy_required || ', Available: ' || COALESCE(v_total_energy, 0)
      );
    END IF;
  END IF;

  v_metal_cost := CEIL(v_tech.base_metal * POWER(v_tech.cost_factor, v_current_level));
  v_crystal_cost := CEIL(v_tech.base_crystal * POWER(v_tech.cost_factor, v_current_level));
  v_deut_cost := CEIL(v_tech.base_deuterium * POWER(v_tech.cost_factor, v_current_level));

  -- Get resources from planet_resources table
  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
  
  IF v_resources.metal < v_metal_cost OR v_resources.crystal < v_crystal_cost OR v_resources.deuterium < v_deut_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  SELECT COALESCE(value::numeric, 1) INTO v_game_speed
  FROM game_settings WHERE key = 'research_speed';
  v_game_speed := COALESCE(v_game_speed, 1);

  SELECT EXISTS (
    SELECT 1 FROM user_officers uo
    JOIN officer_types ot ON uo.officer_type_id = ot.id
    WHERE uo.user_id = v_user_id 
    AND ot.code = 'technocrat'
    AND uo.expires_at > NOW()
  ) INTO v_has_technocrat;

  IF v_has_technocrat THEN
    v_technocrat_bonus := 0.75;
  END IF;

  v_research_time := GREATEST(1, CEIL(
    (v_tech.base_time_seconds * POWER(v_tech.cost_factor, v_current_level)) 
    / (v_lab_level + 1) 
    / v_game_speed
    * v_technocrat_bonus
  ));

  -- Deduct resources from planet_resources
  UPDATE planet_resources SET
    metal = metal - v_metal_cost,
    crystal = crystal - v_crystal_cost,
    deuterium = deuterium - v_deut_cost,
    last_update = now()
  WHERE planet_id = v_planet.id;

  -- Auto-cancel market listings that exceed available resources
  PERFORM auto_cancel_insufficient_listings(v_planet.id);

  DELETE FROM research_queue WHERE user_id = v_user_id AND end_time <= NOW();

  INSERT INTO research_queue (user_id, technology_type_id, planet_id, start_time, end_time)
  VALUES (v_user_id, p_technology_id, v_planet.id, NOW(), NOW() + (v_research_time || ' seconds')::interval);

  RETURN jsonb_build_object(
    'success', true,
    'research_time', v_research_time,
    'end_time', NOW() + (v_research_time || ' seconds')::interval
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION secure_add_to_building_queue(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION secure_add_to_shipyard_queue(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION start_research(integer) TO authenticated;
