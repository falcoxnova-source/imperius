/*
  # Bot NPC System - Level 1 (Passive Bots)
  
  ## Purpose
  Add AI bot players that build structures and produce resources automatically.
  Bots populate the galaxy so real players find active planets to interact with.
  
  ## Architecture
  - Zero changes to existing functions, tables, or triggers
  - New `is_bot` column on profiles to identify bot accounts
  - New `bot_ai_tick()` function (SECURITY DEFINER) called by pg_cron every 5 minutes
  - Bot logic: sync resources → check queue → decide next building → queue it
  - Bots use the same building cost/time formulas as real players
  - Buildings are completed by the existing `optimized_global_queue_processor` cron
  
  ## Safety
  - SECURITY DEFINER bypasses auth.uid() since bots have no auth session
  - Direct INSERT into building_queue (same schema as secure_add_to_building_queue)
  - Queue limit trigger (max 3 slots without commander) still enforced
  - Bot only queues 1 building at a time to avoid conflicts
  - All existing game mechanics (field limits, resource costs, build times) respected
*/

-- ============================================================
-- 1. Add is_bot column to profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_bot boolean DEFAULT false;

-- Index for fast bot lookup
CREATE INDEX IF NOT EXISTS idx_profiles_is_bot ON profiles(is_bot) WHERE is_bot = true;


-- ============================================================
-- 2. Bot AI Tick Function
-- ============================================================
CREATE OR REPLACE FUNCTION bot_ai_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bot RECORD;
  v_planet RECORD;
  v_resources RECORD;
  v_building RECORD;
  v_bt RECORD;
  v_current_level integer;
  v_queued_count integer;
  v_target_level integer;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_robotics_level integer;
  v_nanite_level integer;
  v_build_time integer;
  v_game_speed integer;
  v_queue_position integer;
  v_total_queued_levels integer;
  v_bots_processed integer := 0;
  v_buildings_queued integer := 0;
  v_priority_codes text[];
  v_chosen_code text;
  v_chosen_bt_id integer;
  v_can_afford boolean;
  v_planet_only text[];
  v_fields_available integer;
