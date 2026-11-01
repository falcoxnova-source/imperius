/*
  # Apply Officer Bonuses to Game Functions
  
  This migration fixes missing officer bonus applications:
  
  1. Technocrat Bonus - Research Time
     - 25% reduction in research time when Technocrat officer is active
     
  2. Technocrat Bonus - Spy Levels  
     - +2 effective espionage tech levels for spy reports
     
  3. Engineer Bonus - Defense Loss Reduction
     - 85% defense rebuild chance (instead of 70%) when Engineer is active
     - This means only 15% of destroyed defenses are permanently lost vs 30%

  4. Helper Functions
     - has_active_officer: Check if user has specific officer active
*/

-- Helper function to check if user has an active officer
CREATE OR REPLACE FUNCTION has_active_officer(p_user_id uuid, p_officer_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_officers uo
    JOIN officer_types ot ON uo.officer_type_id = ot.id
    WHERE uo.user_id = p_user_id 
    AND ot.code = p_officer_code 
    AND uo.expires_at > NOW()
  );
END;
$$;

-- Fix secure_start_research to apply Technocrat bonus (-25% research time)
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
  v_effective_lab_level integer;
  v_research_time integer;
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

  -- Get effective lab level including IRN bonus
  v_effective_lab_level := calculate_irn_lab_level(auth.uid(), p_planet_id);
  IF v_effective_lab_level IS NULL OR v_effective_lab_level < 1 THEN
    v_effective_lab_level := 1;
  END IF;

  -- Get game speed
  v_game_speed := get_game_speed();

  -- Check for Technocrat officer bonus
  v_has_technocrat := has_active_officer(auth.uid(), 'technocrat');

  -- Calculate research time WITH game speed divisor
  -- Formula: (metal + crystal) / (1000 * (1 + labLevel)) * 3600 / GAME_SPEED
  v_research_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_effective_lab_level)) * 3600 / v_game_speed));
  
  -- Apply Technocrat bonus: -25% research time
  IF v_has_technocrat THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * 0.75));
  END IF;
  
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

  RETURN jsonb_build_object(
    'success', true, 
    'target_level', v_current_level + 1, 
    'end_time', v_end_time, 
    'research_time_seconds', v_research_time,
    'technocrat_bonus', v_has_technocrat
  );
END;
$$;

