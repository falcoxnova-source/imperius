CREATE OR REPLACE FUNCTION public.bot_ai_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_bot RECORD;
  v_planet RECORD;
  v_resources RECORD;
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
  v_has_commander boolean := false;
  v_max_build_queue integer := 3;
  v_next_queue_position integer := 1;
  v_queue_anchor_end_time timestamptz;
  v_bots_processed integer := 0;
  v_buildings_queued integer := 0;
  v_research_started integer := 0;
  v_ships_queued integer := 0;
  v_defenses_queued integer := 0;
  v_fleets_sent integer := 0;
  v_transports_sent integer := 0;
  v_retaliations_sent integer := 0;
  v_colonizations_sent integer := 0;
  v_fleet_saves_sent integer := 0;
  v_recyclers_sent integer := 0;
  v_fields_available integer;
  v_is_researching boolean;
  v_lab_level integer;
  v_tech RECORD;
  v_tech_current_level integer;
  v_research_time integer;
  v_research_priority text[];
  v_shipyard_level integer;
  v_shipyard_busy boolean;
  v_ship RECORD;
  v_ship_qty integer;
  v_ship_build_time integer;
  v_ship_priority text[];
  v_existing_ship_count integer;
  v_def RECORD;
  v_def_qty integer;
  v_def_build_time integer;
  v_defense_priority text[];
  v_existing_def_count integer;
  v_max_per_planet integer;
  v_req RECORD;
  v_req_met boolean;
  v_req_level integer;
  v_bot_points bigint := 0;
  v_probe_ship_type_id integer;
  v_light_fighter_type_id integer;
  v_heavy_fighter_type_id integer;
  v_cruiser_type_id integer;
  v_battleship_type_id integer;
  v_battlecruiser_type_id integer;
  v_bomber_type_id integer;
  v_destroyer_type_id integer;
  v_small_cargo_type_id integer;
  v_ship_types_queued_this_tick integer := 0;
  v_max_ship_types_per_tick integer := 3;
  v_large_cargo_type_id integer;
  v_recycler_type_id integer;
  v_colony_ship_type_id integer;
  v_probe_count integer := 0;
  v_light_fighter_count integer := 0;
  v_heavy_fighter_count integer := 0;
  v_cruiser_count integer := 0;
  v_battleship_count integer := 0;
  v_battlecruiser_count integer := 0;
  v_bomber_count integer := 0;
  v_destroyer_count integer := 0;
  v_small_cargo_count integer := 0;
  v_large_cargo_count integer := 0;
  v_recycler_count integer := 0;
  v_colony_ship_count integer := 0;
  v_target RECORD;
  v_fleet_result jsonb;
  v_origin_active_fleets integer := 0;
  v_attack_ships_to_send integer := 0;
  v_fleet_action_taken boolean := false;
  v_protection_check jsonb;
  v_attacks_today integer := 0;
  v_attacker RECORD;
  v_attacker_planet RECORD;
  v_retaliation_done boolean := false;
  v_other_planet RECORD;
  v_other_resources RECORD;
  v_cargo_capacity bigint;
  v_send_metal bigint;
  v_send_crystal bigint;
  v_send_deut bigint;
  v_transport_done boolean := false;
  v_cargo_ship_capacity integer;
  -- Colonization
  v_astrophysics_level integer := 0;
  v_current_colonies integer := 0;
  v_max_colonies integer := 1;
  v_impulse_drive_level integer := 0;
  v_colonize_target RECORD;
  v_colonize_done boolean := false;
  -- Fleet save
  v_incoming_attack RECORD;
  v_fleet_save_done boolean := false;
  v_save_target RECORD;
  v_total_cargo_to_save bigint := 0;
  -- Recycling
  v_debris RECORD;
  v_recycle_done boolean := false;
  -- Randomization & espionage intelligence
  v_bot_rand double precision := 0;
  v_phase_rand double precision := 0;
  v_spy_body jsonb;
  v_spy_total_resources bigint := 0;
  v_spy_total_defenses integer := 0;
  v_spy_target_found boolean := false;
  -- Strategic combat evaluation
  v_attacker_power bigint := 0;
  v_defender_power bigint := 0;
  v_attack_mode text := 'skip';
  v_recent_hostile boolean := false;
  v_target_points_fleet bigint := 0;
  v_target_points_defense bigint := 0;
  v_send_lf integer := 0;
  v_send_hf integer := 0;
  v_send_cr integer := 0;
  v_send_bs integer := 0;
  v_send_bc integer := 0;
  v_send_bo integer := 0;
  v_send_de integer := 0;
  v_spy_rl integer := 0;
  v_spy_ll integer := 0;
  v_spy_hl integer := 0;
  v_spy_gc integer := 0;
  v_spy_ic integer := 0;
  v_spy_pt integer := 0;
  v_spy_fleet_lf integer := 0;
  v_spy_fleet_hf integer := 0;
  v_spy_fleet_cr integer := 0;
  v_spy_fleet_bs integer := 0;
  v_spy_fleet_bc integer := 0;
  v_spy_fleet_bo integer := 0;
  v_spy_fleet_de integer := 0;
  v_planet_role text := 'balanced';
  -- [OPT B] Empire-level research decisor
  v_empire_research_role text := 'balanced';
  v_empire_research_decisor_planet uuid;
  v_tech_energy integer := 0;
  v_tech_computer integer := 0;
  v_tech_espionage integer := 0;
  v_tech_weapons integer := 0;
  v_tech_shielding integer := 0;
  v_tech_armour integer := 0;
  v_tech_combustion integer := 0;
  v_tech_laser integer := 0;
  v_tech_ion integer := 0;
  v_tech_plasma integer := 0;
  v_tech_hyper_tech integer := 0;
  v_tech_hyper_drive integer := 0;
BEGIN
  v_game_speed := get_game_speed();

  SELECT id INTO v_probe_ship_type_id FROM ship_types WHERE code = 'espionage_probe';
  SELECT id INTO v_light_fighter_type_id FROM ship_types WHERE code = 'light_fighter';
  SELECT id INTO v_heavy_fighter_type_id FROM ship_types WHERE code = 'heavy_fighter';
  SELECT id INTO v_cruiser_type_id FROM ship_types WHERE code = 'cruiser';
  SELECT id INTO v_battleship_type_id FROM ship_types WHERE code = 'battleship';
  SELECT id INTO v_battlecruiser_type_id FROM ship_types WHERE code = 'battlecruiser';
  SELECT id INTO v_bomber_type_id FROM ship_types WHERE code = 'bomber';
  SELECT id INTO v_destroyer_type_id FROM ship_types WHERE code = 'destroyer';
  SELECT id INTO v_small_cargo_type_id FROM ship_types WHERE code = 'small_cargo';
  SELECT id INTO v_large_cargo_type_id FROM ship_types WHERE code = 'large_cargo';
  SELECT id INTO v_recycler_type_id FROM ship_types WHERE code = 'recycler';
  SELECT id INTO v_colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
  SELECT COALESCE(cargo_capacity, 5000) INTO v_cargo_ship_capacity FROM ship_types WHERE code = 'small_cargo';

  
  -- Autopilot cleanup (VIP boost + lost access)
  -- 1) VIP Boost expirado: limpiar flags para que la UI refleje el estado real
  UPDATE public.profiles
  SET autopilot_vip_boost = false,
      autopilot_vip_boost_expires_at = NULL
  WHERE autopilot_vip_boost = true
    AND autopilot_vip_boost_expires_at IS NOT NULL
    AND autopilot_vip_boost_expires_at <= NOW();

  -- 2) Autopiloto activo sin acceso (oficial Androide caducado y no admin-eligible): desactivar
  UPDATE public.profiles p
  SET autopilot_active = false,
      autopilot_vip_boost = false,
      autopilot_vip_boost_expires_at = NULL
  WHERE p.autopilot_active = true
    AND p.is_bot = false
    AND NOT has_autopilot_access(p.id);

