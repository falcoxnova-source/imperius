CREATE OR REPLACE FUNCTION public.start_research(p_technology_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_scaled_energy bigint;
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

  -- Check energy requirement scaled by level (e.g. Graviton Technology)
  IF v_tech.energy_required > 0 THEN
    SELECT COALESCE(energy_production, 0) - COALESCE(energy_consumption, 0)
    INTO v_total_energy
    FROM planets
    WHERE id = v_planet.id;

    v_scaled_energy := CEIL(v_tech.energy_required * POWER(v_tech.cost_factor, v_current_level));

    IF COALESCE(v_total_energy, 0) < v_scaled_energy THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient energy production. Required: ' || v_scaled_energy || ', Available: ' || COALESCE(v_total_energy, 0)
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
$function$

