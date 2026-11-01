CREATE OR REPLACE FUNCTION public.secure_start_research(p_planet_id uuid, p_tech_type_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
 SET lock_timeout TO '30s'
AS $function$
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
  v_total_energy bigint;
  v_scaled_energy bigint;
  v_university_level integer;
  v_has_commander boolean;
  v_queue_count integer;
BEGIN
  PERFORM public._occ_guard(p_planet_id); /* [OCUPA1-g] */
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_user_in_vacation_mode(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot research while in vacation mode');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_technologies
    WHERE user_id = auth.uid() AND is_researching = true
  ) INTO v_existing_research;

  SELECT COUNT(*)::integer INTO v_queue_count
  FROM research_queue
  WHERE user_id = auth.uid() AND status IN ('queued', 'pending');

  -- Con investigacion en curso solo se puede ENCOLAR y solo con Comandante
  IF v_existing_research THEN
    v_has_commander := has_active_officer(auth.uid(), 'commander');

    IF NOT v_has_commander THEN
      RETURN jsonb_build_object('success', false, 'error', 'Research already in progress');
    END IF;

    IF v_queue_count >= 2 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Research queue is full');
    END IF;

    IF EXISTS (
      SELECT 1 FROM user_technologies
      WHERE user_id = auth.uid()
        AND technology_type_id = p_tech_type_id
        AND is_researching = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Technology already being researched');
    END IF;

    IF EXISTS (
      SELECT 1 FROM research_queue
      WHERE user_id = auth.uid()
        AND technology_type_id = p_tech_type_id
        AND status IN ('queued', 'pending')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Technology already in queue');
    END IF;
  END IF;

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

  -- Check energy requirement scaled by level (e.g. Graviton Technology)
  IF v_tech_type.energy_required > 0 THEN
    -- energy_max puede venir como numerico con decimales (ej. "300000.0000"),
    -- por eso se castea a numeric y se trunca antes de pasarlo a entero.
    SELECT COALESCE(
             FLOOR(NULLIF(calculate_planet_resources(p_planet_id)->>'energy_max', '')::numeric),
             0
           )::bigint
    INTO v_total_energy;

    v_scaled_energy := CEIL(v_tech_type.energy_required * POWER(v_tech_type.cost_factor, v_current_level));

    IF COALESCE(v_total_energy, 0) < v_scaled_energy THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient energy production. Required: ' || v_scaled_energy || ', Available: ' || COALESCE(v_total_energy, 0)
      );
    END IF;
  END IF;

  v_cost_metal := FLOOR(v_tech_type.base_metal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_crystal := FLOOR(v_tech_type.base_crystal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_deuterium := FLOOR(v_tech_type.base_deuterium * POWER(v_tech_type.cost_factor, v_current_level));

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;
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

  -- VIP Plus: time bonus (game_settings.vip_time_speed_multiplier)
  v_research_time := public.apply_vip_time_bonus(auth.uid(), v_research_time);

  SELECT COALESCE(pb.level, 0) INTO v_university_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'university';

  IF COALESCE(v_university_level, 0) > 0 THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * POWER(0.92, v_university_level)));
  END IF;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium,
      last_update = now()
  WHERE planet_id = p_planet_id;

  -- Hay investigacion en curso -> va a la cola del Comandante
  IF v_existing_research THEN
    INSERT INTO research_queue (
      user_id, technology_type_id, target_level,
      metal_cost, crystal_cost, deuterium_cost,
      research_time, queue_position, status, planet_id
    ) VALUES (
      auth.uid(), p_tech_type_id, v_current_level + 1,
      v_cost_metal, v_cost_crystal, v_cost_deuterium,
      v_research_time, v_queue_count + 1, 'queued', p_planet_id
    );

    RETURN jsonb_build_object(
      'success', true,
      'queued', true,
      'queue_position', v_queue_count + 1,
      'target_level', v_current_level + 1,
      'research_time_seconds', v_research_time,
      'technocrat_bonus', v_has_technocrat
    );
  END IF;

  v_start_time := now();
  v_end_time := v_start_time + (v_research_time || ' seconds')::interval;

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
    'queued', false,
    'target_level', v_current_level + 1,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'research_time_seconds', v_research_time,
    'technocrat_bonus', v_has_technocrat
  );
END;
$function$