BEGIN
  -- Building priority order (OGame standard progression)
  v_priority_codes := ARRAY[
    'metal_mine',              -- 1. Metal income first
    'crystal_mine',            -- 2. Crystal income
    'solar_plant',             -- 3. Energy for mines
    'deuterium_synthesizer',   -- 4. Deuterium income
    'robotics_factory',        -- 5. Speeds up construction
    'shipyard',                -- 6. Required for ships
    'research_lab',            -- 7. Required for research
    'metal_storage',           -- 8. Storage when needed
    'crystal_storage',         -- 9. Storage when needed
    'deuterium_tank'           -- 10. Storage when needed
  ];

  v_planet_only := get_planet_only_buildings();
  v_game_speed := get_game_speed();

  -- Loop through all bot players
  FOR v_bot IN
    SELECT id FROM profiles WHERE is_bot = true
  LOOP
    v_bots_processed := v_bots_processed + 1;

    -- Loop through each bot's planets (only real planets, not moons)
    FOR v_planet IN
      SELECT p.id, p.fields_used, p.fields_max, p.user_id
      FROM planets p
      WHERE p.user_id = v_bot.id AND p.planet_type = 'planet'
    LOOP
      -- 1. Sync resources for this planet
      PERFORM calculate_and_sync_resources_internal(v_planet.id, v_planet.user_id);

      -- 2. Check if there's already a building in queue for this planet
      SELECT COUNT(*) INTO v_queued_count
      FROM building_queue
      WHERE planet_id = v_planet.id;

      -- Only queue if no buildings currently queued (conservative: 1 at a time)
      IF v_queued_count > 0 THEN
        CONTINUE;
      END IF;

      -- 3. Check available fields
      SELECT COALESCE(COUNT(*), 0) INTO v_total_queued_levels
      FROM building_queue WHERE planet_id = v_planet.id;

      v_fields_available := v_planet.fields_max - v_planet.fields_used - v_total_queued_levels;
      IF v_fields_available <= 0 THEN
        CONTINUE;
      END IF;

      -- 4. Get current resources
      SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      -- 5. Get robotics and nanite levels for build time calculation
      SELECT COALESCE(pb.level, 0) INTO v_robotics_level
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = v_planet.id AND bt.code = 'robotics_factory';
      IF v_robotics_level IS NULL THEN v_robotics_level := 0; END IF;

      SELECT COALESCE(pb.level, 0) INTO v_nanite_level
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = v_planet.id AND bt.code = 'nanite_factory';
      IF v_nanite_level IS NULL THEN v_nanite_level := 0; END IF;

      -- 6. Find the best building to construct using smart priority
      v_chosen_code := NULL;
      v_chosen_bt_id := NULL;

      -- Use smart building selection based on current levels
      DECLARE
        v_metal_mine_lvl integer := 0;
        v_crystal_mine_lvl integer := 0;
        v_solar_plant_lvl integer := 0;
        v_deut_synth_lvl integer := 0;
        v_robotics_lvl integer := 0;
        v_shipyard_lvl integer := 0;
        v_lab_lvl integer := 0;
        v_energy_balance bigint;
        v_metal_storage_lvl integer := 0;
        v_crystal_storage_lvl integer := 0;
        v_deut_tank_lvl integer := 0;
        v_try_code text;
        v_try_bt RECORD;
      BEGIN
        -- Fetch all current building levels for this planet
        SELECT COALESCE(pb.level, 0) INTO v_metal_mine_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'metal_mine';
        IF v_metal_mine_lvl IS NULL THEN v_metal_mine_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_crystal_mine_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'crystal_mine';
        IF v_crystal_mine_lvl IS NULL THEN v_crystal_mine_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_solar_plant_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'solar_plant';
        IF v_solar_plant_lvl IS NULL THEN v_solar_plant_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_deut_synth_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'deuterium_synthesizer';
        IF v_deut_synth_lvl IS NULL THEN v_deut_synth_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_robotics_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'robotics_factory';
        IF v_robotics_lvl IS NULL THEN v_robotics_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_shipyard_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'shipyard';
        IF v_shipyard_lvl IS NULL THEN v_shipyard_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_lab_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'research_lab';
        IF v_lab_lvl IS NULL THEN v_lab_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_metal_storage_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'metal_storage';
        IF v_metal_storage_lvl IS NULL THEN v_metal_storage_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_crystal_storage_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'crystal_storage';
        IF v_crystal_storage_lvl IS NULL THEN v_crystal_storage_lvl := 0; END IF;

        SELECT COALESCE(pb.level, 0) INTO v_deut_tank_lvl
        FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
        WHERE pb.planet_id = v_planet.id AND bt.code = 'deuterium_tank';
        IF v_deut_tank_lvl IS NULL THEN v_deut_tank_lvl := 0; END IF;

        -- Smart building decision logic (mimics a reasonable OGame player)
        -- Rule 1: If no metal mine, build metal mine
        -- Rule 2: If metal mine > crystal mine + 2, build crystal mine
        -- Rule 3: If solar plant < metal mine OR solar plant < crystal mine, build solar plant
        -- Rule 4: If deut synth < crystal mine - 3, build deut synth  
        -- Rule 5: If robotics < 2 and metal mine >= 5, build robotics
        -- Rule 6: If shipyard < 1 and robotics >= 2, build shipyard
        -- Rule 7: If lab < 1 and metal mine >= 5, build lab
        -- Rule 8: Storage if mines are high enough
        -- Rule 9: Otherwise, upgrade the lowest priority mine

        IF v_metal_mine_lvl < 1 THEN
          v_chosen_code := 'metal_mine';
        ELSIF v_crystal_mine_lvl < 1 THEN
          v_chosen_code := 'crystal_mine';
        ELSIF v_solar_plant_lvl < v_metal_mine_lvl THEN
          v_chosen_code := 'solar_plant';
        ELSIF v_crystal_mine_lvl < v_metal_mine_lvl - 2 THEN
          v_chosen_code := 'crystal_mine';
        ELSIF v_solar_plant_lvl < v_crystal_mine_lvl THEN
          v_chosen_code := 'solar_plant';
        ELSIF v_deut_synth_lvl < v_crystal_mine_lvl - 3 AND v_crystal_mine_lvl >= 4 THEN
          v_chosen_code := 'deuterium_synthesizer';
        ELSIF v_solar_plant_lvl <= v_deut_synth_lvl AND v_deut_synth_lvl > 0 THEN
          v_chosen_code := 'solar_plant';
        ELSIF v_robotics_lvl < 2 AND v_metal_mine_lvl >= 4 THEN
          v_chosen_code := 'robotics_factory';
        ELSIF v_shipyard_lvl < 1 AND v_robotics_lvl >= 2 THEN
          v_chosen_code := 'shipyard';
        ELSIF v_lab_lvl < 1 AND v_metal_mine_lvl >= 5 THEN
          v_chosen_code := 'research_lab';
        ELSIF v_robotics_lvl < 5 AND v_metal_mine_lvl >= 10 THEN
          v_chosen_code := 'robotics_factory';
        ELSIF v_shipyard_lvl < 4 AND v_robotics_lvl >= 3 AND v_metal_mine_lvl >= 8 THEN
          v_chosen_code := 'shipyard';
        ELSIF v_lab_lvl < 4 AND v_metal_mine_lvl >= 8 THEN
          v_chosen_code := 'research_lab';
        ELSIF v_metal_storage_lvl < 3 AND v_metal_mine_lvl >= 10 THEN
          v_chosen_code := 'metal_storage';
        ELSIF v_crystal_storage_lvl < 3 AND v_crystal_mine_lvl >= 8 THEN
          v_chosen_code := 'crystal_storage';
        ELSIF v_deut_tank_lvl < 2 AND v_deut_synth_lvl >= 6 THEN
          v_chosen_code := 'deuterium_tank';
        ELSE
          -- Default: upgrade metal mine (always useful)
          -- But cap at level 25 to look realistic
          IF v_metal_mine_lvl < 25 THEN
            v_chosen_code := 'metal_mine';
          ELSIF v_crystal_mine_lvl < 22 THEN
            v_chosen_code := 'crystal_mine';
          ELSIF v_deut_synth_lvl < 20 THEN
            v_chosen_code := 'deuterium_synthesizer';
          ELSIF v_solar_plant_lvl < 25 THEN
            v_chosen_code := 'solar_plant';
          ELSE
            -- Planet is well-developed, skip
            v_chosen_code := NULL;
          END IF;
        END IF;

        -- If we chose a building, try to queue it
        IF v_chosen_code IS NOT NULL THEN
          -- Get building type info
          SELECT * INTO v_try_bt FROM building_types WHERE code = v_chosen_code;
          
          IF FOUND THEN
            -- Get current level
            SELECT COALESCE(pb.level, 0) INTO v_current_level
            FROM planet_buildings pb
            WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_try_bt.id;
            IF v_current_level IS NULL THEN v_current_level := 0; END IF;

            v_target_level := v_current_level + 1;

            -- Check max level
            IF v_target_level <= v_try_bt.max_level THEN
              -- Calculate cost
              v_cost_metal := FLOOR(v_try_bt.base_metal * POWER(v_try_bt.cost_factor, v_current_level));
              v_cost_crystal := FLOOR(v_try_bt.base_crystal * POWER(v_try_bt.cost_factor, v_current_level));
              v_cost_deuterium := FLOOR(v_try_bt.base_deuterium * POWER(v_try_bt.cost_factor, v_current_level));

              -- Check if bot can afford it
              IF v_resources.metal >= v_cost_metal 
                 AND v_resources.crystal >= v_cost_crystal 
                 AND v_resources.deuterium >= v_cost_deuterium THEN

                -- Calculate build time (same formula as secure_add_to_building_queue)
                v_build_time := GREATEST(1, FLOOR(
                  (v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed
                ));

                -- Deduct resources
                UPDATE planet_resources
                SET metal = metal - v_cost_metal,
                    crystal = crystal - v_cost_crystal,
                    deuterium = deuterium - v_cost_deuterium,
                    last_update = now()
                WHERE planet_id = v_planet.id;

                -- Insert into building queue (position 1 since queue is empty)
                INSERT INTO building_queue (
                  planet_id, building_type_id, target_level,
                  metal_cost, crystal_cost, deuterium_cost,
                  build_time, queue_position, start_time, end_time
                ) VALUES (
                  v_planet.id, v_try_bt.id, v_target_level,
                  v_cost_metal, v_cost_crystal, v_cost_deuterium,
                  v_build_time, 1, now(), now() + (v_build_time || ' seconds')::interval
                );

                v_buildings_queued := v_buildings_queued + 1;
              END IF;
              -- If can't afford, just skip this tick (resources will accumulate)
            END IF;
          END IF;
        END IF;
      END; -- end inner DECLARE block

    END LOOP; -- end planets loop
  END LOOP; -- end bots loop

  RETURN jsonb_build_object(
    'success', true,
    'bots_processed', v_bots_processed,
    'buildings_queued', v_buildings_queued
  );
END;
$$;


-- ============================================================
-- 3. Schedule cron job (every 5 minutes)
-- ============================================================
SELECT cron.schedule(
  'bot-ai-tick',
  '*/5 * * * *',
  $$SELECT bot_ai_tick()$$
);


-- ============================================================
-- 4. Add comment for documentation
-- ============================================================
COMMENT ON FUNCTION bot_ai_tick() IS 'Bot NPC AI - Level 1: Passive bots that build structures and produce resources automatically. Runs every 5 minutes via pg_cron.';
COMMENT ON COLUMN profiles.is_bot IS 'True for AI bot NPC accounts. Bots are managed by bot_ai_tick() cron function.';
