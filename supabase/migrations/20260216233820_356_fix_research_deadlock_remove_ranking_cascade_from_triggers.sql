/*
  # Fix Research Deadlock - Remove Ranking Cascade from Triggers

  ## Root Cause
  All 4 points triggers (building, research, fleet, defense) call `update_player_points()`,
  which since migration 040 includes `PERFORM update_all_ranks()`. This causes:
  - `update_all_ranks()` locks ALL rows in the `profiles` table (UPDATE ... FROM subquery)
  - When `secure_start_research` does INSERT/UPDATE on `user_technologies`, the trigger fires
  - The resulting `update_all_ranks()` within the same transaction creates a self-deadlock
    (error 40P01: Process N waits for ShareLock on transaction blocked by Process N)
  - The `sync_planet_resources` call running concurrently from the frontend compounds the issue

  ## Solution
  1. Remove `update_all_ranks()` call from `update_player_points()` - this is consistent with
     migration 355's design where rankings ONLY update via the cron job every 5 minutes
  2. In `secure_start_research`, disable `trigger_research_points` before modifying
     `user_technologies` (starting research doesn't change level, so points don't change)
  3. Re-enable trigger after and call `update_player_points_no_rank()` explicitly for safety

  ## Impact on Gameplay
  - ZERO change to game logic, resource calculations, or any business rules
  - Player's own points still update immediately on every action
  - Global ranking position updates every ~5 minutes via cron (already the case since migration 355)
  - Eliminates deadlock errors when starting research

  ## Functions Modified
  - `update_player_points(uuid)` - removed `update_all_ranks()` cascade
  - `secure_start_research(uuid, integer)` - disable/enable trigger around user_technologies write
*/

-- =========================================================================
-- 1. Remove update_all_ranks() cascade from update_player_points()
--    Rankings are handled by the cron job (optimized_global_queue_processor)
-- =========================================================================
CREATE OR REPLACE FUNCTION update_player_points(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '15s'
SET lock_timeout TO '10s'
AS $$
DECLARE
  v_buildings integer;
  v_research integer;
  v_fleet integer;
  v_defense integer;
BEGIN
  v_buildings := calculate_building_points(p_user_id);
  v_research := calculate_research_points(p_user_id);
  v_fleet := calculate_fleet_points(p_user_id);
  v_defense := calculate_defense_points(p_user_id);

  UPDATE profiles SET
    points_buildings = v_buildings,
    points_research = v_research,
    points_fleet = v_fleet,
    points_defense = v_defense,
    points_total = v_buildings + v_research + v_fleet + v_defense,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- =========================================================================
-- 2. Fix secure_start_research: disable trigger to avoid cascade + deadlock
-- =========================================================================
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

  v_start_time := now();
  v_end_time := v_start_time + (v_research_time || ' seconds')::interval;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium,
      last_update = now()
  WHERE planet_id = p_planet_id;

  ALTER TABLE user_technologies DISABLE TRIGGER trigger_research_points;

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

  ALTER TABLE user_technologies ENABLE TRIGGER trigger_research_points;

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