FOR v_bot IN
    SELECT id, COALESCE(points_total, 0) AS points_total
    FROM profiles
    WHERE (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id) AND ((autopilot_vip_boost = true AND (autopilot_vip_boost_expires_at IS NULL OR autopilot_vip_boost_expires_at > NOW())) OR last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))
  LOOP
    v_bots_processed := v_bots_processed + 1;
    v_bot_points := COALESCE(v_bot.points_total, 0);

    -- Randomization: each bot gets a unique random value per tick
    -- This ensures not all bots act simultaneously
    v_bot_rand := random();

    -- Process completed queues first if helper exists
    BEGIN
      PERFORM bot_process_queues(v_bot.id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = v_bot.id AND tt.code = 'astrophysics';
    v_astrophysics_level := COALESCE(v_astrophysics_level, 0);

    SELECT COALESCE(ut.level, 0) INTO v_impulse_drive_level
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = v_bot.id AND tt.code = 'impulse_drive';
    v_impulse_drive_level := COALESCE(v_impulse_drive_level, 0);

    SELECT COUNT(*) INTO v_current_colonies
    FROM planets
    WHERE user_id = v_bot.id AND NOT is_destroyed AND planet_type = 'planet';

    v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

    -- [OPT B] Elegir planeta DECISOR de investigación segun jerarquia de roles
    -- research > colonizer > military > balanced > miner
    SELECT id, COALESCE(autopilot_role, 'balanced')
      INTO v_empire_research_decisor_planet, v_empire_research_role
    FROM planets
    WHERE user_id = v_bot.id AND planet_type = 'planet' AND NOT is_destroyed
    ORDER BY CASE COALESCE(autopilot_role, 'balanced')
               WHEN 'research'  THEN 1
               WHEN 'colonizer' THEN 2
               WHEN 'military'  THEN 3
               WHEN 'balanced'  THEN 4
               WHEN 'miner'     THEN 5
               ELSE 6 END,
             is_main_planet DESC NULLS LAST,
             created_at ASC NULLS LAST
    LIMIT 1;

    -- [OPT B] Pre-fetch niveles de tecnologias clave para decidir prioridad
    SELECT
      COALESCE(MAX(CASE WHEN tt.code='energy_tech'      THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='computer_tech'    THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='espionage_tech'   THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='weapons_tech'     THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='shielding_tech'   THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='armour_tech'      THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='combustion_drive' THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='laser_tech'       THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='ion_tech'         THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='plasma_tech'      THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='hyperspace_tech'  THEN ut.level END), 0),
      COALESCE(MAX(CASE WHEN tt.code='hyperspace_drive' THEN ut.level END), 0)
    INTO
      v_tech_energy, v_tech_computer, v_tech_espionage,
      v_tech_weapons, v_tech_shielding, v_tech_armour,
      v_tech_combustion, v_tech_laser, v_tech_ion,
      v_tech_plasma, v_tech_hyper_tech, v_tech_hyper_drive
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = v_bot.id;

    FOR v_planet IN
      SELECT p.id, p.fields_used, p.fields_max, p.user_id, p.galaxy, p.solar_system, p.position, p.autopilot_role
      FROM planets p
      WHERE p.user_id = v_bot.id AND p.planet_type = 'planet' AND NOT p.is_destroyed
    LOOP
      PERFORM calculate_and_sync_resources_internal(v_planet.id, v_planet.user_id);

      SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
      IF NOT FOUND THEN CONTINUE; END IF;

      v_planet_role := COALESCE(v_planet.autopilot_role, 'balanced');

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

      -- Phase A: Buildings
      SELECT EXISTS (
        SELECT 1
        FROM user_officers uo
        JOIN officer_types ot ON ot.id = uo.officer_type_id
        WHERE uo.user_id = v_bot.id
          AND ot.code = 'commander'
          AND uo.expires_at > now()
      ) INTO v_has_commander;

      v_max_build_queue := CASE WHEN v_has_commander THEN 5 ELSE 3 END;

      SELECT COUNT(*) INTO v_queued_count
      FROM building_queue WHERE planet_id = v_planet.id;

      IF v_queued_count < v_max_build_queue THEN
        v_fields_available := v_planet.fields_max - v_planet.fields_used;
        IF v_fields_available > 0 THEN
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
            v_energy_balance numeric := 0;
            v_filtered_wish text[];
            v_wish_item text;
            v_building_wish_list text[];
            v_bw_idx integer;
            v_build_slots_left integer := 0;
            v_building_queued boolean := false;
          BEGIN
            SELECT COALESCE(pb.level, 0) INTO v_metal_mine_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'metal_mine';
            v_metal_mine_lvl := COALESCE(v_metal_mine_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_crystal_mine_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'crystal_mine';
            v_crystal_mine_lvl := COALESCE(v_crystal_mine_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_solar_plant_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'solar_plant';
            v_solar_plant_lvl := COALESCE(v_solar_plant_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_deut_synth_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'deuterium_synthesizer';
            v_deut_synth_lvl := COALESCE(v_deut_synth_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_robotics_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'robotics_factory';
            v_robotics_lvl := COALESCE(v_robotics_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_shipyard_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'shipyard';
            v_shipyard_lvl := COALESCE(v_shipyard_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_lab_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'research_lab';
            v_lab_lvl := COALESCE(v_lab_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_metal_storage_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'metal_storage';
            v_metal_storage_lvl := COALESCE(v_metal_storage_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_crystal_storage_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'crystal_storage';
            v_crystal_storage_lvl := COALESCE(v_crystal_storage_lvl, 0);
            SELECT COALESCE(pb.level, 0) INTO v_deut_tank_lvl FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = v_planet.id AND bt.code = 'deuterium_tank';
            v_deut_tank_lvl := COALESCE(v_deut_tank_lvl, 0);

            -- [AUTOPILOT/BOT] Leer balance energético del planeta
            SELECT COALESCE(energy_max, 0) - COALESCE(energy_used, 0)
              INTO v_energy_balance
              FROM planet_resources
              WHERE planet_id = v_planet.id;
            v_energy_balance := COALESCE(v_energy_balance, 0);

                                    v_building_wish_list := ARRAY[]::text[];
            IF v_planet_role = 'miner' THEN
              -- [MINER] Si energia baja o solar_plant no cubre las minas, priorizar solar_plant PRIMERO
              IF v_energy_balance <= 10
                 OR v_solar_plant_lvl < GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl, v_deut_synth_lvl)
              THEN
                v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
              END IF;
              IF v_metal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_solar_plant_lvl < v_metal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_crystal_mine_lvl < v_metal_mine_lvl - 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_deut_synth_lvl < v_crystal_mine_lvl - 2 AND v_crystal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl <= v_deut_synth_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 4 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 2 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_metal_storage_lvl < 4 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 4 AND v_crystal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 3 AND v_deut_synth_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            ELSIF v_planet_role = 'military' THEN
              IF v_metal_mine_lvl < 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_deut_synth_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl < GREATEST(v_metal_mine_lvl - 1, v_crystal_mine_lvl) THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 6 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_metal_storage_lvl < 5 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 5 AND v_crystal_mine_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              IF v_robotics_lvl < 8 AND v_shipyard_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 12 AND v_robotics_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 2 AND v_metal_mine_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'shipyard');
              v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory');
              v_building_wish_list := array_append(v_building_wish_list, 'metal_storage');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank');
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            ELSIF v_planet_role = 'research' THEN
              IF v_lab_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_mine_lvl < 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_deut_synth_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl < GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl) THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_lab_lvl < 12 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_storage_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'research_lab');
              v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            ELSIF v_planet_role = 'colonizer' THEN
              IF v_metal_mine_lvl < 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 7 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_deut_synth_lvl < 7 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl < GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl, v_deut_synth_lvl - 1) THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 6 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_storage_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'shipyard');
              v_building_wish_list := array_append(v_building_wish_list, 'research_lab');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
            ELSE
              IF v_metal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_solar_plant_lvl < v_metal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_crystal_mine_lvl < v_metal_mine_lvl - 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_solar_plant_lvl < v_crystal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_deut_synth_lvl < v_crystal_mine_lvl - 3 AND v_crystal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl <= v_deut_synth_lvl AND v_deut_synth_lvl > 0 THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 2 AND v_metal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 1 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 1 AND v_metal_mine_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_robotics_lvl < 5 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 4 AND v_robotics_lvl >= 3 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 4 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_storage_lvl < 3 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 3 AND v_crystal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 2 AND v_deut_synth_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              IF v_robotics_lvl < 10 AND v_metal_mine_lvl >= 15 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 12 AND v_robotics_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 12 AND v_metal_mine_lvl >= 12 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_storage_lvl < 6 AND v_metal_mine_lvl >= 15 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 6 AND v_crystal_mine_lvl >= 13 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            END IF;

            
            -- [AUTOPILOT/BOT] Check PROACTIVO de energía.
            -- Si el balance es <= 5 (muy justo) O si el planeta role es 'miner'
            -- y solar_plant está por debajo del nivel máximo de minas, FORZAR solar_plant
            -- antes de cualquier mina/sintetizador para nunca quedar en negativo.
            IF v_energy_balance <= 5
               OR (v_planet_role = 'miner' AND v_solar_plant_lvl < GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl, v_deut_synth_lvl))
            THEN
              v_filtered_wish := ARRAY['solar_plant']::text[];
              -- Añadir fusion_reactor si ya tiene deut_synth >= 5 (ya desbloqueable realista)
              IF v_deut_synth_lvl >= 5 THEN
                v_filtered_wish := array_append(v_filtered_wish, 'fusion_reactor');
              END IF;
              FOREACH v_wish_item IN ARRAY v_building_wish_list LOOP
                -- Saltar edificios que aumentan consumo si estamos en déficit real
                IF v_energy_balance < 0 AND v_wish_item IN ('metal_mine', 'crystal_mine', 'deuterium_synthesizer') THEN
                  CONTINUE;
                END IF;
                IF NOT (v_wish_item = ANY(v_filtered_wish)) THEN
                  v_filtered_wish := array_append(v_filtered_wish, v_wish_item);
                END IF;
              END LOOP;
              v_building_wish_list := v_filtered_wish;
            END IF;

            -- [AUTOPILOT/BOT] Si hay superávit alto de energía (>=50% de margen),
            -- priorizar minas agresivamente para acelerar producción.
            IF v_energy_balance > 0 AND v_energy_balance >= GREATEST(10, (
                 SELECT COALESCE(energy_used, 0) * 0.5 FROM planet_resources WHERE planet_id = v_planet.id
               )) THEN
              v_filtered_wish := ARRAY[]::text[];
              -- Minas primero, ordenadas por rentabilidad relativa según puntos
              IF v_metal_mine_lvl <= v_crystal_mine_lvl + 2 THEN
                v_filtered_wish := array_append(v_filtered_wish, 'metal_mine');
                v_filtered_wish := array_append(v_filtered_wish, 'crystal_mine');
              ELSE
                v_filtered_wish := array_append(v_filtered_wish, 'crystal_mine');
                v_filtered_wish := array_append(v_filtered_wish, 'metal_mine');
              END IF;
              IF v_crystal_mine_lvl >= 4 THEN
                v_filtered_wish := array_append(v_filtered_wish, 'deuterium_synthesizer');
              END IF;
              -- Luego el resto de la wishlist original sin duplicar
              FOREACH v_wish_item IN ARRAY v_building_wish_list LOOP
                IF NOT (v_wish_item = ANY(v_filtered_wish)) THEN
                  v_filtered_wish := array_append(v_filtered_wish, v_wish_item);
                END IF;
              END LOOP;
              v_building_wish_list := v_filtered_wish;
            END IF;

            -- [TERRAFORMER ANTICIPADO] Si faltan 5 campos o menos, priorizar terraformer
            -- AL TOPE de la lista (antes que cualquier otra cosa) para que siempre haya
            -- espacio disponible. Aplica para NPCs y autopilotos de jugadores.
            IF (v_planet.fields_max - v_planet.fields_used) <= 5
               AND (v_planet.fields_max - v_planet.fields_used) >= 1
            THEN
              v_filtered_wish := ARRAY['terraformer']::text[];
              FOREACH v_wish_item IN ARRAY v_building_wish_list LOOP
                IF v_wish_item <> 'terraformer' THEN
                  v_filtered_wish := array_append(v_filtered_wish, v_wish_item);
                END IF;
              END LOOP;
              v_building_wish_list := v_filtered_wish;

              -- [CRITICO] Si quedan <=3 campos, FORZAR ahorro: lista SOLO con terraformer
              -- para que los recursos se acumulen si aún no alcanzan. Sin esto, el bot
              -- gastaría recursos en minas y nunca tendría para terraformer.
              IF (v_planet.fields_max - v_planet.fields_used) <= 3 THEN
                v_building_wish_list := ARRAY['terraformer']::text[];
              END IF;
            END IF;


            v_build_slots_left := GREATEST(0, v_max_build_queue - v_queued_count);

            IF v_build_slots_left > 0 THEN
              SELECT COALESCE(MAX(queue_position), 0), MAX(end_time)
              INTO v_next_queue_position, v_queue_anchor_end_time
              FROM building_queue
              WHERE planet_id = v_planet.id;

              v_next_queue_position := COALESCE(v_next_queue_position, 0) + 1;
            END IF;

            FOR v_bw_idx IN 1..COALESCE(array_length(v_building_wish_list, 1), 0) LOOP
              EXIT WHEN v_build_slots_left <= 0;
              SELECT * INTO v_try_bt FROM building_types WHERE code = v_building_wish_list[v_bw_idx];
              IF NOT FOUND THEN CONTINUE; END IF;
              SELECT COALESCE(pb.level, 0) INTO v_current_level FROM planet_buildings pb WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_try_bt.id;
              v_current_level := COALESCE(v_current_level, 0);
              -- Considerar items ya en cola del mismo edificio para no duplicar niveles
              SELECT COALESCE(MAX(bq2.target_level), v_current_level)
                INTO v_target_level
                FROM building_queue bq2
                WHERE bq2.planet_id = v_planet.id AND bq2.building_type_id = v_try_bt.id;
              v_target_level := v_target_level + 1;
              IF v_target_level > v_try_bt.max_level THEN CONTINUE; END IF;
              v_cost_metal := FLOOR(v_try_bt.base_metal * POWER(v_try_bt.cost_factor, v_current_level));
              v_cost_crystal := FLOOR(v_try_bt.base_crystal * POWER(v_try_bt.cost_factor, v_current_level));
              v_cost_deuterium := FLOOR(v_try_bt.base_deuterium * POWER(v_try_bt.cost_factor, v_current_level));
              IF v_resources.metal >= v_cost_metal AND v_resources.crystal >= v_cost_crystal AND v_resources.deuterium >= v_cost_deuterium THEN
                v_build_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed));
                UPDATE planet_resources SET metal = metal - v_cost_metal, crystal = crystal - v_cost_crystal, deuterium = deuterium - v_cost_deuterium, last_update = now() WHERE planet_id = v_planet.id;
                INSERT INTO building_queue (planet_id, building_type_id, target_level, metal_cost, crystal_cost, deuterium_cost, build_time, queue_position, start_time, end_time)
                VALUES (
                  v_planet.id,
                  v_try_bt.id,
                  v_target_level,
                  v_cost_metal,
                  v_cost_crystal,
                  v_cost_deuterium,
                  v_build_time,
                  v_next_queue_position,
                  COALESCE(v_queue_anchor_end_time, now()),
                  COALESCE(v_queue_anchor_end_time, now()) + (v_build_time || ' seconds')::interval
                );
                v_buildings_queued := v_buildings_queued + 1;
                v_building_queued := true;
                v_build_slots_left := v_build_slots_left - 1;
                v_queued_count := v_queued_count + 1;
                v_queue_anchor_end_time := COALESCE(v_queue_anchor_end_time, now()) + (v_build_time || ' seconds')::interval;
                v_next_queue_position := v_next_queue_position + 1;
                SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              END IF;
            END LOOP;
          END;
        END IF;
      END IF;

      -- [OPT B] Phase B: Research - sistema inteligente a nivel IMPERIO
      -- Solo el planeta DECISOR intenta investigar. Jerarquia: research > colonizer > military > balanced > miner
      IF v_lab_level >= 1 AND (v_empire_research_decisor_planet IS NULL OR v_planet.id = v_empire_research_decisor_planet) THEN
        SELECT EXISTS(SELECT 1 FROM user_technologies WHERE user_id = v_bot.id AND is_researching = true) INTO v_is_researching;
        IF NOT v_is_researching THEN
          -- Prioridad dinamica segun ROL DECISOR y ESTADO DEL IMPERIO
          IF v_empire_research_role = 'colonizer' THEN
            -- Fase 1: expansion (astro + impulse + combustion)
            IF v_current_colonies < v_max_colonies AND v_astrophysics_level < 14 THEN
              v_research_priority := ARRAY['astrophysics','impulse_drive','combustion_drive','energy_tech','computer_tech','espionage_tech','shielding_tech','armour_tech','weapons_tech','hyperspace_drive','hyperspace_tech','ion_tech','laser_tech','plasma_tech'];
            ELSIF v_impulse_drive_level < 4 OR v_tech_combustion < 4 THEN
              v_research_priority := ARRAY['impulse_drive','combustion_drive','hyperspace_drive','energy_tech','computer_tech','espionage_tech','astrophysics','shielding_tech','armour_tech','weapons_tech','hyperspace_tech','ion_tech','laser_tech','plasma_tech'];
            ELSE
              -- expansion completa: pasar a ciencia
              v_research_priority := ARRAY['energy_tech','computer_tech','espionage_tech','astrophysics','hyperspace_drive','shielding_tech','armour_tech','weapons_tech','laser_tech','ion_tech','hyperspace_tech','plasma_tech','impulse_drive','combustion_drive'];
            END IF;
          ELSIF v_empire_research_role = 'research' THEN
            -- Investigador: pilares energia -> computacion -> espionaje -> alto nivel
            IF v_tech_energy < 8 THEN
              v_research_priority := ARRAY['energy_tech','computer_tech','espionage_tech','shielding_tech','armour_tech','weapons_tech','laser_tech','ion_tech','combustion_drive','impulse_drive','hyperspace_drive','astrophysics','hyperspace_tech','plasma_tech'];
            ELSIF v_tech_computer < 6 THEN
              v_research_priority := ARRAY['computer_tech','energy_tech','espionage_tech','shielding_tech','armour_tech','weapons_tech','laser_tech','ion_tech','combustion_drive','impulse_drive','hyperspace_drive','astrophysics','hyperspace_tech','plasma_tech'];
            ELSIF v_tech_espionage < 4 THEN
              v_research_priority := ARRAY['espionage_tech','energy_tech','computer_tech','shielding_tech','armour_tech','weapons_tech','laser_tech','ion_tech','hyperspace_drive','combustion_drive','impulse_drive','astrophysics','hyperspace_tech','plasma_tech'];
            ELSE
              -- base solida: niveles altos (hyperspace, plasma)
              v_research_priority := ARRAY['hyperspace_tech','plasma_tech','laser_tech','ion_tech','hyperspace_drive','weapons_tech','shielding_tech','armour_tech','espionage_tech','computer_tech','energy_tech','impulse_drive','astrophysics','combustion_drive'];
            END IF;
          ELSIF v_empire_research_role = 'military' THEN
            -- Militar: pilares armas/escudo/blindaje >= 5; subir el mas bajo primero
            IF LEAST(v_tech_weapons, v_tech_shielding, v_tech_armour) < 5 THEN
              IF v_tech_weapons <= v_tech_shielding AND v_tech_weapons <= v_tech_armour THEN
                v_research_priority := ARRAY['weapons_tech','shielding_tech','armour_tech','energy_tech','laser_tech','ion_tech','hyperspace_drive','computer_tech','espionage_tech','combustion_drive','impulse_drive','astrophysics','hyperspace_tech','plasma_tech'];
              ELSIF v_tech_shielding <= v_tech_armour THEN
                v_research_priority := ARRAY['shielding_tech','armour_tech','weapons_tech','energy_tech','laser_tech','ion_tech','hyperspace_drive','computer_tech','espionage_tech','combustion_drive','impulse_drive','astrophysics','hyperspace_tech','plasma_tech'];
              ELSE
                v_research_priority := ARRAY['armour_tech','weapons_tech','shielding_tech','energy_tech','laser_tech','ion_tech','hyperspace_drive','computer_tech','espionage_tech','combustion_drive','impulse_drive','astrophysics','hyperspace_tech','plasma_tech'];
              END IF;
            ELSIF (v_tech_weapons + v_tech_shielding + v_tech_armour) < 30 THEN
              v_research_priority := ARRAY['weapons_tech','shielding_tech','armour_tech','laser_tech','ion_tech','plasma_tech','hyperspace_drive','energy_tech','computer_tech','espionage_tech','hyperspace_tech','combustion_drive','impulse_drive','astrophysics'];
            ELSE
              -- elite: plasma + hyperspace
              v_research_priority := ARRAY['plasma_tech','hyperspace_drive','hyperspace_tech','weapons_tech','shielding_tech','armour_tech','laser_tech','ion_tech','computer_tech','energy_tech','espionage_tech','impulse_drive','astrophysics','combustion_drive'];
            END IF;
          ELSIF v_empire_research_role = 'balanced' THEN
            -- Balanceado: ciencia + militar + movilidad mezclados
            v_research_priority := ARRAY['energy_tech','computer_tech','weapons_tech','shielding_tech','armour_tech','combustion_drive','impulse_drive','espionage_tech','laser_tech','ion_tech','hyperspace_drive','astrophysics','hyperspace_tech','plasma_tech'];
          ELSE
            -- miner u otro: ciencia economica minimalista
            v_research_priority := ARRAY['energy_tech','combustion_drive','computer_tech','espionage_tech','impulse_drive','armour_tech','shielding_tech','laser_tech','ion_tech','weapons_tech','hyperspace_drive','astrophysics','hyperspace_tech','plasma_tech'];
          END IF;

          FOR i IN 1..array_length(v_research_priority, 1) LOOP
            SELECT * INTO v_tech FROM technology_types WHERE code = v_research_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;

            SELECT COALESCE(ut.level, 0) INTO v_tech_current_level FROM user_technologies ut WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_tech.id;
            v_tech_current_level := COALESCE(v_tech_current_level, 0);

            IF v_tech.code = 'astrophysics' AND v_current_colonies >= 9 THEN CONTINUE; END IF;
            -- No artificial caps: bots research freely up to tech max_level
            IF v_tech_current_level >= v_tech.max_level THEN CONTINUE; END IF;

            v_req_met := true;
            FOR v_req IN SELECT tr.required_building_id, tr.required_building_level, tr.required_tech_id, tr.required_tech_level FROM technology_requirements tr WHERE tr.technology_type_id = v_tech.id LOOP
              IF v_req.required_building_id IS NOT NULL THEN
                SELECT COALESCE(pb.level, 0) INTO v_req_level FROM planet_buildings pb WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_req.required_building_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_building_level THEN v_req_met := false; EXIT; END IF;
              END IF;
              IF v_req.required_tech_id IS NOT NULL THEN
                SELECT COALESCE(ut.level, 0) INTO v_req_level FROM user_technologies ut WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_req.required_tech_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_tech_level THEN v_req_met := false; EXIT; END IF;
              END IF;
            END LOOP;
            IF NOT v_req_met THEN CONTINUE; END IF;

            v_cost_metal := FLOOR(v_tech.base_metal * POWER(v_tech.cost_factor, v_tech_current_level));
            v_cost_crystal := FLOOR(v_tech.base_crystal * POWER(v_tech.cost_factor, v_tech_current_level));
            v_cost_deuterium := FLOOR(v_tech.base_deuterium * POWER(v_tech.cost_factor, v_tech_current_level));

            IF v_resources.metal >= v_cost_metal AND v_resources.crystal >= v_cost_crystal AND v_resources.deuterium >= v_cost_deuterium THEN
              v_research_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_lab_level)) * 3600 / v_game_speed));
              UPDATE planet_resources SET metal = metal - v_cost_metal, crystal = crystal - v_cost_crystal, deuterium = deuterium - v_cost_deuterium, last_update = now() WHERE planet_id = v_planet.id;
              INSERT INTO user_technologies (user_id, technology_type_id, level, is_researching, research_start_time, research_end_time, research_planet_id)
              VALUES (v_bot.id, v_tech.id, v_tech_current_level, true, now(), now() + (v_research_time || ' seconds')::interval, v_planet.id)
              ON CONFLICT (user_id, technology_type_id) DO UPDATE SET is_researching = true, research_start_time = now(), research_end_time = now() + (v_research_time || ' seconds')::interval, research_planet_id = v_planet.id;
              v_research_started := v_research_started + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'research_started', jsonb_build_object('technology', v_tech.code, 'next_level', v_tech_current_level + 1, 'role', v_planet_role, 'empire_role', v_empire_research_role));
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- Phase C: Ships - prioritize colony ships and recyclers when needed
      IF v_shipyard_level >= 1 THEN
        SELECT EXISTS(SELECT 1 FROM shipyard_queue WHERE planet_id = v_planet.id) INTO v_shipyard_busy;
        IF NOT v_shipyard_busy THEN
                              -- Contador: cuántos tipos distintos encolar en este tick
          v_ship_types_queued_this_tick := 0;
          IF v_planet_role = 'military' THEN
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.45 THEN 4
              ELSE 5
            END;
            v_ship_priority := ARRAY[
              'light_fighter',
              'heavy_fighter',
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber',
              'large_cargo',
              'small_cargo',
              'recycler',
              'espionage_probe',
              'colony_ship'
            ];
          ELSIF v_planet_role = 'miner' THEN
            -- [MINER] Solo naves económicas. NO construir militares ni sondas masivas ni colony_ship.
            v_max_ship_types_per_tick := 2;
            v_ship_priority := ARRAY[
              'small_cargo',
              'large_cargo',
              'recycler'
            ];
          ELSIF v_planet_role = 'research' THEN
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.6 THEN 2
              ELSE 3
            END;
            v_ship_priority := ARRAY[
              'espionage_probe',
              'small_cargo',
              'recycler',
              'large_cargo',
              'light_fighter',
              'heavy_fighter',
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber',
              'colony_ship'
            ];
          ELSIF v_planet_role = 'colonizer' THEN
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.4 THEN 3
              ELSE 4
            END;
            v_ship_priority := ARRAY[
              'colony_ship',
              'small_cargo',
              'large_cargo',
              'recycler',
              'espionage_probe',
              'light_fighter',
              'heavy_fighter',
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber'
            ];
          ELSE
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.3 THEN 3
              WHEN random() < 0.7 THEN 4
              ELSE 5
            END;
            IF random() < 0.33 THEN
              v_ship_priority := ARRAY[
                'small_cargo',
                'large_cargo',
                'recycler',
                'espionage_probe',
                'colony_ship',
                'cruiser',
                'battleship',
                'battlecruiser',
                'destroyer',
                'bomber',
                'heavy_fighter',
                'light_fighter'
              ];
            ELSIF random() < 0.66 THEN
              v_ship_priority := ARRAY[
                'cruiser',
                'battleship',
                'battlecruiser',
                'destroyer',
                'bomber',
                'heavy_fighter',
                'light_fighter',
                'large_cargo',
                'small_cargo',
                'recycler',
                'espionage_probe',
                'colony_ship'
              ];
            ELSE
              v_ship_priority := ARRAY[
                'heavy_fighter',
                'cruiser',
                'battleship',
                'battlecruiser',
                'small_cargo',
                'large_cargo',
                'recycler',
                'espionage_probe',
                'colony_ship',
                'destroyer',
                'bomber',
                'light_fighter'
              ];
            END IF;
          END IF;

          FOR i IN 1..array_length(v_ship_priority, 1) LOOP
            SELECT * INTO v_ship FROM ship_types WHERE code = v_ship_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;

            v_req_met := true;
            FOR v_req IN SELECT sr.required_building_id, sr.required_building_level, sr.required_tech_id, sr.required_tech_level FROM ship_requirements sr WHERE sr.ship_type_id = v_ship.id LOOP
              IF v_req.required_building_id IS NOT NULL THEN
                SELECT COALESCE(pb.level, 0) INTO v_req_level FROM planet_buildings pb WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_req.required_building_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_building_level THEN v_req_met := false; EXIT; END IF;
              END IF;
              IF v_req.required_tech_id IS NOT NULL THEN
                SELECT COALESCE(ut.level, 0) INTO v_req_level FROM user_technologies ut WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_req.required_tech_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_tech_level THEN v_req_met := false; EXIT; END IF;
              END IF;
            END LOOP;
            IF NOT v_req_met THEN CONTINUE; END IF;

            SELECT COALESCE(ps.quantity, 0) INTO v_existing_ship_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_ship.id;
            v_existing_ship_count := COALESCE(v_existing_ship_count, 0);

            -- No fixed caps: bots build as many ships as they can afford
            -- Build in batches to avoid spending all resources at once
            CASE v_ship.code
              WHEN 'espionage_probe' THEN
                -- Cap: máximo 4 sondas por planeta (suficiente para espionaje normal).
                -- Si ya tiene 4+, no construir más. Si tiene <4, encolar máx 2 por tick.
                IF v_existing_ship_count >= 4 THEN
                  v_ship_qty := 0;
                ELSE
                  v_ship_qty := LEAST(2, 4 - v_existing_ship_count);
                END IF;
              WHEN 'small_cargo' THEN v_ship_qty := GREATEST(1, LEAST(20, FLOOR(v_bot_points / 300.0)::int));
              WHEN 'large_cargo' THEN v_ship_qty := GREATEST(1, LEAST(15, FLOOR(v_bot_points / 500.0)::int));
              WHEN 'recycler' THEN v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 500.0)::int));
              WHEN 'colony_ship' THEN
                IF v_current_colonies < LEAST(v_max_colonies, 9) AND v_impulse_drive_level >= 3 THEN
                  v_ship_qty := GREATEST(0, 1 - v_existing_ship_count);
                ELSE
                  v_ship_qty := 0;
                END IF;
              WHEN 'light_fighter' THEN v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 250.0)::int));
              WHEN 'heavy_fighter' THEN v_ship_qty := GREATEST(1, LEAST(16, FLOOR(v_bot_points / 220.0)::int));
              WHEN 'cruiser' THEN v_ship_qty := GREATEST(1, LEAST(12, FLOOR(v_bot_points / 450.0)::int));
              WHEN 'battleship' THEN v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 700.0)::int));
              WHEN 'bomber' THEN v_ship_qty := GREATEST(1, LEAST(6, FLOOR(v_bot_points / 1100.0)::int));
              WHEN 'battlecruiser' THEN v_ship_qty := GREATEST(1, LEAST(8, FLOOR(v_bot_points / 900.0)::int));
              WHEN 'destroyer' THEN v_ship_qty := GREATEST(1, LEAST(6, FLOOR(v_bot_points / 1200.0)::int));
              ELSE v_ship_qty := 1;
            END CASE;

            IF v_ship_qty <= 0 THEN CONTINUE; END IF;

            v_cost_metal := v_ship.metal_cost::bigint * v_ship_qty;
            v_cost_crystal := v_ship.crystal_cost::bigint * v_ship_qty;
            v_cost_deuterium := v_ship.deuterium_cost::bigint * v_ship_qty;

            IF v_resources.metal >= v_cost_metal AND v_resources.crystal >= v_cost_crystal AND v_resources.deuterium >= v_cost_deuterium THEN
              v_ship_build_time := GREATEST(1, FLOOR((v_ship.metal_cost + v_ship.crystal_cost) / (2500.0 * (1 + v_shipyard_level)) * 3600 / POWER(2, v_nanite_level) / v_game_speed));
              UPDATE planet_resources SET metal = metal - v_cost_metal, crystal = crystal - v_cost_crystal, deuterium = deuterium - v_cost_deuterium, last_update = now() WHERE planet_id = v_planet.id;
              INSERT INTO shipyard_queue (planet_id, item_type, ship_type_id, defense_type_id, quantity, quantity_completed, metal_cost, crystal_cost, deuterium_cost, build_time_per_unit, queue_position, start_time, current_unit_end_time)
              VALUES (v_planet.id, 'ship', v_ship.id, NULL, v_ship_qty, 0, v_ship.metal_cost, v_ship.crystal_cost, v_ship.deuterium_cost, v_ship_build_time, 1, now(), now() + (v_ship_build_time || ' seconds')::interval);
              v_ships_queued := v_ships_queued + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'ships_queued', jsonb_build_object('ship', v_ship.code, 'quantity', v_ship_qty, 'role', v_planet_role));
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              v_ship_types_queued_this_tick := v_ship_types_queued_this_tick + 1;
              IF v_ship_types_queued_this_tick >= v_max_ship_types_per_tick THEN EXIT; END IF;
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- Phase D: Defenses
      IF v_shipyard_level >= 1 THEN
        SELECT EXISTS(SELECT 1 FROM shipyard_queue WHERE planet_id = v_planet.id) INTO v_shipyard_busy;
        IF NOT v_shipyard_busy THEN
                    IF v_planet_role = 'military' THEN
            v_defense_priority := ARRAY['gauss_cannon', 'plasma_turret', 'ion_cannon', 'heavy_laser', 'light_laser', 'rocket_launcher', 'small_shield_dome', 'large_shield_dome'];
          ELSIF v_planet_role = 'miner' THEN
            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'heavy_laser', 'small_shield_dome', 'gauss_cannon', 'ion_cannon', 'large_shield_dome', 'plasma_turret'];
          ELSIF v_planet_role = 'research' THEN
            v_defense_priority := ARRAY['light_laser', 'rocket_launcher', 'heavy_laser', 'small_shield_dome', 'ion_cannon', 'gauss_cannon', 'large_shield_dome', 'plasma_turret'];
          ELSIF v_planet_role = 'colonizer' THEN
            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'small_shield_dome', 'heavy_laser', 'gauss_cannon', 'ion_cannon', 'large_shield_dome', 'plasma_turret'];
          ELSE
            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'heavy_laser', 'gauss_cannon', 'ion_cannon', 'plasma_turret', 'small_shield_dome', 'large_shield_dome'];
          END IF;
          FOR i IN 1..array_length(v_defense_priority, 1) LOOP
            SELECT * INTO v_def FROM defense_types WHERE code = v_defense_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;
            v_req_met := true;
            FOR v_req IN SELECT dr.required_building_id, dr.required_building_level, dr.required_tech_id, dr.required_tech_level FROM defense_requirements dr WHERE dr.defense_type_id = v_def.id LOOP
              IF v_req.required_building_id IS NOT NULL THEN
                SELECT COALESCE(pb.level, 0) INTO v_req_level FROM planet_buildings pb WHERE pb.planet_id = v_planet.id AND pb.building_type_id = v_req.required_building_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_building_level THEN v_req_met := false; EXIT; END IF;
              END IF;
              IF v_req.required_tech_id IS NOT NULL THEN
                SELECT COALESCE(ut.level, 0) INTO v_req_level FROM user_technologies ut WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_req.required_tech_id;
                v_req_level := COALESCE(v_req_level, 0);
                IF v_req_level < v_req.required_tech_level THEN v_req_met := false; EXIT; END IF;
              END IF;
            END LOOP;
            IF NOT v_req_met THEN CONTINUE; END IF;

            SELECT COALESCE(pd.quantity, 0) INTO v_existing_def_count FROM planet_defenses pd WHERE pd.planet_id = v_planet.id AND pd.defense_type_id = v_def.id;
            v_existing_def_count := COALESCE(v_existing_def_count, 0);
            v_max_per_planet := v_def.max_per_planet;

            -- No fixed caps: bots build as many defenses as they can afford
            CASE v_def.code
              WHEN 'rocket_launcher' THEN v_def_qty := GREATEST(2, LEAST(CASE WHEN v_planet_role = 'miner' THEN 12 ELSE 50 END, FLOOR(v_bot_points / 100.0)::int));
              WHEN 'light_laser' THEN v_def_qty := GREATEST(2, LEAST(CASE WHEN v_planet_role = 'miner' THEN 10 ELSE 40 END, FLOOR(v_bot_points / 150.0)::int));
              WHEN 'heavy_laser' THEN v_def_qty := GREATEST(1, LEAST(CASE WHEN v_planet_role = 'miner' THEN 6 ELSE 25 END, FLOOR(v_bot_points / 300.0)::int));
              WHEN 'gauss_cannon' THEN v_def_qty := GREATEST(1, LEAST(CASE WHEN v_planet_role = 'miner' THEN 2 ELSE 15 END, FLOOR(v_bot_points / 500.0)::int));
              WHEN 'ion_cannon' THEN v_def_qty := GREATEST(1, LEAST(CASE WHEN v_planet_role = 'miner' THEN 2 ELSE 15 END, FLOOR(v_bot_points / 500.0)::int));
              WHEN 'plasma_turret' THEN v_def_qty := GREATEST(1, LEAST(CASE WHEN v_planet_role = 'miner' THEN 1 ELSE 10 END, FLOOR(v_bot_points / 800.0)::int));
              WHEN 'small_shield_dome' THEN v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              WHEN 'large_shield_dome' THEN v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              ELSE v_def_qty := 1;
            END CASE;

            IF v_max_per_planet IS NOT NULL THEN v_def_qty := LEAST(v_def_qty, v_max_per_planet - v_existing_def_count); END IF;
            IF v_def_qty <= 0 THEN CONTINUE; END IF;

            v_cost_metal := v_def.metal_cost::bigint * v_def_qty;
            v_cost_crystal := v_def.crystal_cost::bigint * v_def_qty;
            v_cost_deuterium := v_def.deuterium_cost::bigint * v_def_qty;

            IF v_resources.metal >= v_cost_metal AND v_resources.crystal >= v_cost_crystal AND v_resources.deuterium >= v_cost_deuterium THEN
              v_def_build_time := GREATEST(1, FLOOR((v_def.metal_cost + v_def.crystal_cost) / (2500.0 * (1 + v_shipyard_level)) * 3600 / POWER(2, v_nanite_level) / v_game_speed));
              UPDATE planet_resources SET metal = metal - v_cost_metal, crystal = crystal - v_cost_crystal, deuterium = deuterium - v_cost_deuterium, last_update = now() WHERE planet_id = v_planet.id;
              INSERT INTO shipyard_queue (planet_id, item_type, ship_type_id, defense_type_id, quantity, quantity_completed, metal_cost, crystal_cost, deuterium_cost, build_time_per_unit, queue_position, start_time, current_unit_end_time)
              VALUES (v_planet.id, 'defense', NULL, v_def.id, v_def_qty, 0, v_def.metal_cost, v_def.crystal_cost, v_def.deuterium_cost, v_def_build_time, 1, now(), now() + (v_def_build_time || ' seconds')::interval);
              v_defenses_queued := v_defenses_queued + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'defenses_queued', jsonb_build_object('defense', v_def.code, 'quantity', v_def_qty, 'role', v_planet_role));
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      v_fleet_action_taken := false;

      SELECT COUNT(*) INTO v_origin_active_fleets
      FROM fleets
      WHERE user_id = v_bot.id AND origin_planet_id = v_planet.id AND is_completed = false;

      -- Phase I: Fleet Save - detect incoming hostile attacks and evacuate
      IF v_origin_active_fleets = 0 AND NOT v_fleet_action_taken THEN
        FOR v_incoming_attack IN
          SELECT f.user_id, f.arrival_time, f.target_galaxy, f.target_system, f.target_position
          FROM fleets f
          WHERE f.target_galaxy = v_planet.galaxy
            AND f.target_system = v_planet.solar_system
            AND f.target_position = v_planet.position
            AND f.target_type = 'planet'
            AND f.mission_type = 'attack'
            AND f.is_completed = false
            AND f.is_returning = false
            AND f.user_id <> v_bot.id
            AND f.arrival_time <= now() + interval '30 minutes'
          ORDER BY f.arrival_time ASC
          LIMIT 1
        LOOP
          -- Count ships to save
          SELECT COALESCE(ps.quantity, 0) INTO v_light_fighter_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_light_fighter_type_id;
          SELECT COALESCE(ps.quantity, 0) INTO v_heavy_fighter_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_heavy_fighter_type_id;
          SELECT COALESCE(ps.quantity, 0) INTO v_cruiser_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_cruiser_type_id;
          SELECT COALESCE(ps.quantity, 0) INTO v_battleship_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_battleship_type_id;
          SELECT COALESCE(ps.quantity, 0) INTO v_battlecruiser_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_battlecruiser_type_id;
          SELECT COALESCE(ps.quantity, 0) INTO v_bomber_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_bomber_type_id;
          SELECT COALESCE(ps.quantity, 0) INTO v_destroyer_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_destroyer_type_id;
          SELECT COALESCE(ps.quantity, 0) INTO v_small_cargo_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_small_cargo_type_id;
          SELECT COALESCE(ps.quantity, 0) INTO v_large_cargo_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_large_cargo_type_id;

          IF (v_light_fighter_count + v_heavy_fighter_count + v_cruiser_count + v_battleship_count + v_battlecruiser_count + v_bomber_count + v_destroyer_count + v_small_cargo_count + v_large_cargo_count) > 0 THEN
            v_fleet_save_done := false;
            -- Find a safe own planet to deploy to
            FOR v_save_target IN
              SELECT p2.galaxy, p2.solar_system, p2.position
              FROM planets p2
              WHERE p2.user_id = v_bot.id
                AND p2.id <> v_planet.id
                AND p2.planet_type = 'planet'
                AND NOT p2.is_destroyed
              ORDER BY ABS(p2.galaxy - v_planet.galaxy), ABS(p2.solar_system - v_planet.solar_system), ABS(p2.position - v_planet.position)
              LIMIT 1
            LOOP
              v_fleet_result := secure_send_fleet(
                p_origin_planet_id := v_planet.id,
                p_target_galaxy := v_save_target.galaxy,
                p_target_system := v_save_target.solar_system,
                p_target_position := v_save_target.position,
                p_mission_type := 'deploy',
                p_fleet_ships := (
                  SELECT jsonb_agg(x) FROM (
                    SELECT jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', v_small_cargo_count) WHERE v_small_cargo_count > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_large_cargo_type_id, 'quantity', v_large_cargo_count) WHERE v_large_cargo_count > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_light_fighter_type_id, 'quantity', v_light_fighter_count) WHERE v_light_fighter_count > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_heavy_fighter_type_id, 'quantity', v_heavy_fighter_count) WHERE v_heavy_fighter_count > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_cruiser_type_id, 'quantity', v_cruiser_count) WHERE v_cruiser_count > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_battleship_type_id, 'quantity', v_battleship_count) WHERE v_battleship_count > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_battlecruiser_type_id, 'quantity', v_battlecruiser_count) WHERE v_battlecruiser_count > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_bomber_type_id, 'quantity', v_bomber_count) WHERE v_bomber_count > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_destroyer_type_id, 'quantity', v_destroyer_count) WHERE v_destroyer_count > 0
                  ) x
                ),
                p_cargo_metal := LEAST(v_resources.metal, 20000),
                p_cargo_crystal := LEAST(v_resources.crystal, 10000),
                p_cargo_deuterium := LEAST(v_resources.deuterium, 5000),
                p_speed_percent := 100,
                p_target_type := 'planet',
                p_override_user_id := v_bot.id
              );

              IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                v_fleets_sent := v_fleets_sent + 1;
                v_fleet_saves_sent := v_fleet_saves_sent + 1;
                v_fleet_action_taken := true;
                v_fleet_save_done := true;
                EXIT;
              END IF;
            END LOOP;
          END IF;
          EXIT;
        END LOOP;
      END IF;

      -- Phase E: Espionage (25% chance per tick, skip targets already spied recently)
      v_phase_rand := random();
      IF v_origin_active_fleets = 0 AND NOT v_fleet_action_taken AND v_probe_ship_type_id IS NOT NULL AND v_phase_rand < 0.25 THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_probe_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_probe_ship_type_id;
        v_probe_count := COALESCE(v_probe_count, 0);

        IF v_probe_count >= 1 THEN
          FOR v_target IN
            SELECT tp.user_id, tp.galaxy, tp.solar_system, tp.position, COALESCE(pr.points_total, 0) AS points_total
            FROM planets tp
            JOIN profiles pr ON pr.id = tp.user_id
            WHERE tp.planet_type = 'planet'
              AND NOT tp.is_destroyed
              AND tp.user_id <> v_bot.id
              AND pr.is_bot = false
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = tp.user_id
              )
              AND COALESCE(pr.vacation_mode, false) = false
              AND tp.galaxy = v_planet.galaxy
              AND ABS(tp.solar_system - v_planet.solar_system) <= 15
              AND NOT EXISTS (
                SELECT 1 FROM fleets f
                WHERE f.user_id = v_bot.id AND f.origin_planet_id = v_planet.id AND f.target_galaxy = tp.galaxy AND f.target_system = tp.solar_system AND f.target_position = tp.position AND f.target_type = 'planet' AND f.mission_type = 'espionage' AND f.is_completed = false
              )
              -- [ANTI-SPAM SPY] No re-espiar el mismo objetivo en 24h (lo delata como NPC)
              AND NOT EXISTS (
                SELECT 1 FROM fleets f2
                WHERE f2.user_id = v_bot.id
                  AND f2.target_galaxy = tp.galaxy
                  AND f2.target_system = tp.solar_system
                  AND f2.target_position = tp.position
                  AND f2.target_type = 'planet'
                  AND f2.mission_type = 'espionage'
                  AND f2.departure_time > now() - interval '24 hours'
              )
              -- [ANTI-SPAM SPY] No espiar a quien ya atacamos en 24h (ya tenemos info fresca)
              AND NOT EXISTS (
                SELECT 1 FROM fleets f3
                WHERE f3.user_id = v_bot.id
                  AND f3.target_galaxy = tp.galaxy
                  AND f3.target_system = tp.solar_system
                  AND f3.target_position = tp.position
                  AND f3.target_type = 'planet'
                  AND f3.mission_type = 'attack'
                  AND f3.departure_time > now() - interval '24 hours'
              )
            ORDER BY ABS(tp.solar_system - v_planet.solar_system), random(), points_total
            LIMIT 6
          LOOP
            -- [FILTRO NPC] No espiar a jugadores protegidos (novato) ni a rivales demasiado fuertes (superiores)
            v_protection_check := check_noob_protection(v_bot.id, v_target.user_id);
            IF v_protection_check IS NULL OR NOT COALESCE((v_protection_check->>'can_attack')::boolean, false) THEN CONTINUE; END IF;

            v_fleet_result := secure_send_fleet(
              p_origin_planet_id := v_planet.id,
              p_target_galaxy := v_target.galaxy,
              p_target_system := v_target.solar_system,
              p_target_position := v_target.position,
              p_mission_type := 'espionage',
              p_fleet_ships := jsonb_build_array(jsonb_build_object('ship_type_id', v_probe_ship_type_id, 'quantity', 1)),
              p_cargo_metal := 0,
              p_cargo_crystal := 0,
              p_cargo_deuterium := 0,
              p_speed_percent := 100,
              p_target_type := 'planet',
              p_override_user_id := v_bot.id
            );
            IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
              v_fleets_sent := v_fleets_sent + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'espionage_sent', jsonb_build_object('mission', 'espionage', 'role', v_planet_role));
              v_fleet_action_taken := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- Phase F: Strategic mixed attacks (attack weak targets hard, raid stronger ones)
      v_phase_rand := random();
      IF v_planet_role = 'military' AND NOT v_fleet_action_taken AND v_origin_active_fleets = 0 AND v_phase_rand < 0.5 THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_light_fighter_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_light_fighter_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_heavy_fighter_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_heavy_fighter_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_cruiser_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_cruiser_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_battleship_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_battleship_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_battlecruiser_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_battlecruiser_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_bomber_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_bomber_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_destroyer_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_destroyer_type_id;

        IF (v_light_fighter_count + v_heavy_fighter_count + v_cruiser_count + v_battleship_count + v_battlecruiser_count + v_bomber_count + v_destroyer_count) >= 3 THEN
          v_attacker_power := estimate_fleet_power(
            v_light_fighter_count,
            v_heavy_fighter_count,
            v_cruiser_count,
            v_battleship_count,
            v_battlecruiser_count,
            v_bomber_count,
            v_destroyer_count
          );

          v_spy_target_found := false;
          FOR v_target IN
            SELECT
              tp.user_id,
              tp.galaxy,
              tp.solar_system,
              tp.position,
              COALESCE(pr.points_total, 0) AS points_total,
              COALESCE(pr.points_fleet, 0) AS points_fleet,
              COALESCE(pr.points_defense, 0) AS points_defense,
              m.body AS spy_body
            FROM messages m
            JOIN planets tp ON (
              tp.user_id <> v_bot.id
              AND tp.planet_type = 'planet'
              AND NOT tp.is_destroyed
            )
            JOIN profiles pr ON pr.id = tp.user_id
            WHERE m.recipient_id = v_bot.id
              AND m.message_type = 'espionage' AND m.body ~ '^\s*\{'
              AND m.created_at >= NOW() - interval '48 hours'
              AND pr.is_bot = false
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = tp.user_id
              )
              AND COALESCE(pr.vacation_mode, false) = false
              AND tp.galaxy = v_planet.galaxy
              AND ABS(tp.solar_system - v_planet.solar_system) <= 12
              AND m.body::jsonb->>'coordinates' = (tp.galaxy || ':' || tp.solar_system || ':' || tp.position)
              AND NOT EXISTS (
                SELECT 1 FROM fleets f
                WHERE f.user_id = v_bot.id AND f.origin_planet_id = v_planet.id AND f.target_galaxy = tp.galaxy AND f.target_system = tp.solar_system AND f.target_position = tp.position AND f.target_type = 'planet' AND f.mission_type = 'attack' AND f.is_completed = false
              )
            ORDER BY (
              COALESCE((m.body::jsonb->'resources'->>'metal')::bigint, 0) +
              COALESCE((m.body::jsonb->'resources'->>'crystal')::bigint, 0) +
              COALESCE((m.body::jsonb->'resources'->>'deuterium')::bigint, 0)
            ) DESC, random()
            LIMIT 8
          LOOP
            v_spy_target_found := true;

            BEGIN
              v_spy_body := v_target.spy_body::jsonb;
              v_spy_total_resources := COALESCE((v_spy_body->'resources'->>'metal')::bigint, 0)
                + COALESCE((v_spy_body->'resources'->>'crystal')::bigint, 0)
                + COALESCE((v_spy_body->'resources'->>'deuterium')::bigint, 0);

              v_spy_rl := 0; v_spy_ll := 0; v_spy_hl := 0; v_spy_gc := 0; v_spy_ic := 0; v_spy_pt := 0;
              v_spy_fleet_lf := 0; v_spy_fleet_hf := 0; v_spy_fleet_cr := 0; v_spy_fleet_bs := 0; v_spy_fleet_bc := 0; v_spy_fleet_bo := 0; v_spy_fleet_de := 0;

              IF jsonb_typeof(COALESCE(v_spy_body->'defenses', '[]'::jsonb)) = 'array' THEN
                SELECT
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'rocket_launcher' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'light_laser' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'heavy_laser' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'gauss_cannon' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'ion_cannon' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'plasma_turret' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0)
                INTO v_spy_rl, v_spy_ll, v_spy_hl, v_spy_gc, v_spy_ic, v_spy_pt
                FROM jsonb_array_elements(COALESCE(v_spy_body->'defenses', '[]'::jsonb)) AS elem;
              END IF;

              IF jsonb_typeof(COALESCE(v_spy_body->'fleet', '[]'::jsonb)) = 'array' THEN
                SELECT
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'light_fighter' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'heavy_fighter' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'cruiser' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'battleship' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'battlecruiser' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'bomber' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0),
                  COALESCE(SUM(CASE WHEN elem->>'code' = 'destroyer' THEN COALESCE((elem->>'quantity')::integer, 0) ELSE 0 END), 0)
                INTO v_spy_fleet_lf, v_spy_fleet_hf, v_spy_fleet_cr, v_spy_fleet_bs, v_spy_fleet_bc, v_spy_fleet_bo, v_spy_fleet_de
                FROM jsonb_array_elements(COALESCE(v_spy_body->'fleet', '[]'::jsonb)) AS elem;
              END IF;

              v_defender_power :=
                estimate_defense_power(v_spy_rl, v_spy_ll, v_spy_hl, v_spy_gc, v_spy_ic, v_spy_pt)
                + estimate_fleet_power(v_spy_fleet_lf, v_spy_fleet_hf, v_spy_fleet_cr, v_spy_fleet_bs, v_spy_fleet_bc, v_spy_fleet_bo, v_spy_fleet_de);

              IF v_defender_power <= 0 THEN
                v_defender_power := estimate_profile_combat_power(v_target.points_fleet, v_target.points_defense);
              END IF;

              v_attack_mode := 'skip';
              IF v_spy_total_resources < 12000 THEN
                v_attack_mode := 'skip';
              ELSIF v_defender_power = 0 OR v_attacker_power >= (v_defender_power * 1.20) THEN
                v_attack_mode := 'full';
              ELSIF v_spy_total_resources >= 60000 AND v_attacker_power >= (v_defender_power * 0.72) THEN
                v_attack_mode := 'raid';
              ELSE
                SELECT EXISTS(
                  SELECT 1
                  FROM battle_reports br
                  WHERE br.defender_id = v_bot.id
                    AND br.attacker_id = v_target.user_id
                    AND br.created_at >= NOW() - interval '24 hours'
                ) INTO v_recent_hostile;
                IF v_recent_hostile AND v_attacker_power >= (v_defender_power * 0.65) THEN
                  v_attack_mode := 'raid';
                END IF;
              END IF;

              IF v_attack_mode = 'skip' THEN CONTINUE; END IF;

            EXCEPTION WHEN OTHERS THEN
              CONTINUE;
            END;

            SELECT COUNT(*) INTO v_attacks_today
            FROM fleets f
            WHERE f.user_id = v_bot.id AND f.mission_type = 'attack' AND f.target_galaxy = v_target.galaxy AND f.target_system = v_target.solar_system AND f.target_position = v_target.position AND f.departure_time >= NOW() - interval '24 hours';
            IF v_attacks_today >= 2 THEN CONTINUE; END IF;

            v_protection_check := check_noob_protection(v_bot.id, v_target.user_id);
            IF v_protection_check IS NULL OR NOT COALESCE((v_protection_check->>'can_attack')::boolean, false) THEN CONTINUE; END IF;

            IF v_attack_mode = 'raid' THEN
              v_send_lf := GREATEST(0, FLOOR(v_light_fighter_count * 0.20)::int);
              v_send_hf := GREATEST(0, FLOOR(v_heavy_fighter_count * 0.15)::int);
              v_send_cr := GREATEST(0, FLOOR(v_cruiser_count * 0.45)::int);
              v_send_bs := GREATEST(0, FLOOR(v_battleship_count * 0.30)::int);
              v_send_bc := GREATEST(0, FLOOR(v_battlecruiser_count * 0.50)::int);
              v_send_bo := 0;
              v_send_de := GREATEST(0, FLOOR(v_destroyer_count * 0.20)::int);
            ELSE
              v_send_lf := GREATEST(0, FLOOR(v_light_fighter_count * 0.55)::int);
              v_send_hf := GREATEST(0, FLOOR(v_heavy_fighter_count * 0.55)::int);
              v_send_cr := GREATEST(0, FLOOR(v_cruiser_count * 0.55)::int);
              v_send_bs := GREATEST(0, FLOOR(v_battleship_count * 0.55)::int);
              v_send_bc := GREATEST(0, FLOOR(v_battlecruiser_count * 0.60)::int);
              v_send_bo := GREATEST(0, FLOOR(v_bomber_count * 0.45)::int);
              v_send_de := GREATEST(0, FLOOR(v_destroyer_count * 0.45)::int);
            END IF;

            IF (v_send_lf + v_send_hf + v_send_cr + v_send_bs + v_send_bc + v_send_bo + v_send_de) <= 0 THEN CONTINUE; END IF;

            v_fleet_result := secure_send_fleet(
              p_origin_planet_id := v_planet.id,
              p_target_galaxy := v_target.galaxy,
              p_target_system := v_target.solar_system,
              p_target_position := v_target.position,
              p_mission_type := 'attack',
              p_fleet_ships := (
                SELECT jsonb_agg(x) FROM (
                  SELECT jsonb_build_object('ship_type_id', v_light_fighter_type_id, 'quantity', v_send_lf) WHERE v_send_lf > 0
                  UNION ALL SELECT jsonb_build_object('ship_type_id', v_heavy_fighter_type_id, 'quantity', v_send_hf) WHERE v_send_hf > 0
                  UNION ALL SELECT jsonb_build_object('ship_type_id', v_cruiser_type_id, 'quantity', v_send_cr) WHERE v_send_cr > 0
                  UNION ALL SELECT jsonb_build_object('ship_type_id', v_battleship_type_id, 'quantity', v_send_bs) WHERE v_send_bs > 0
                  UNION ALL SELECT jsonb_build_object('ship_type_id', v_battlecruiser_type_id, 'quantity', v_send_bc) WHERE v_send_bc > 0
                  UNION ALL SELECT jsonb_build_object('ship_type_id', v_bomber_type_id, 'quantity', v_send_bo) WHERE v_send_bo > 0
                  UNION ALL SELECT jsonb_build_object('ship_type_id', v_destroyer_type_id, 'quantity', v_send_de) WHERE v_send_de > 0
                ) x
              ),
              p_cargo_metal := 0,
              p_cargo_crystal := 0,
              p_cargo_deuterium := 0,
              p_speed_percent := CASE WHEN v_attack_mode = 'raid' THEN 100 ELSE 90 END,
              p_target_type := 'planet',
              p_override_user_id := v_bot.id
            );

            IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
              v_fleets_sent := v_fleets_sent + 1;
              v_fleet_action_taken := true;
              EXIT;
            END IF;
          END LOOP;

          -- Fallback if no fresh spy reports: estimate risk from profile points
          IF NOT v_spy_target_found AND NOT v_fleet_action_taken THEN
            FOR v_target IN
              SELECT
                tp.user_id,
                tp.galaxy,
                tp.solar_system,
                tp.position,
                COALESCE(pr.points_total, 0) AS points_total,
                COALESCE(pr.points_fleet, 0) AS points_fleet,
                COALESCE(pr.points_defense, 0) AS points_defense
              FROM planets tp
              JOIN profiles pr ON pr.id = tp.user_id
              WHERE tp.planet_type = 'planet'
                AND NOT tp.is_destroyed
                AND tp.user_id <> v_bot.id
                AND pr.is_bot = false
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = tp.user_id
              )
                AND COALESCE(pr.vacation_mode, false) = false
                AND tp.galaxy = v_planet.galaxy
                AND ABS(tp.solar_system - v_planet.solar_system) <= 12
                AND NOT EXISTS (
                  SELECT 1 FROM fleets f
                  WHERE f.user_id = v_bot.id AND f.origin_planet_id = v_planet.id AND f.target_galaxy = tp.galaxy AND f.target_system = tp.solar_system AND f.target_position = tp.position AND f.target_type = 'planet' AND f.mission_type = 'attack' AND f.is_completed = false
                )
              ORDER BY points_total, ABS(tp.solar_system - v_planet.solar_system), random()
              LIMIT 8
            LOOP
              v_defender_power := estimate_profile_combat_power(v_target.points_fleet, v_target.points_defense);

              v_attack_mode := 'skip';
              IF v_defender_power = 0 OR v_attacker_power >= (v_defender_power * 1.30) THEN
                v_attack_mode := 'full';
              ELSIF v_attacker_power >= (v_defender_power * 0.85)
                    AND v_target.points_total <= (v_bot_points * 1.35) THEN
                v_attack_mode := 'raid';
              ELSE
                SELECT EXISTS(
                  SELECT 1
                  FROM battle_reports br
                  WHERE br.defender_id = v_bot.id
                    AND br.attacker_id = v_target.user_id
                    AND br.created_at >= NOW() - interval '24 hours'
                ) INTO v_recent_hostile;
                IF v_recent_hostile AND v_attacker_power >= (v_defender_power * 0.75) THEN
                  v_attack_mode := 'raid';
                END IF;
              END IF;

              IF v_attack_mode = 'skip' THEN CONTINUE; END IF;

              SELECT COUNT(*) INTO v_attacks_today
              FROM fleets f
              WHERE f.user_id = v_bot.id AND f.mission_type = 'attack' AND f.target_galaxy = v_target.galaxy AND f.target_system = v_target.solar_system AND f.target_position = v_target.position AND f.departure_time >= NOW() - interval '24 hours';
              IF v_attacks_today >= 2 THEN CONTINUE; END IF;

              v_protection_check := check_noob_protection(v_bot.id, v_target.user_id);
              IF v_protection_check IS NULL OR NOT COALESCE((v_protection_check->>'can_attack')::boolean, false) THEN CONTINUE; END IF;

              IF v_attack_mode = 'raid' THEN
                v_send_lf := GREATEST(0, FLOOR(v_light_fighter_count * 0.18)::int);
                v_send_hf := GREATEST(0, FLOOR(v_heavy_fighter_count * 0.12)::int);
                v_send_cr := GREATEST(0, FLOOR(v_cruiser_count * 0.40)::int);
                v_send_bs := GREATEST(0, FLOOR(v_battleship_count * 0.25)::int);
                v_send_bc := GREATEST(0, FLOOR(v_battlecruiser_count * 0.45)::int);
                v_send_bo := 0;
                v_send_de := GREATEST(0, FLOOR(v_destroyer_count * 0.15)::int);
              ELSE
                v_send_lf := GREATEST(0, FLOOR(v_light_fighter_count * 0.55)::int);
                v_send_hf := GREATEST(0, FLOOR(v_heavy_fighter_count * 0.55)::int);
                v_send_cr := GREATEST(0, FLOOR(v_cruiser_count * 0.55)::int);
                v_send_bs := GREATEST(0, FLOOR(v_battleship_count * 0.55)::int);
                v_send_bc := GREATEST(0, FLOOR(v_battlecruiser_count * 0.60)::int);
                v_send_bo := GREATEST(0, FLOOR(v_bomber_count * 0.45)::int);
                v_send_de := GREATEST(0, FLOOR(v_destroyer_count * 0.45)::int);
              END IF;

              IF (v_send_lf + v_send_hf + v_send_cr + v_send_bs + v_send_bc + v_send_bo + v_send_de) <= 0 THEN CONTINUE; END IF;

              v_fleet_result := secure_send_fleet(
                p_origin_planet_id := v_planet.id,
                p_target_galaxy := v_target.galaxy,
                p_target_system := v_target.solar_system,
                p_target_position := v_target.position,
                p_mission_type := 'attack',
                p_fleet_ships := (
                  SELECT jsonb_agg(x) FROM (
                    SELECT jsonb_build_object('ship_type_id', v_light_fighter_type_id, 'quantity', v_send_lf) WHERE v_send_lf > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_heavy_fighter_type_id, 'quantity', v_send_hf) WHERE v_send_hf > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_cruiser_type_id, 'quantity', v_send_cr) WHERE v_send_cr > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_battleship_type_id, 'quantity', v_send_bs) WHERE v_send_bs > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_battlecruiser_type_id, 'quantity', v_send_bc) WHERE v_send_bc > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_bomber_type_id, 'quantity', v_send_bo) WHERE v_send_bo > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_destroyer_type_id, 'quantity', v_send_de) WHERE v_send_de > 0
                  ) x
                ),
                p_cargo_metal := 0,
                p_cargo_crystal := 0,
                p_cargo_deuterium := 0,
                p_speed_percent := CASE WHEN v_attack_mode = 'raid' THEN 100 ELSE 90 END,
                p_target_type := 'planet',
                p_override_user_id := v_bot.id
              );

              IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                v_fleets_sent := v_fleets_sent + 1;
                v_fleet_action_taken := true;
                EXIT;
              END IF;
            END LOOP;
          END IF;
        END IF;
      END IF;

      -- Phase G: Retaliation (smart revenge: full strike if stronger, raid if slightly weaker)
      IF v_planet_role = 'military' AND NOT v_fleet_action_taken AND v_origin_active_fleets = 0 THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_light_fighter_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_light_fighter_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_heavy_fighter_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_heavy_fighter_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_cruiser_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_cruiser_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_battleship_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_battleship_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_battlecruiser_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_battlecruiser_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_bomber_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_bomber_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_destroyer_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_destroyer_type_id;

        IF (v_light_fighter_count + v_heavy_fighter_count + v_cruiser_count + v_battleship_count + v_battlecruiser_count + v_bomber_count + v_destroyer_count) >= 6 THEN
          v_retaliation_done := false;
          v_attacker_power := estimate_fleet_power(
            v_light_fighter_count,
            v_heavy_fighter_count,
            v_cruiser_count,
            v_battleship_count,
            v_battlecruiser_count,
            v_bomber_count,
            v_destroyer_count
          );

          FOR v_attacker IN
            SELECT DISTINCT br.attacker_id
            FROM battle_reports br
            WHERE br.defender_id = v_bot.id AND br.created_at >= NOW() - interval '24 hours' AND br.attacker_id IS NOT NULL AND br.attacker_id <> v_bot.id
              AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = br.attacker_id AND pr.is_bot = false AND COALESCE(pr.vacation_mode, false) = false AND pr.is_admin = false)
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = br.attacker_id
              )
            LIMIT 3
          LOOP
            IF v_retaliation_done THEN EXIT; END IF;

            SELECT COALESCE(points_fleet, 0), COALESCE(points_defense, 0)
            INTO v_target_points_fleet, v_target_points_defense
            FROM profiles
            WHERE id = v_attacker.attacker_id;

            v_defender_power := estimate_profile_combat_power(v_target_points_fleet, v_target_points_defense);

            v_attack_mode := 'skip';
            IF v_defender_power = 0 OR v_attacker_power >= (v_defender_power * 1.10) THEN
              v_attack_mode := 'full';
            ELSIF v_attacker_power >= (v_defender_power * 0.70) THEN
              v_attack_mode := 'raid';
            END IF;
            IF v_attack_mode = 'skip' THEN CONTINUE; END IF;

            v_protection_check := check_noob_protection(v_bot.id, v_attacker.attacker_id);
            IF v_protection_check IS NULL OR NOT COALESCE((v_protection_check->>'can_attack')::boolean, false) THEN CONTINUE; END IF;

            FOR v_attacker_planet IN
              SELECT ap.galaxy, ap.solar_system, ap.position
              FROM planets ap
              WHERE ap.user_id = v_attacker.attacker_id AND ap.planet_type = 'planet' AND NOT ap.is_destroyed
              ORDER BY ABS(ap.galaxy - v_planet.galaxy) * 10000 + ABS(ap.solar_system - v_planet.solar_system) * 100 + ABS(ap.position - v_planet.position)
              LIMIT 1
            LOOP
              SELECT COUNT(*) INTO v_attacks_today
              FROM fleets f
              WHERE f.user_id = v_bot.id AND f.mission_type = 'attack' AND f.target_galaxy = v_attacker_planet.galaxy AND f.target_system = v_attacker_planet.solar_system AND f.target_position = v_attacker_planet.position AND f.departure_time >= NOW() - interval '24 hours';
              IF v_attacks_today >= 2 THEN CONTINUE; END IF;

              IF v_attack_mode = 'raid' THEN
                v_send_lf := GREATEST(0, FLOOR(v_light_fighter_count * 0.20)::int);
                v_send_hf := GREATEST(0, FLOOR(v_heavy_fighter_count * 0.20)::int);
                v_send_cr := GREATEST(0, FLOOR(v_cruiser_count * 0.45)::int);
                v_send_bs := GREATEST(0, FLOOR(v_battleship_count * 0.30)::int);
                v_send_bc := GREATEST(0, FLOOR(v_battlecruiser_count * 0.55)::int);
                v_send_bo := 0;
                v_send_de := GREATEST(0, FLOOR(v_destroyer_count * 0.25)::int);
              ELSE
                v_send_lf := GREATEST(0, FLOOR(v_light_fighter_count * 0.60)::int);
                v_send_hf := GREATEST(0, FLOOR(v_heavy_fighter_count * 0.60)::int);
                v_send_cr := GREATEST(0, FLOOR(v_cruiser_count * 0.60)::int);
                v_send_bs := GREATEST(0, FLOOR(v_battleship_count * 0.60)::int);
                v_send_bc := GREATEST(0, FLOOR(v_battlecruiser_count * 0.65)::int);
                v_send_bo := GREATEST(0, FLOOR(v_bomber_count * 0.50)::int);
                v_send_de := GREATEST(0, FLOOR(v_destroyer_count * 0.50)::int);
              END IF;

              IF (v_send_lf + v_send_hf + v_send_cr + v_send_bs + v_send_bc + v_send_bo + v_send_de) <= 0 THEN CONTINUE; END IF;

              v_fleet_result := secure_send_fleet(
                p_origin_planet_id := v_planet.id,
                p_target_galaxy := v_attacker_planet.galaxy,
                p_target_system := v_attacker_planet.solar_system,
                p_target_position := v_attacker_planet.position,
                p_mission_type := 'attack',
                p_fleet_ships := (
                  SELECT jsonb_agg(x) FROM (
                    SELECT jsonb_build_object('ship_type_id', v_light_fighter_type_id, 'quantity', v_send_lf) WHERE v_send_lf > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_heavy_fighter_type_id, 'quantity', v_send_hf) WHERE v_send_hf > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_cruiser_type_id, 'quantity', v_send_cr) WHERE v_send_cr > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_battleship_type_id, 'quantity', v_send_bs) WHERE v_send_bs > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_battlecruiser_type_id, 'quantity', v_send_bc) WHERE v_send_bc > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_bomber_type_id, 'quantity', v_send_bo) WHERE v_send_bo > 0
                    UNION ALL SELECT jsonb_build_object('ship_type_id', v_destroyer_type_id, 'quantity', v_send_de) WHERE v_send_de > 0
                  ) x
                ),
                p_cargo_metal := 0,
                p_cargo_crystal := 0,
                p_cargo_deuterium := 0,
                p_speed_percent := CASE WHEN v_attack_mode = 'raid' THEN 100 ELSE 90 END,
                p_target_type := 'planet',
                p_override_user_id := v_bot.id
              );
              IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                  v_fleets_sent := v_fleets_sent + 1;
                  v_retaliations_sent := v_retaliations_sent + 1;
                  PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'retaliation_sent', jsonb_build_object('role', v_planet_role));
                  v_fleet_action_taken := true;
                  v_retaliation_done := true;
                  EXIT;
                END IF;
            END LOOP;
          END LOOP;
        END IF;
      END IF;

            -- Phase H: Transport resources between own planets (role-aware, Phase 2)
      IF NOT v_fleet_action_taken
         AND v_origin_active_fleets = 0
         AND v_small_cargo_type_id IS NOT NULL
         AND v_planet_role <> 'military' THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_small_cargo_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_small_cargo_type_id;
        v_small_cargo_count := COALESCE(v_small_cargo_count, 0);
        IF (v_planet_role = 'miner'
              AND v_small_cargo_count >= 2
              AND (v_resources.metal > 15000 OR v_resources.crystal > 10000 OR v_resources.deuterium > 6000))
           OR (v_planet_role <> 'miner'
              AND v_small_cargo_count >= 3
              AND (v_resources.metal > 50000 OR v_resources.crystal > 50000 OR v_resources.deuterium > 30000))
        THEN
          v_transport_done := false;
          FOR v_other_planet IN
            SELECT op.id, op.galaxy, op.solar_system, op.position,
                   COALESCE(op.autopilot_role, 'balanced') AS role
            FROM planets op
            WHERE op.user_id = v_bot.id
              AND op.planet_type = 'planet'
              AND op.id <> v_planet.id
              AND NOT op.is_destroyed
              AND COALESCE(op.autopilot_role, 'balanced') <> 'miner'
              AND NOT EXISTS (
                SELECT 1 FROM fleets f
                WHERE f.user_id = v_bot.id
                  AND f.mission_type = 'transport'
                  AND f.target_galaxy = op.galaxy
                  AND f.target_system = op.solar_system
                  AND f.target_position = op.position
                  AND f.is_completed = false
              )
            ORDER BY
              CASE COALESCE(op.autopilot_role, 'balanced')
                WHEN 'military' THEN 0
                WHEN 'research' THEN 1
                WHEN 'balanced' THEN 2
                WHEN 'colonizer' THEN 3
                ELSE 4
              END,
              ABS(op.galaxy - v_planet.galaxy) * 1000
                + ABS(op.solar_system - v_planet.solar_system)
            LIMIT 5
          LOOP
            IF v_transport_done THEN EXIT; END IF;
            SELECT * INTO v_other_resources FROM planet_resources WHERE planet_id = v_other_planet.id;
            IF NOT FOUND THEN CONTINUE; END IF;

            -- El minero envía siempre (para eso existe). Balanced sólo reequilibra hacia el más pobre.
            IF v_planet_role = 'miner'
               OR v_other_resources.metal < v_resources.metal * 0.4
               OR v_other_resources.crystal < v_resources.crystal * 0.4
            THEN
              v_cargo_capacity := (v_small_cargo_count - 1)::bigint * v_cargo_ship_capacity;

              IF v_planet_role = 'miner' THEN
                -- Dejar reserva mínima para seguir operando la colonia minera
                v_send_metal := LEAST(GREATEST(0, v_resources.metal - 5000), (v_cargo_capacity * 0.55)::bigint)::bigint;
                v_send_crystal := LEAST(GREATEST(0, v_resources.crystal - 4000), ((v_cargo_capacity - v_send_metal) * 0.7)::bigint)::bigint;
                v_send_deut := LEAST(GREATEST(0, v_resources.deuterium - 3000), (v_cargo_capacity - v_send_metal - v_send_crystal))::bigint;
              ELSE
                v_send_metal := LEAST(GREATEST(0, (v_resources.metal - 20000) / 2), v_cargo_capacity * 0.5)::bigint;
                v_send_crystal := LEAST(GREATEST(0, (v_resources.crystal - 15000) / 2), (v_cargo_capacity - v_send_metal) * 0.7)::bigint;
                v_send_deut := LEAST(GREATEST(0, (v_resources.deuterium - 10000) / 4), (v_cargo_capacity - v_send_metal - v_send_crystal))::bigint;
              END IF;

              IF (v_send_metal + v_send_crystal + v_send_deut) >= (CASE WHEN v_planet_role = 'miner' THEN 2000 ELSE 5000 END) THEN
                v_fleet_result := secure_send_fleet(
                  p_origin_planet_id := v_planet.id,
                  p_target_galaxy := v_other_planet.galaxy,
                  p_target_system := v_other_planet.solar_system,
                  p_target_position := v_other_planet.position,
                  p_mission_type := 'transport',
                  p_fleet_ships := jsonb_build_array(jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', v_small_cargo_count - 1)),
                  p_cargo_metal := v_send_metal,
                  p_cargo_crystal := v_send_crystal,
                  p_cargo_deuterium := v_send_deut,
                  p_speed_percent := 100,
                  p_target_type := 'planet',
                  p_override_user_id := v_bot.id
                );
                IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                  v_fleets_sent := v_fleets_sent + 1;
                  v_transports_sent := v_transports_sent + 1;
                  PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'transport_sent', jsonb_build_object('target_planet_id', v_other_planet.id, 'role', v_planet_role, 'metal', v_send_metal, 'crystal', v_send_crystal, 'deuterium', v_send_deut));
                  v_transport_done := true;
                END IF;
              END IF;
            END IF;
          END LOOP;
        END IF;
      END IF;



      -- Phase J: Recycling nearby debris fields (70% chance per tick)
      v_phase_rand := random();
      IF NOT v_fleet_action_taken AND v_origin_active_fleets = 0 AND v_recycler_type_id IS NOT NULL AND v_phase_rand < 0.7 THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_recycler_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_recycler_type_id;
        v_recycler_count := COALESCE(v_recycler_count, 0);
        IF v_recycler_count >= 1 THEN
          FOR v_debris IN
            SELECT df.galaxy, df.solar_system, df.position, df.metal, df.crystal
            FROM debris_fields df
            WHERE (df.metal > 0 OR df.crystal > 0)
              AND df.galaxy = v_planet.galaxy
              AND ABS(df.solar_system - v_planet.solar_system) <= 10
              AND NOT EXISTS (
                SELECT 1 FROM fleets f
                WHERE f.user_id = v_bot.id AND f.target_galaxy = df.galaxy AND f.target_system = df.solar_system AND f.target_position = df.position AND f.mission_type = 'recycle' AND f.is_completed = false
              )
            ORDER BY (df.metal + df.crystal) DESC, ABS(df.solar_system - v_planet.solar_system)
            LIMIT 3
          LOOP
            v_fleet_result := secure_send_fleet(
              p_origin_planet_id := v_planet.id,
              p_target_galaxy := v_debris.galaxy,
              p_target_system := v_debris.solar_system,
              p_target_position := v_debris.position,
              p_mission_type := 'recycle',
              p_fleet_ships := jsonb_build_array(jsonb_build_object('ship_type_id', v_recycler_type_id, 'quantity', LEAST(v_recycler_count, GREATEST(1, CEIL((v_debris.metal + v_debris.crystal) / 20000.0)::int)))),
              p_cargo_metal := 0,
              p_cargo_crystal := 0,
              p_cargo_deuterium := 0,
              p_speed_percent := 100,
              p_target_type := 'planet',
              p_override_user_id := v_bot.id
            );
            IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
              v_fleets_sent := v_fleets_sent + 1;
              v_recyclers_sent := v_recyclers_sent + 1;
              v_fleet_action_taken := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- Phase K: Colonization
      IF (
           v_planet_role = 'colonizer'
           OR (
             v_planet_role = 'balanced'
             AND NOT EXISTS (
               SELECT 1 FROM planets p_col
               WHERE p_col.user_id = v_bot.id
                 AND p_col.planet_type = 'planet'
                 AND NOT p_col.is_destroyed
                 AND COALESCE(p_col.autopilot_role, 'balanced') = 'colonizer'
             )
           )
         )
         AND NOT v_fleet_action_taken AND v_origin_active_fleets = 0 AND v_colony_ship_type_id IS NOT NULL THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_colony_ship_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_colony_ship_type_id;
        v_colony_ship_count := COALESCE(v_colony_ship_count, 0);

        IF v_colony_ship_count >= 1 AND v_current_colonies < LEAST(v_max_colonies, 5) AND v_astrophysics_level >= 1 AND v_impulse_drive_level >= 3 THEN
          v_colonize_done := false;
          FOR v_colonize_target IN
            SELECT gs.pos AS position
            FROM generate_series(1, 15) AS gs(pos)
            WHERE NOT EXISTS (
              SELECT 1 FROM planets p2
              WHERE p2.galaxy = v_planet.galaxy AND p2.solar_system = v_planet.solar_system AND p2.position = gs.pos AND NOT p2.is_destroyed
            )
            ORDER BY CASE WHEN gs.pos BETWEEN 4 AND 12 THEN 0 ELSE 1 END, random()
            LIMIT 5
          LOOP
            v_fleet_result := secure_send_fleet(
              p_origin_planet_id := v_planet.id,
              p_target_galaxy := v_planet.galaxy,
              p_target_system := v_planet.solar_system,
              p_target_position := v_colonize_target.position,
              p_mission_type := 'colonize',
              p_fleet_ships := jsonb_build_array(jsonb_build_object('ship_type_id', v_colony_ship_type_id, 'quantity', 1)),
              p_cargo_metal := 0,
              p_cargo_crystal := 0,
              p_cargo_deuterium := 0,
              p_speed_percent := 100,
              p_target_type := 'planet',
              p_override_user_id := v_bot.id
            );
            IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
              v_fleets_sent := v_fleets_sent + 1;
              v_colonizations_sent := v_colonizations_sent + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'colonization_sent', jsonb_build_object('target_position', v_colonize_target.position, 'galaxy', v_planet.galaxy, 'solar_system', v_planet.solar_system, 'role', v_planet_role));
              v_fleet_action_taken := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'bots_processed', v_bots_processed,
    'buildings_queued', v_buildings_queued,
    'research_started', v_research_started,
    'ships_queued', v_ships_queued,
    'defenses_queued', v_defenses_queued,
    'fleets_sent', v_fleets_sent,
    'retaliations_sent', v_retaliations_sent,
    'transports_sent', v_transports_sent,
    'colonizations_sent', v_colonizations_sent,
    'fleet_saves_sent', v_fleet_saves_sent,
    'recyclers_sent', v_recyclers_sent
  );
END;
$function$;










