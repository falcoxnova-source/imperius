/*
  # Bot NPC System - Level 2 (Research + Ships + Defenses)
  
  ## Purpose
  Upgrade bot AI to also research technologies, build ships, and construct defenses.
  This makes bots appear as real players when scanned via espionage probes.
  
  ## Changes
  - CREATE OR REPLACE `bot_ai_tick()` — replaces Level 1 (buildings-only) version
  - Zero changes to any other function, table, trigger, or cron schedule
  - The existing pg_cron job `bot-ai-tick` (every 5 min) calls this automatically
  
  ## Architecture
  - Phase A: Buildings (same as Level 1 — unchanged logic)
  - Phase B: Research — UPSERT into `user_technologies` with `is_researching = true`
    - The existing `optimized_global_queue_processor` detects `is_researching = true` 
      AND `research_end_time <= NOW()` and completes it (level + 1, is_researching = false)
    - Research time formula: FLOOR((metal+crystal) / (1000 * (1+lab_level)) * 3600 / game_speed)
    - Cost formula: base_metal * POWER(cost_factor, current_level) (same for crystal/deut)
    - Must DISABLE/ENABLE `trigger_research_points` to avoid deadlock (same pattern as secure_start_research)
  - Phase C: Ships — INSERT into `shipyard_queue` with `item_type = 'ship'`
    - Build time: FLOOR((metal+crystal) / (2500 * (1+shipyard_level)) * 3600 / POWER(2, nanite_level) / game_speed)
    - The existing queue processor handles completion (inserts into planet_ships)
  - Phase D: Defenses — INSERT into `shipyard_queue` with `item_type = 'defense'`
    - Same build time formula as ships
    - Respects `max_per_planet` for shield domes
    - The existing queue processor handles completion (inserts into planet_defenses)
  
  ## Safety
  - Bots only do ONE action per phase per tick (1 building, 1 research, 1 ship batch, 1 defense batch)
  - All requirement checks done inline (building levels + tech levels from *_requirements tables)
  - All cost/time formulas match the real player functions exactly
  - No new tables, triggers, or cron jobs created
*/

-- ============================================================
-- Replace bot_ai_tick with Level 2 (buildings + research + ships + defenses)
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
  v_total_queued_levels integer;
  v_bots_processed integer := 0;
  v_buildings_queued integer := 0;
  v_research_started integer := 0;
  v_ships_queued integer := 0;
  v_defenses_queued integer := 0;
  v_chosen_code text;
  v_fields_available integer;
  -- Research variables
  v_is_researching boolean;
  v_lab_level integer;
  v_tech RECORD;
  v_tech_current_level integer;
  v_research_time integer;
  v_research_priority text[];
  -- Shipyard variables
  v_shipyard_level integer;
  v_shipyard_busy boolean;
  v_ship RECORD;
  v_ship_qty integer;
  v_ship_build_time integer;
  v_ship_priority text[];
  v_existing_ship_count integer;
  -- Defense variables
  v_def RECORD;
  v_def_qty integer;
  v_def_build_time integer;
  v_defense_priority text[];
  v_existing_def_count integer;
  v_max_per_planet integer;
  -- Requirement check
  v_req RECORD;
  v_req_met boolean;
  v_req_level integer;