-- Fix generate_espionage_report to apply Technocrat bonus (+2 spy levels)
CREATE OR REPLACE FUNCTION generate_espionage_report(
  p_attacker_id uuid,
  p_target_planet_id uuid,
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_resources RECORD;
  target_buildings JSONB;
  target_ships JSONB;
  target_defenses JSONB;
  target_techs JSONB;
  target_planet RECORD;
  attacker_profile RECORD;
  report_data JSONB;
  attacker_spy_tech INTEGER;
  defender_spy_tech INTEGER;
  effective_attacker_spy INTEGER;
  detection_chance NUMERIC;
  detected BOOLEAN;
  v_has_technocrat BOOLEAN;
BEGIN
  -- Get target planet info
  SELECT * INTO target_planet FROM planets WHERE id = p_target_planet_id;

  -- Get attacker profile for username
  SELECT username INTO attacker_profile FROM profiles WHERE id = p_attacker_id;

  -- Get attacker's espionage tech level
  SELECT COALESCE(ut.level, 0) INTO attacker_spy_tech
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_attacker_id AND tt.code = 'espionage_tech';

  -- Get defender's espionage tech level
  SELECT COALESCE(ut.level, 0) INTO defender_spy_tech
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_target_user_id AND tt.code = 'espionage_tech';

  -- Check for Technocrat officer bonus (+2 effective spy levels)
  v_has_technocrat := has_active_officer(p_attacker_id, 'technocrat');
  
  IF v_has_technocrat THEN
    effective_attacker_spy := attacker_spy_tech + 2;
  ELSE
    effective_attacker_spy := attacker_spy_tech;
  END IF;

  -- Calculate detection chance (XNova-style formula)
  -- Base detection: 50%, modified by tech difference
  -- Higher defender tech = higher detection chance
  -- Formula: 50% + (defender_tech - effective_attacker_tech) * 5%
  detection_chance := 0.5 + ((defender_spy_tech - effective_attacker_spy) * 0.05);
  detection_chance := GREATEST(0.05, LEAST(0.95, detection_chance)); -- Clamp between 5% and 95%

  -- Roll for detection
  detected := random() < detection_chance;

  -- Get target resources
  SELECT metal, crystal, deuterium, energy_used, energy_max
  INTO target_resources
  FROM planet_resources WHERE planet_id = p_target_planet_id;

  -- Get target buildings
  SELECT jsonb_agg(jsonb_build_object(
    'name', bt.name,
    'level', pb.level
  ))
  INTO target_buildings
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_target_planet_id AND pb.level > 0;

  -- Get target ships
  SELECT jsonb_agg(jsonb_build_object(
    'name', st.name,
    'quantity', ps.quantity
  ))
  INTO target_ships
  FROM planet_ships ps
  JOIN ship_types st ON ps.ship_type_id = st.id
  WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0;

  -- Get target defenses
  SELECT jsonb_agg(jsonb_build_object(
    'name', dt.name,
    'quantity', pd.quantity
  ))
  INTO target_defenses
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0;

  -- Get target technologies (if spy tech is high enough)
  -- Only show if effective attacker spy tech >= defender spy tech
  IF effective_attacker_spy >= defender_spy_tech THEN
    SELECT jsonb_agg(jsonb_build_object(
      'name', tt.name,
      'level', ut.level
    ))
    INTO target_techs
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_target_user_id AND ut.level > 0;
  ELSE
    target_techs := NULL;
  END IF;

  -- Build report data
  report_data := jsonb_build_object(
    'planet_name', target_planet.name,
    'coordinates', format('[%s:%s:%s]', target_planet.galaxy, target_planet.solar_system, target_planet.position),
    'resources', jsonb_build_object(
      'metal', COALESCE(target_resources.metal, 0),
      'crystal', COALESCE(target_resources.crystal, 0),
      'deuterium', COALESCE(target_resources.deuterium, 0)
    ),
    'buildings', COALESCE(target_buildings, '[]'::jsonb),
    'ships', COALESCE(target_ships, '[]'::jsonb),
    'defenses', COALESCE(target_defenses, '[]'::jsonb),
    'technologies', COALESCE(target_techs, '[]'::jsonb),
    'counter_espionage', detected,
    'technocrat_bonus', v_has_technocrat
  );

  -- Create message with espionage report for attacker
  INSERT INTO messages (
    sender_id,
    recipient_id,
    subject,
    body,
    message_type
  ) VALUES (
    NULL,
    p_attacker_id,
    'Reporte de Espionaje - ' || target_planet.name,
    report_data::text,
    'espionage'
  );

  -- Notify defender if detected
  IF detected THEN
    INSERT INTO messages (
      sender_id,
      recipient_id,
      subject,
      body,
      message_type
    ) VALUES (
      NULL,
      p_target_user_id,
      'Actividad de espionaje detectada!',
      format('Se detecto actividad de espionaje enemiga en tu planeta %s [%s:%s:%s]. El atacante fue identificado como: %s',
        target_planet.name,
        target_planet.galaxy,
        target_planet.solar_system,
        target_planet.position,
        COALESCE(attacker_profile.username, 'Desconocido')),
      'espionage'
    );
  END IF;
END;
$$;

-- Create function to get defense rebuild chance based on Engineer officer
CREATE OR REPLACE FUNCTION get_defense_rebuild_chance(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Engineer bonus: 85% rebuild chance instead of 70%
  -- This means 15% permanent loss instead of 30%
  IF has_active_officer(p_user_id, 'engineer') THEN
    RETURN 0.85;
  ELSE
    RETURN 0.70;
  END IF;
END;
$$;

-- Update process_fleet_arrival to use Engineer bonus for defense rebuild
-- We need to update the attack section of process_fleet_arrival
CREATE OR REPLACE FUNCTION rebuild_destroyed_defenses(
  p_planet_id uuid,
  p_destroyed_defenses jsonb,
  p_defender_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit jsonb;
  v_destroyed_qty INTEGER;
  v_rebuilt_qty INTEGER;
  v_i INTEGER;
  v_rebuild_chance NUMERIC;
BEGIN
  -- Get rebuild chance based on Engineer officer
  v_rebuild_chance := get_defense_rebuild_chance(p_defender_user_id);

  FOR v_unit IN SELECT * FROM jsonb_array_elements(p_destroyed_defenses)
  LOOP
    v_destroyed_qty := (v_unit->>'quantity')::integer;
    v_rebuilt_qty := 0;
    
    -- Roll for each destroyed defense unit
    FOR v_i IN 1..v_destroyed_qty LOOP
      IF random() < v_rebuild_chance THEN
        v_rebuilt_qty := v_rebuilt_qty + 1;
      END IF;
    END LOOP;

    -- Update defense quantity (add rebuilt units)
    IF v_rebuilt_qty > 0 THEN
      UPDATE planet_defenses
      SET quantity = quantity + v_rebuilt_qty
      WHERE planet_id = p_planet_id 
      AND defense_type_id = (v_unit->>'defense_type_id')::integer;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION has_active_officer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_defense_rebuild_chance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rebuild_destroyed_defenses(uuid, jsonb, uuid) TO authenticated;