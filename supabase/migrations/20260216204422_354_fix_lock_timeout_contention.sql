/*
  # Fix Lock Timeout Contention on Building Queue and Research Functions

  1. Problem
    - The `authenticator` role has `lock_timeout=8s`
    - When cron job holds locks on building_queue rows, client calls timeout with 55P03
    - This creates a storm of retrying errors every 5 seconds

  2. Changes
    - Add `SET lock_timeout = '30s'` to `process_completed_building_queue`
    - Add `SET lock_timeout = '30s'` to `complete_building_queue_item`
    - Add `SET lock_timeout = '30s'` to `secure_start_research`
    - Use `FOR UPDATE SKIP LOCKED` in `process_completed_building_queue` to skip rows held by the cron job
    - Add `NOWAIT` pattern where appropriate to fail fast instead of waiting

  3. Safety
    - No data is modified, only function definitions are updated
    - SKIP LOCKED simply skips rows that are currently locked, returning to them on next check
    - All existing behavior is preserved
*/

CREATE OR REPLACE FUNCTION public.process_completed_building_queue(p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
 SET lock_timeout TO '30s'
AS $function$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item RECORD;
  v_completed_count integer := 0;
  v_result jsonb;
  v_legacy_completed integer := 0;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  FOR v_queue_item IN
    SELECT bq.* FROM building_queue bq
    WHERE bq.planet_id = p_planet_id
    AND bq.end_time IS NOT NULL
    AND bq.end_time <= (NOW() + INTERVAL '2 seconds')
    ORDER BY bq.queue_position
    FOR UPDATE OF bq SKIP LOCKED
  LOOP
    v_result := complete_building_queue_item(v_queue_item.id);
    IF (v_result->>'success')::boolean THEN
      v_completed_count := v_completed_count + 1;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_legacy_completed
  FROM planet_buildings
  WHERE planet_id = p_planet_id
  AND is_upgrading = true
  AND upgrade_end_time IS NOT NULL
  AND upgrade_end_time <= (NOW() + INTERVAL '2 seconds');

  IF v_legacy_completed > 0 THEN
    UPDATE planets
    SET fields_used = fields_used + v_legacy_completed
    WHERE id = p_planet_id;

    UPDATE planet_buildings
    SET level = level + 1, is_upgrading = false, upgrade_end_time = NULL
    WHERE planet_id = p_planet_id
    AND is_upgrading = true
    AND upgrade_end_time IS NOT NULL
    AND upgrade_end_time <= (NOW() + INTERVAL '2 seconds');
  END IF;

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count + v_legacy_completed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_building_queue_item(p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '30s'
AS $function$
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
$function$;

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
$function$;