BEGIN
  v_game_speed := get_game_speed();

  -- ================================================================
  -- MAIN LOOP: iterate over all bot players
  -- ================================================================
  FOR v_bot IN
    SELECT id FROM profiles WHERE is_bot = true
  LOOP
    v_bots_processed := v_bots_processed + 1;

    -- Loop through each bot's planets
    FOR v_planet IN
      SELECT p.id, p.fields_used, p.fields_max, p.user_id
      FROM planets p
      WHERE p.user_id = v_bot.id AND p.planet_type = 'planet'
    LOOP

      -- Sync resources for this planet
      PERFORM calculate_and_sync_resources_internal(v_planet.id, v_planet.user_id);

      -- Fetch current resources (will be re-fetched after building deduction if needed)
      SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
      IF NOT FOUND THEN CONTINUE; END IF;

      -- Fetch key building levels (used by multiple phases)
      SELECT COALESCE(pb.level, 0) INTO v_robotics_level
      FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = v_planet.id AND bt.code = 'robotics_factory';
      v_robotics_level := COALESCE(v_robotics_level, 0);

      SELECT COALESCE(pb.level, 0) INTO v_nanite_level
      FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = v_planet.id AND bt.code = 'nanite_factory';
      v_nanite_level := COALESCE(v_nanite_level, 0);

      SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
      FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = v_planet.id AND bt.code = 'shipyard';
      v_shipyard_level := COALESCE(v_shipyard_level, 0);

      SELECT COALESCE(pb.level, 0) INTO v_lab_level
      FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = v_planet.id AND bt.code = 'research_lab';
      v_lab_level := COALESCE(v_lab_level, 0);


      -- ============================================================
      -- PHASE A: BUILDINGS (same logic as Level 1)
      -- ============================================================
      SELECT COUNT(*) INTO v_queued_count
      FROM building_queue WHERE planet_id = v_planet.id;

      IF v_queued_count = 0 THEN
        -- Check available fields
        v_fields_available := v_planet.fields_max - v_planet.fields_used;
        IF v_fields_available > 0 THEN
          -- Smart building selection using prioritized list with fallback
          DECLARE
            v_metal_mine_lvl integer := 0;
            v_crystal_mine_lvl integer := 0;
            v_solar_plant_lvl integer := 0;
            v_deut_synth_lvl integer := 0;
            v_robotics_lvl integer := 0;
            v_shipyard_lvl integer := 0;
            v_lab_lvl integer := 0;
            v_metal_storage_lvl integer := 0;
            v_crystal_storage_lvl integer := 0;
            v_deut_tank_lvl integer := 0;
            v_try_bt RECORD;
            v_building_wish_list text[];
            v_bw_idx integer;
            v_building_queued boolean := false;
          BEGIN
            SELECT COALESCE(pb.level, 0) INTO v_metal_mine_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'metal_mine';
            v_metal_mine_lvl := COALESCE(v_metal_mine_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_crystal_mine_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'crystal_mine';
            v_crystal_mine_lvl := COALESCE(v_crystal_mine_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_solar_plant_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'solar_plant';
            v_solar_plant_lvl := COALESCE(v_solar_plant_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_deut_synth_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'deuterium_synthesizer';
            v_deut_synth_lvl := COALESCE(v_deut_synth_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_robotics_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'robotics_factory';
            v_robotics_lvl := COALESCE(v_robotics_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_shipyard_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'shipyard';
            v_shipyard_lvl := COALESCE(v_shipyard_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_lab_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'research_lab';
            v_lab_lvl := COALESCE(v_lab_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_metal_storage_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'metal_storage';
            v_metal_storage_lvl := COALESCE(v_metal_storage_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_crystal_storage_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'crystal_storage';
            v_crystal_storage_lvl := COALESCE(v_crystal_storage_lvl, 0);

            SELECT COALESCE(pb.level, 0) INTO v_deut_tank_lvl
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = v_planet.id AND bt.code = 'deuterium_tank';
            v_deut_tank_lvl := COALESCE(v_deut_tank_lvl, 0);

            -- Build a prioritized wish-list (ordered by priority, try each until one is affordable)
            v_building_wish_list := ARRAY[]::text[];

            IF v_metal_mine_lvl < 1 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
            END IF;
            IF v_crystal_mine_lvl < 1 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
            END IF;
            IF v_solar_plant_lvl < v_metal_mine_lvl THEN
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            END IF;
            IF v_crystal_mine_lvl < v_metal_mine_lvl - 2 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
            END IF;
            IF v_solar_plant_lvl < v_crystal_mine_lvl THEN
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            END IF;
            IF v_deut_synth_lvl < v_crystal_mine_lvl - 3 AND v_crystal_mine_lvl >= 4 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
            END IF;
            IF v_solar_plant_lvl <= v_deut_synth_lvl AND v_deut_synth_lvl > 0 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            END IF;
            IF v_robotics_lvl < 2 AND v_metal_mine_lvl >= 4 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory');
            END IF;
            IF v_shipyard_lvl < 1 AND v_robotics_lvl >= 2 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'shipyard');
            END IF;
            IF v_lab_lvl < 1 AND v_metal_mine_lvl >= 5 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'research_lab');
            END IF;
            IF v_robotics_lvl < 5 AND v_metal_mine_lvl >= 10 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory');
            END IF;
            IF v_shipyard_lvl < 4 AND v_robotics_lvl >= 3 AND v_metal_mine_lvl >= 8 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'shipyard');
            END IF;
            IF v_lab_lvl < 4 AND v_metal_mine_lvl >= 8 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'research_lab');
            END IF;
            IF v_metal_storage_lvl < 3 AND v_metal_mine_lvl >= 10 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'metal_storage');
            END IF;
            IF v_crystal_storage_lvl < 3 AND v_crystal_mine_lvl >= 8 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage');
            END IF;
            IF v_deut_tank_lvl < 2 AND v_deut_synth_lvl >= 6 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank');
            END IF;
            -- Fallback: always append basic resource buildings
            IF v_metal_mine_lvl < 25 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
            END IF;
            IF v_crystal_mine_lvl < 22 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
            END IF;
            IF v_deut_synth_lvl < 20 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
            END IF;
            IF v_solar_plant_lvl < 25 THEN
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            END IF;

            -- Try each building in the wish list until we can afford one
            v_building_queued := false;
            FOR v_bw_idx IN 1..COALESCE(array_length(v_building_wish_list, 1), 0) LOOP
              EXIT WHEN v_building_queued;

              SELECT * INTO v_try_bt FROM building_types WHERE code = v_building_wish_list[v_bw_idx];
              IF NOT FOUND THEN CONTINUE; END IF;

              SELECT COALESCE(pb.level, 0) INTO v_current_level
              FROM planet_buildings pb
              WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_try_bt.id;
              v_current_level := COALESCE(v_current_level, 0);

              v_target_level := v_current_level + 1;
              IF v_target_level > v_try_bt.max_level THEN CONTINUE; END IF;

              v_cost_metal := FLOOR(v_try_bt.base_metal * POWER(v_try_bt.cost_factor, v_current_level));
              v_cost_crystal := FLOOR(v_try_bt.base_crystal * POWER(v_try_bt.cost_factor, v_current_level));
              v_cost_deuterium := FLOOR(v_try_bt.base_deuterium * POWER(v_try_bt.cost_factor, v_current_level));

              IF v_resources.metal >= v_cost_metal
                 AND v_resources.crystal >= v_cost_crystal
                 AND v_resources.deuterium >= v_cost_deuterium THEN

                v_build_time := GREATEST(1, FLOOR(
                  (v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed
                ));

                UPDATE planet_resources
                SET metal = metal - v_cost_metal,
                    crystal = crystal - v_cost_crystal,
                    deuterium = deuterium - v_cost_deuterium,
                    last_update = now()
                WHERE planet_id = v_planet.id;

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
                v_building_queued := true;

                -- Re-fetch resources after spending
                SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              END IF;
              -- If can't afford, try next in wish list
            END LOOP;
          END; -- end building DECLARE block
        END IF; -- end fields_available check
      END IF; -- end queued_count = 0 check


      -- ============================================================
      -- PHASE B: RESEARCH (new in Level 2)
      -- ============================================================
      -- Only research if lab exists (level >= 1) and nothing is currently researching
      IF v_lab_level >= 1 THEN
        SELECT EXISTS(
          SELECT 1 FROM user_technologies
          WHERE user_id = v_bot.id AND is_researching = true
        ) INTO v_is_researching;

        IF NOT v_is_researching THEN
          -- Research priority order (OGame standard progression)
          -- Early techs first, then military techs
          v_research_priority := ARRAY[
            'energy_tech',        -- Required by many others
            'combustion_drive',   -- Ship speed
            'espionage_tech',     -- Espionage
            'computer_tech',      -- Fleet slots
            'armour_tech',        -- Defense (NOTE: armour not armor)
            'weapons_tech',       -- Attack
            'shielding_tech',     -- Shields
            'impulse_drive',      -- Better ship speed
            'laser_tech',         -- Required for some defenses
            'ion_tech',           -- Required for some defenses
            'hyperspace_tech',    -- Advanced
            'plasma_tech',        -- Advanced
            'astrophysics',       -- Colonies
            'hyperspace_drive'    -- Advanced speed
          ];

          -- Try each tech in priority order
          FOR i IN 1..array_length(v_research_priority, 1) LOOP
            SELECT * INTO v_tech FROM technology_types WHERE code = v_research_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;

            -- Get current tech level
            SELECT COALESCE(ut.level, 0) INTO v_tech_current_level
            FROM user_technologies ut
            WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_tech.id;
            v_tech_current_level := COALESCE(v_tech_current_level, 0);

            -- Cap research at reasonable levels for bots
            IF v_tech_current_level >= LEAST(v_tech.max_level, 12) THEN
              CONTINUE;
            END IF;

            -- Check technology requirements (building + tech prereqs)
            v_req_met := true;
            FOR v_req IN
              SELECT tr.required_building_id, tr.required_building_level,
                     tr.required_tech_id, tr.required_tech_level
              FROM technology_requirements tr
              WHERE tr.technology_type_id = v_tech.id
            LOOP
              IF v_req.required_building_id IS NOT NULL THEN
                SELECT COALESCE(pb.level, 0) INTO v_req_level
                FROM planet_buildings pb
                WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_req.required_building_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_building_level THEN
                  v_req_met := false;
                  EXIT;
                END IF;
              END IF;
              IF v_req.required_tech_id IS NOT NULL THEN
                SELECT COALESCE(ut.level, 0) INTO v_req_level
                FROM user_technologies ut
                WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_req.required_tech_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_tech_level THEN
                  v_req_met := false;
                  EXIT;
                END IF;
              END IF;
            END LOOP;

            IF NOT v_req_met THEN CONTINUE; END IF;

            -- Calculate cost
            v_cost_metal := FLOOR(v_tech.base_metal * POWER(v_tech.cost_factor, v_tech_current_level));
            v_cost_crystal := FLOOR(v_tech.base_crystal * POWER(v_tech.cost_factor, v_tech_current_level));
            v_cost_deuterium := FLOOR(v_tech.base_deuterium * POWER(v_tech.cost_factor, v_tech_current_level));

            -- Check if bot can afford it
            IF v_resources.metal >= v_cost_metal
               AND v_resources.crystal >= v_cost_crystal
               AND v_resources.deuterium >= v_cost_deuterium THEN

              -- Calculate research time (same formula as secure_start_research)
              -- Bots have single planets, so effective lab = planet lab level (no IRN network)
              v_research_time := GREATEST(1, FLOOR(
                (v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_lab_level)) * 3600 / v_game_speed
              ));

              -- Deduct resources
              UPDATE planet_resources
              SET metal = metal - v_cost_metal,
                  crystal = crystal - v_cost_crystal,
                  deuterium = deuterium - v_cost_deuterium,
                  last_update = now()
              WHERE planet_id = v_planet.id;

              -- UPSERT user_technologies with is_researching = true
              -- Must disable trigger to avoid deadlock (same as secure_start_research)
              ALTER TABLE user_technologies DISABLE TRIGGER trigger_research_points;

              INSERT INTO user_technologies (
                user_id, technology_type_id, level, is_researching,
                research_start_time, research_end_time, research_planet_id
              ) VALUES (
                v_bot.id, v_tech.id, v_tech_current_level, true,
                now(), now() + (v_research_time || ' seconds')::interval, v_planet.id
              )
              ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
                is_researching = true,
                research_start_time = now(),
                research_end_time = now() + (v_research_time || ' seconds')::interval,
                research_planet_id = v_planet.id;

              ALTER TABLE user_technologies ENABLE TRIGGER trigger_research_points;

              v_research_started := v_research_started + 1;

              -- Re-fetch resources after spending
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;

              -- Only 1 research at a time (per bot, not per planet) — exit tech loop
              EXIT;
            END IF;
            -- If can't afford, try next priority tech
          END LOOP;
        END IF; -- end not researching
      END IF; -- end lab >= 1


      -- ============================================================
      -- PHASE C: SHIPS (new in Level 2)
      -- ============================================================
      -- Only build ships if shipyard exists and no shipyard queue active on this planet
      IF v_shipyard_level >= 1 THEN
        SELECT EXISTS(
          SELECT 1 FROM shipyard_queue WHERE planet_id = v_planet.id
        ) INTO v_shipyard_busy;

        IF NOT v_shipyard_busy THEN
          -- Ship priority: defensive/utility ships first, then military
          v_ship_priority := ARRAY[
            'light_fighter',     -- Basic military
            'heavy_fighter',     -- Better military
            'small_cargo',       -- Utility
            'large_cargo',       -- Utility
            'cruiser',           -- Strong military
            'espionage_probe',   -- Espionage
            'recycler',          -- Debris collection
            'battleship',        -- Heavy military
            'bomber',            -- Anti-defense
            'battlecruiser',     -- Elite
            'destroyer'          -- Elite
          ];

          FOR i IN 1..array_length(v_ship_priority, 1) LOOP
            SELECT * INTO v_ship FROM ship_types WHERE code = v_ship_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;

            -- Check ship requirements (building + tech prereqs)
            v_req_met := true;
            FOR v_req IN
              SELECT sr.required_building_id, sr.required_building_level,
                     sr.required_tech_id, sr.required_tech_level
              FROM ship_requirements sr
              WHERE sr.ship_type_id = v_ship.id
            LOOP
              IF v_req.required_building_id IS NOT NULL THEN
                SELECT COALESCE(pb.level, 0) INTO v_req_level
                FROM planet_buildings pb
                WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_req.required_building_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_building_level THEN
                  v_req_met := false;
                  EXIT;
                END IF;
              END IF;
              IF v_req.required_tech_id IS NOT NULL THEN
                SELECT COALESCE(ut.level, 0) INTO v_req_level
                FROM user_technologies ut
                WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_req.required_tech_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_tech_level THEN
                  v_req_met := false;
                  EXIT;
                END IF;
              END IF;
            END LOOP;

            IF NOT v_req_met THEN CONTINUE; END IF;

            -- Get existing count of this ship type on this planet
            SELECT COALESCE(ps.quantity, 0) INTO v_existing_ship_count
            FROM planet_ships ps
            WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_ship.id;
            v_existing_ship_count := COALESCE(v_existing_ship_count, 0);

            -- Decide quantity based on ship type (build reasonable amounts)
            CASE v_ship.code
              WHEN 'espionage_probe' THEN
                v_ship_qty := GREATEST(0, 5 - v_existing_ship_count);
              WHEN 'small_cargo' THEN
                v_ship_qty := GREATEST(0, 10 - v_existing_ship_count);
              WHEN 'large_cargo' THEN
                v_ship_qty := GREATEST(0, 5 - v_existing_ship_count);
              WHEN 'recycler' THEN
                v_ship_qty := GREATEST(0, 3 - v_existing_ship_count);
              WHEN 'light_fighter' THEN
                v_ship_qty := GREATEST(0, 20 - v_existing_ship_count);
              WHEN 'heavy_fighter' THEN
                v_ship_qty := GREATEST(0, 10 - v_existing_ship_count);
              WHEN 'cruiser' THEN
                v_ship_qty := GREATEST(0, 5 - v_existing_ship_count);
              WHEN 'battleship' THEN
                v_ship_qty := GREATEST(0, 3 - v_existing_ship_count);
              WHEN 'bomber' THEN
                v_ship_qty := GREATEST(0, 2 - v_existing_ship_count);
              WHEN 'battlecruiser' THEN
                v_ship_qty := GREATEST(0, 2 - v_existing_ship_count);
              WHEN 'destroyer' THEN
                v_ship_qty := GREATEST(0, 1 - v_existing_ship_count);
              ELSE
                v_ship_qty := 1;
            END CASE;

            -- Skip if already have enough
            IF v_ship_qty <= 0 THEN CONTINUE; END IF;

            -- Check cost for total quantity
            v_cost_metal := v_ship.metal_cost::bigint * v_ship_qty;
            v_cost_crystal := v_ship.crystal_cost::bigint * v_ship_qty;
            v_cost_deuterium := v_ship.deuterium_cost::bigint * v_ship_qty;

            -- Check if bot can afford it
            IF v_resources.metal >= v_cost_metal
               AND v_resources.crystal >= v_cost_crystal
               AND v_resources.deuterium >= v_cost_deuterium THEN

              -- Calculate build time per unit (same formula as secure_add_to_shipyard_queue)
              v_ship_build_time := GREATEST(1, FLOOR(
                (v_ship.metal_cost + v_ship.crystal_cost) / (2500.0 * (1 + v_shipyard_level)) * 3600 / POWER(2, v_nanite_level) / v_game_speed
              ));

              -- Deduct resources
              UPDATE planet_resources
              SET metal = metal - v_cost_metal,
                  crystal = crystal - v_cost_crystal,
                  deuterium = deuterium - v_cost_deuterium,
                  last_update = now()
              WHERE planet_id = v_planet.id;

              -- Insert into shipyard_queue (position 1, start immediately)
              INSERT INTO shipyard_queue (
                planet_id, item_type, ship_type_id, defense_type_id,
                quantity, quantity_completed,
                metal_cost, crystal_cost, deuterium_cost,
                build_time_per_unit, queue_position,
                start_time, current_unit_end_time
              ) VALUES (
                v_planet.id, 'ship', v_ship.id, NULL,
                v_ship_qty, 0,
                v_ship.metal_cost, v_ship.crystal_cost, v_ship.deuterium_cost,
                v_ship_build_time, 1,
                now(), now() + (v_ship_build_time || ' seconds')::interval
              );

              v_ships_queued := v_ships_queued + 1;

              -- Re-fetch resources
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;

              -- Only 1 ship batch per tick per planet
              EXIT;
            END IF;
            -- If can't afford this ship type, try the next priority
          END LOOP;
        END IF; -- end shipyard not busy
      END IF; -- end shipyard >= 1


      -- ============================================================
      -- PHASE D: DEFENSES (new in Level 2)
      -- ============================================================
      -- Only build defenses if shipyard exists and no shipyard queue active
      -- (check again since Phase C may have added an item)
      IF v_shipyard_level >= 1 THEN
        SELECT EXISTS(
          SELECT 1 FROM shipyard_queue WHERE planet_id = v_planet.id
        ) INTO v_shipyard_busy;

        IF NOT v_shipyard_busy THEN
          -- Defense priority order
          v_defense_priority := ARRAY[
            'rocket_launcher',      -- Cheapest defense
            'light_laser',          -- Good basic defense
            'heavy_laser',          -- Stronger
            'gauss_cannon',         -- Heavy
            'ion_cannon',           -- Ion
            'plasma_turret',        -- Most powerful
            'small_shield_dome',    -- Shield (max 1)
            'large_shield_dome'     -- Shield (max 1)
          ];

          FOR i IN 1..array_length(v_defense_priority, 1) LOOP
            SELECT * INTO v_def FROM defense_types WHERE code = v_defense_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;

            -- Check defense requirements (building + tech prereqs)
            v_req_met := true;
            FOR v_req IN
              SELECT dr.required_building_id, dr.required_building_level,
                     dr.required_tech_id, dr.required_tech_level
              FROM defense_requirements dr
              WHERE dr.defense_type_id = v_def.id
            LOOP
              IF v_req.required_building_id IS NOT NULL THEN
                SELECT COALESCE(pb.level, 0) INTO v_req_level
                FROM planet_buildings pb
                WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_req.required_building_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_building_level THEN
                  v_req_met := false;
                  EXIT;
                END IF;
              END IF;
              IF v_req.required_tech_id IS NOT NULL THEN
                SELECT COALESCE(ut.level, 0) INTO v_req_level
                FROM user_technologies ut
                WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_req.required_tech_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_tech_level THEN
                  v_req_met := false;
                  EXIT;
                END IF;
              END IF;
            END LOOP;

            IF NOT v_req_met THEN CONTINUE; END IF;

            -- Get existing count of this defense type
            SELECT COALESCE(pd.quantity, 0) INTO v_existing_def_count
            FROM planet_defenses pd
            WHERE pd.planet_id = v_planet.id AND pd.defense_type_id = v_def.id;
            v_existing_def_count := COALESCE(v_existing_def_count, 0);

            -- Decide quantity based on defense type
            v_max_per_planet := v_def.max_per_planet; -- NULL = unlimited

            CASE v_def.code
              WHEN 'rocket_launcher' THEN
                v_def_qty := GREATEST(0, 30 - v_existing_def_count);
              WHEN 'light_laser' THEN
                v_def_qty := GREATEST(0, 20 - v_existing_def_count);
              WHEN 'heavy_laser' THEN
                v_def_qty := GREATEST(0, 10 - v_existing_def_count);
              WHEN 'gauss_cannon' THEN
                v_def_qty := GREATEST(0, 5 - v_existing_def_count);
              WHEN 'ion_cannon' THEN
                v_def_qty := GREATEST(0, 5 - v_existing_def_count);
              WHEN 'plasma_turret' THEN
                v_def_qty := GREATEST(0, 2 - v_existing_def_count);
              WHEN 'small_shield_dome' THEN
                v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              WHEN 'large_shield_dome' THEN
                v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              ELSE
                v_def_qty := 1;
            END CASE;

            -- Respect max_per_planet constraint
            IF v_max_per_planet IS NOT NULL THEN
              v_def_qty := LEAST(v_def_qty, v_max_per_planet - v_existing_def_count);
            END IF;

            IF v_def_qty <= 0 THEN CONTINUE; END IF;

            -- Check cost for total quantity
            v_cost_metal := v_def.metal_cost::bigint * v_def_qty;
            v_cost_crystal := v_def.crystal_cost::bigint * v_def_qty;
            v_cost_deuterium := v_def.deuterium_cost::bigint * v_def_qty;

            -- Check if bot can afford it
            IF v_resources.metal >= v_cost_metal
               AND v_resources.crystal >= v_cost_crystal
               AND v_resources.deuterium >= v_cost_deuterium THEN

              -- Calculate build time per unit
              v_def_build_time := GREATEST(1, FLOOR(
                (v_def.metal_cost + v_def.crystal_cost) / (2500.0 * (1 + v_shipyard_level)) * 3600 / POWER(2, v_nanite_level) / v_game_speed
              ));

              -- Deduct resources
              UPDATE planet_resources
              SET metal = metal - v_cost_metal,
                  crystal = crystal - v_cost_crystal,
                  deuterium = deuterium - v_cost_deuterium,
                  last_update = now()
              WHERE planet_id = v_planet.id;

              -- Insert into shipyard_queue (position 1, start immediately)
              INSERT INTO shipyard_queue (
                planet_id, item_type, ship_type_id, defense_type_id,
                quantity, quantity_completed,
                metal_cost, crystal_cost, deuterium_cost,
                build_time_per_unit, queue_position,
                start_time, current_unit_end_time
              ) VALUES (
                v_planet.id, 'defense', NULL, v_def.id,
                v_def_qty, 0,
                v_def.metal_cost, v_def.crystal_cost, v_def.deuterium_cost,
                v_def_build_time, 1,
                now(), now() + (v_def_build_time || ' seconds')::interval
              );

              v_defenses_queued := v_defenses_queued + 1;

              -- Re-fetch resources
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;

              -- Only 1 defense batch per tick per planet
              EXIT;
            END IF;
          END LOOP;
        END IF; -- end shipyard not busy
      END IF; -- end shipyard >= 1

    END LOOP; -- end planets loop
  END LOOP; -- end bots loop

  RETURN jsonb_build_object(
    'success', true,
    'bots_processed', v_bots_processed,
    'buildings_queued', v_buildings_queued,
    'research_started', v_research_started,
    'ships_queued', v_ships_queued,
    'defenses_queued', v_defenses_queued
  );
END;
$$;

-- Update comment
COMMENT ON FUNCTION bot_ai_tick() IS 'Bot NPC AI - Level 2: Builds structures, researches technologies, produces ships, and constructs defenses. Runs every 5 minutes via pg_cron.';
