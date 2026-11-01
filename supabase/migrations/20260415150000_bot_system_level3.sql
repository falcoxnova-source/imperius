/*
  # Bot NPC System - Level 3 (Fleet Operations)

  ## Purpose
  Upgrade bot AI to send fleets using the real fleet system without duplicating fleet logic.

  ## Changes
  1. Recreate `secure_send_fleet` keeping the current signature order and adding `p_override_user_id uuid DEFAULT NULL`
  2. Replace `bot_ai_tick()` with Level 3, adding:
     - Phase E: espionage against nearby player planets
     - Phase F: safe attacks against nearby valid targets

  ## Safety
  - Existing player calls remain compatible because parameter order is preserved
  - Bot override is only accepted from internal unauthenticated SECURITY DEFINER calls or authenticated admins
  - Bots send at most one active fleet per origin planet at a time
  - All mission validation still goes through `validate_fleet_mission()` and `check_noob_protection()`
*/

-- ============================================================
-- Recreate secure_send_fleet with bot override support
-- ============================================================
DROP FUNCTION IF EXISTS secure_send_fleet(uuid, int, int, int, text, jsonb, bigint, bigint, bigint, int, text);
DROP FUNCTION IF EXISTS secure_send_fleet(uuid, int, int, int, text, jsonb, int, bigint, bigint, bigint, text);
DROP FUNCTION IF EXISTS secure_send_fleet(uuid, int, int, int, text, jsonb, int, bigint, bigint, bigint, text, uuid);

CREATE OR REPLACE FUNCTION secure_send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text,
  p_fleet_ships jsonb,
  p_cargo_metal bigint DEFAULT 0,
  p_cargo_crystal bigint DEFAULT 0,
  p_cargo_deuterium bigint DEFAULT 0,
  p_speed_percent integer DEFAULT 100,
  p_target_type text DEFAULT 'planet'::text,
  p_override_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_caller_is_admin boolean := false;
  v_planet record;
  v_resources record;
  v_distance int;
  v_slowest_speed int;
  v_flight_time int;
  v_fuel_consumption bigint;
  v_total_deut_needed bigint;
  v_ship record;
  v_ship_type record;
  v_planet_ship record;
  v_total_cargo_capacity bigint := 0;
  v_total_cargo_used bigint;
  v_fleet_id uuid;
  v_arrival_time timestamptz;
  v_return_time timestamptz;
  v_validation jsonb;
  v_has_required_ship boolean := true;
  v_colony_ship_type_id int;
  v_recycler_type_id int;
  v_probe_type_id int;
  v_computer_tech_level int := 0;
  v_has_admiral boolean;
  v_admiral_speed_bonus numeric := 0;
  v_max_fleet_slots int;
  v_active_fleet_count int;
  v_profile record;
BEGIN
  IF p_override_user_id IS NOT NULL THEN
    IF auth.uid() IS NOT NULL THEN
      SELECT COALESCE(is_admin, false)
      INTO v_caller_is_admin
      FROM profiles
      WHERE id = auth.uid();

      IF NOT COALESCE(v_caller_is_admin, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized override');
      END IF;
    END IF;

    v_user_id := p_override_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_origin_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned by user');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF v_profile.vacation_mode THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot send fleets in vacation mode');
  END IF;

  IF p_speed_percent < 10 OR p_speed_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Speed must be between 10 and 100');
  END IF;

  IF p_mission_type NOT IN ('attack', 'transport', 'deploy', 'colonize', 'espionage', 'recycle', 'expedition') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid mission type');
  END IF;

  IF p_target_type NOT IN ('planet', 'moon') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid target type');
  END IF;

  IF p_mission_type = 'expedition' AND p_target_position != 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expeditions must target position 16');
  END IF;

  IF p_mission_type != 'expedition' AND p_target_position = 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only expeditions can target position 16');
  END IF;

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_origin_planet_id;
  IF v_resources IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  SELECT COALESCE(
    (
      SELECT level
      FROM user_technologies ut
      JOIN technology_types tt ON ut.technology_type_id = tt.id
      WHERE ut.user_id = v_user_id AND tt.code = 'computer_tech'
    ),
    0
  ) INTO v_computer_tech_level;

  v_has_admiral := has_active_officer(v_user_id, 'admiral');
  v_max_fleet_slots := 1 + v_computer_tech_level + (CASE WHEN v_has_admiral THEN 2 ELSE 0 END);

  IF v_has_admiral THEN
    v_admiral_speed_bonus := 0.2;
  END IF;

  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE user_id = v_user_id AND is_completed = false;

  IF v_active_fleet_count >= v_max_fleet_slots THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available fleet slots');
  END IF;

  FOR v_ship IN
    SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
  LOOP
    IF v_ship.quantity > 0 THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_ship.ship_type_id;
      IF v_ship_type IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid ship type: ' || v_ship.ship_type_id);
      END IF;

      SELECT * INTO v_planet_ship
      FROM planet_ships
      WHERE planet_id = p_origin_planet_id AND ship_type_id = v_ship.ship_type_id;

      IF v_planet_ship IS NULL OR v_planet_ship.quantity < v_ship.quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not enough ships: ' || v_ship_type.name);
      END IF;

      v_total_cargo_capacity := v_total_cargo_capacity + (v_ship_type.cargo_capacity * v_ship.quantity);
    END IF;
  END LOOP;

  SELECT id INTO v_colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
  SELECT id INTO v_recycler_type_id FROM ship_types WHERE code = 'recycler';
  SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';

  IF p_mission_type = 'colonize' THEN
    SELECT true INTO v_has_required_ship
    FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    WHERE x.ship_type_id = v_colony_ship_type_id AND x.quantity >= 1;

    IF NOT COALESCE(v_has_required_ship, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Colonization requires a Colony Ship');
    END IF;
  END IF;

  IF p_mission_type = 'recycle' THEN
    SELECT true INTO v_has_required_ship
    FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    WHERE x.ship_type_id = v_recycler_type_id AND x.quantity >= 1;

    IF NOT COALESCE(v_has_required_ship, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Recycling requires a Recycler');
    END IF;
  END IF;

  IF p_mission_type = 'espionage' THEN
    SELECT true INTO v_has_required_ship
    FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    WHERE x.ship_type_id = v_probe_type_id AND x.quantity >= 1;

    IF NOT COALESCE(v_has_required_ship, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Espionage requires an Espionage Probe');
    END IF;
  END IF;

  v_total_cargo_used := COALESCE(p_cargo_metal, 0) + COALESCE(p_cargo_crystal, 0) + COALESCE(p_cargo_deuterium, 0);
  IF v_total_cargo_used > v_total_cargo_capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cargo exceeds fleet capacity');
  END IF;

  v_distance := fleet_calc_distance(
    v_planet.galaxy,
    v_planet.solar_system,
    v_planet.position,
    p_target_galaxy,
    p_target_system,
    p_target_position
  );

  v_slowest_speed := fleet_calc_slowest_speed(p_fleet_ships, v_user_id);
  IF v_slowest_speed <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No valid ships with speed selected');
  END IF;

  v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent, v_admiral_speed_bonus);

  IF is_user_plus(v_user_id) THEN
    v_flight_time := GREATEST(10, FLOOR(v_flight_time * 0.90));
  END IF;

  v_fuel_consumption := fleet_calc_fuel(p_fleet_ships, v_distance, p_speed_percent);
  v_total_deut_needed := v_fuel_consumption + COALESCE(p_cargo_deuterium, 0);

  IF v_resources.deuterium < v_total_deut_needed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient deuterium for fuel and cargo');
  END IF;

  IF v_resources.metal < COALESCE(p_cargo_metal, 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient metal for cargo');
  END IF;

  IF v_resources.crystal < COALESCE(p_cargo_crystal, 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient crystal for cargo');
  END IF;

  SELECT validate_fleet_mission INTO v_validation FROM validate_fleet_mission(
    v_user_id,
    p_origin_planet_id,
    p_target_galaxy,
    p_target_system,
    p_target_position,
    p_mission_type,
    p_target_type
  );

  IF v_validation IS NOT NULL AND NOT (v_validation->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_validation->>'reason');
  END IF;

  v_arrival_time := now() + (v_flight_time || ' seconds')::interval;
  v_return_time := now() + ((v_flight_time * 2) || ' seconds')::interval;

  INSERT INTO fleets (
    user_id,
    origin_planet_id,
    target_galaxy,
    target_system,
    target_position,
    target_type,
    mission_type,
    cargo_metal,
    cargo_crystal,
    cargo_deuterium,
    departure_time,
    arrival_time,
    return_time
  ) VALUES (
    v_user_id,
    p_origin_planet_id,
    p_target_galaxy,
    p_target_system,
    p_target_position,
    p_target_type,
    p_mission_type,
    COALESCE(p_cargo_metal, 0),
    COALESCE(p_cargo_crystal, 0),
    COALESCE(p_cargo_deuterium, 0),
    now(),
    v_arrival_time,
    v_return_time
  ) RETURNING id INTO v_fleet_id;

  FOR v_ship IN
    SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
  LOOP
    IF v_ship.quantity > 0 THEN
      INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
      VALUES (v_fleet_id, v_ship.ship_type_id, v_ship.quantity);

      UPDATE planet_ships
      SET quantity = quantity - v_ship.quantity
      WHERE planet_id = p_origin_planet_id AND ship_type_id = v_ship.ship_type_id;
    END IF;
  END LOOP;

  UPDATE planet_resources
  SET metal = metal - COALESCE(p_cargo_metal, 0),
      crystal = crystal - COALESCE(p_cargo_crystal, 0),
      deuterium = deuterium - v_total_deut_needed
  WHERE planet_id = p_origin_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'fleet_id', v_fleet_id,
    'arrival_time', v_arrival_time,
    'return_time', v_return_time,
    'flight_time', v_flight_time,
    'fuel_consumption', v_fuel_consumption
  );
END;
$function$;


-- ============================================================
-- Replace bot_ai_tick with Level 3
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
  v_bots_processed integer := 0;
  v_buildings_queued integer := 0;
  v_research_started integer := 0;
  v_ships_queued integer := 0;
  v_defenses_queued integer := 0;
  v_fleets_sent integer := 0;
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
  v_probe_count integer := 0;
  v_light_fighter_count integer := 0;
  v_target RECORD;
  v_fleet_result jsonb;
  v_origin_active_fleets integer := 0;
  v_attack_ships_to_send integer := 0;
  v_fleet_action_taken boolean := false;
  v_protection_check jsonb;
BEGIN
  v_game_speed := get_game_speed();

  SELECT id INTO v_probe_ship_type_id FROM ship_types WHERE code = 'espionage_probe';
  SELECT id INTO v_light_fighter_type_id FROM ship_types WHERE code = 'light_fighter';

  FOR v_bot IN
    SELECT id, COALESCE(points_total, 0) AS points_total
    FROM profiles
    WHERE is_bot = true
  LOOP
    v_bots_processed := v_bots_processed + 1;
    v_bot_points := COALESCE(v_bot.points_total, 0);

    FOR v_planet IN
      SELECT p.id, p.fields_used, p.fields_max, p.user_id, p.galaxy, p.solar_system, p.position
      FROM planets p
      WHERE p.user_id = v_bot.id AND p.planet_type = 'planet'
    LOOP
      PERFORM calculate_and_sync_resources_internal(v_planet.id, v_planet.user_id);

      SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
      IF NOT FOUND THEN CONTINUE; END IF;

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

      SELECT COUNT(*) INTO v_queued_count
      FROM building_queue WHERE planet_id = v_planet.id;

      IF v_queued_count = 0 THEN
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
                SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              END IF;
            END LOOP;
          END;
        END IF;
      END IF;

      IF v_lab_level >= 1 THEN
        SELECT EXISTS(
          SELECT 1 FROM user_technologies
          WHERE user_id = v_bot.id AND is_researching = true
        ) INTO v_is_researching;

        IF NOT v_is_researching THEN
          v_research_priority := ARRAY[
            'energy_tech',
            'combustion_drive',
            'espionage_tech',
            'computer_tech',
            'armour_tech',
            'weapons_tech',
            'shielding_tech',
            'impulse_drive',
            'laser_tech',
            'ion_tech',
            'hyperspace_tech',
            'plasma_tech',
            'astrophysics',
            'hyperspace_drive'
          ];

          FOR i IN 1..array_length(v_research_priority, 1) LOOP
            SELECT * INTO v_tech FROM technology_types WHERE code = v_research_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;

            SELECT COALESCE(ut.level, 0) INTO v_tech_current_level
            FROM user_technologies ut
            WHERE ut.user_id = v_bot.id AND ut.technology_type_id = v_tech.id;
            v_tech_current_level := COALESCE(v_tech_current_level, 0);

            IF v_tech_current_level >= LEAST(v_tech.max_level, 12) THEN
              CONTINUE;
            END IF;

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

            v_cost_metal := FLOOR(v_tech.base_metal * POWER(v_tech.cost_factor, v_tech_current_level));
            v_cost_crystal := FLOOR(v_tech.base_crystal * POWER(v_tech.cost_factor, v_tech_current_level));
            v_cost_deuterium := FLOOR(v_tech.base_deuterium * POWER(v_tech.cost_factor, v_tech_current_level));

            IF v_resources.metal >= v_cost_metal
               AND v_resources.crystal >= v_cost_crystal
               AND v_resources.deuterium >= v_cost_deuterium THEN
              v_research_time := GREATEST(1, FLOOR(
                (v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_lab_level)) * 3600 / v_game_speed
              ));

              UPDATE planet_resources
              SET metal = metal - v_cost_metal,
                  crystal = crystal - v_cost_crystal,
                  deuterium = deuterium - v_cost_deuterium,
                  last_update = now()
              WHERE planet_id = v_planet.id;

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
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      IF v_shipyard_level >= 1 THEN
        SELECT EXISTS(
          SELECT 1 FROM shipyard_queue WHERE planet_id = v_planet.id
        ) INTO v_shipyard_busy;

        IF NOT v_shipyard_busy THEN
          v_ship_priority := ARRAY[
            'light_fighter',
            'heavy_fighter',
            'small_cargo',
            'large_cargo',
            'cruiser',
            'espionage_probe',
            'recycler',
            'battleship',
            'bomber',
            'battlecruiser',
            'destroyer'
          ];

          FOR i IN 1..array_length(v_ship_priority, 1) LOOP
            SELECT * INTO v_ship FROM ship_types WHERE code = v_ship_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;

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

            SELECT COALESCE(ps.quantity, 0) INTO v_existing_ship_count
            FROM planet_ships ps
            WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_ship.id;
            v_existing_ship_count := COALESCE(v_existing_ship_count, 0);

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

            IF v_ship_qty <= 0 THEN CONTINUE; END IF;

            v_cost_metal := v_ship.metal_cost::bigint * v_ship_qty;
            v_cost_crystal := v_ship.crystal_cost::bigint * v_ship_qty;
            v_cost_deuterium := v_ship.deuterium_cost::bigint * v_ship_qty;

            IF v_resources.metal >= v_cost_metal
               AND v_resources.crystal >= v_cost_crystal
               AND v_resources.deuterium >= v_cost_deuterium THEN
              v_ship_build_time := GREATEST(1, FLOOR(
                (v_ship.metal_cost + v_ship.crystal_cost) / (2500.0 * (1 + v_shipyard_level)) * 3600 / POWER(2, v_nanite_level) / v_game_speed
              ));

              UPDATE planet_resources
              SET metal = metal - v_cost_metal,
                  crystal = crystal - v_cost_crystal,
                  deuterium = deuterium - v_cost_deuterium,
                  last_update = now()
              WHERE planet_id = v_planet.id;

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
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      IF v_shipyard_level >= 1 THEN
        SELECT EXISTS(
          SELECT 1 FROM shipyard_queue WHERE planet_id = v_planet.id
        ) INTO v_shipyard_busy;

        IF NOT v_shipyard_busy THEN
          v_defense_priority := ARRAY[
            'rocket_launcher',
            'light_laser',
            'heavy_laser',
            'gauss_cannon',
            'ion_cannon',
            'plasma_turret',
            'small_shield_dome',
            'large_shield_dome'
          ];

          FOR i IN 1..array_length(v_defense_priority, 1) LOOP
            SELECT * INTO v_def FROM defense_types WHERE code = v_defense_priority[i];
            IF NOT FOUND THEN CONTINUE; END IF;

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

            SELECT COALESCE(pd.quantity, 0) INTO v_existing_def_count
            FROM planet_defenses pd
            WHERE pd.planet_id = v_planet.id AND pd.defense_type_id = v_def.id;
            v_existing_def_count := COALESCE(v_existing_def_count, 0);

            v_max_per_planet := v_def.max_per_planet;

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

            IF v_max_per_planet IS NOT NULL THEN
              v_def_qty := LEAST(v_def_qty, v_max_per_planet - v_existing_def_count);
            END IF;

            IF v_def_qty <= 0 THEN CONTINUE; END IF;

            v_cost_metal := v_def.metal_cost::bigint * v_def_qty;
            v_cost_crystal := v_def.crystal_cost::bigint * v_def_qty;
            v_cost_deuterium := v_def.deuterium_cost::bigint * v_def_qty;

            IF v_resources.metal >= v_cost_metal
               AND v_resources.crystal >= v_cost_crystal
               AND v_resources.deuterium >= v_cost_deuterium THEN
              v_def_build_time := GREATEST(1, FLOOR(
                (v_def.metal_cost + v_def.crystal_cost) / (2500.0 * (1 + v_shipyard_level)) * 3600 / POWER(2, v_nanite_level) / v_game_speed
              ));

              UPDATE planet_resources
              SET metal = metal - v_cost_metal,
                  crystal = crystal - v_cost_crystal,
                  deuterium = deuterium - v_cost_deuterium,
                  last_update = now()
              WHERE planet_id = v_planet.id;

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
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      v_fleet_action_taken := false;

      SELECT COUNT(*) INTO v_origin_active_fleets
      FROM fleets
      WHERE user_id = v_bot.id
        AND origin_planet_id = v_planet.id
        AND is_completed = false;

      IF v_origin_active_fleets = 0 AND v_probe_ship_type_id IS NOT NULL THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_probe_count
        FROM planet_ships ps
        WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_probe_ship_type_id;
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
              AND COALESCE(pr.vacation_mode, false) = false
              AND tp.galaxy = v_planet.galaxy
              AND ABS(tp.solar_system - v_planet.solar_system) <= 15
              AND NOT EXISTS (
                SELECT 1
                FROM fleets f
                WHERE f.user_id = v_bot.id
                  AND f.origin_planet_id = v_planet.id
                  AND f.target_galaxy = tp.galaxy
                  AND f.target_system = tp.solar_system
                  AND f.target_position = tp.position
                  AND f.target_type = 'planet'
                  AND f.mission_type = 'espionage'
                  AND f.is_completed = false
              )
            ORDER BY ABS(tp.solar_system - v_planet.solar_system), points_total, tp.position
            LIMIT 10
          LOOP
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
              v_fleet_action_taken := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      IF NOT v_fleet_action_taken
         AND v_origin_active_fleets = 0
         AND v_light_fighter_type_id IS NOT NULL THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_light_fighter_count
        FROM planet_ships ps
        WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_light_fighter_type_id;
        v_light_fighter_count := COALESCE(v_light_fighter_count, 0);

        IF v_light_fighter_count >= 10 THEN
          v_attack_ships_to_send := LEAST(
            v_light_fighter_count - 5,
            GREATEST(5, FLOOR(v_light_fighter_count / 2.0)::int)
          );

          IF v_attack_ships_to_send >= 5 THEN
            FOR v_target IN
              SELECT tp.user_id, tp.galaxy, tp.solar_system, tp.position, COALESCE(pr.points_total, 0) AS points_total
              FROM planets tp
              JOIN profiles pr ON pr.id = tp.user_id
              WHERE tp.planet_type = 'planet'
                AND NOT tp.is_destroyed
                AND tp.user_id <> v_bot.id
                AND pr.is_bot = false
                AND COALESCE(pr.vacation_mode, false) = false
                AND tp.galaxy = v_planet.galaxy
                AND ABS(tp.solar_system - v_planet.solar_system) <= 12
                AND NOT EXISTS (
                  SELECT 1
                  FROM fleets f
                  WHERE f.user_id = v_bot.id
                    AND f.origin_planet_id = v_planet.id
                    AND f.target_galaxy = tp.galaxy
                    AND f.target_system = tp.solar_system
                    AND f.target_position = tp.position
                    AND f.target_type = 'planet'
                    AND f.mission_type = 'attack'
                    AND f.is_completed = false
                )
              ORDER BY points_total, ABS(tp.solar_system - v_planet.solar_system), tp.position
              LIMIT 12
            LOOP
              v_protection_check := check_noob_protection(v_bot.id, v_target.user_id);
              IF v_protection_check IS NULL OR NOT COALESCE((v_protection_check->>'can_attack')::boolean, false) THEN
                CONTINUE;
              END IF;

              v_fleet_result := secure_send_fleet(
                p_origin_planet_id := v_planet.id,
                p_target_galaxy := v_target.galaxy,
                p_target_system := v_target.solar_system,
                p_target_position := v_target.position,
                p_mission_type := 'attack',
                p_fleet_ships := jsonb_build_array(jsonb_build_object('ship_type_id', v_light_fighter_type_id, 'quantity', v_attack_ships_to_send)),
                p_cargo_metal := 0,
                p_cargo_crystal := 0,
                p_cargo_deuterium := 0,
                p_speed_percent := 100,
                p_target_type := 'planet',
                p_override_user_id := v_bot.id
              );

              IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                v_fleets_sent := v_fleets_sent + 1;
                EXIT;
              END IF;
            END LOOP;
          END IF;
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
    'fleets_sent', v_fleets_sent
  );
END;
$$;

COMMENT ON FUNCTION bot_ai_tick() IS 'Bot NPC AI - Level 3: builds, researches, produces ships and defenses, sends espionage probes, and launches safe nearby attacks. Runs every 5 minutes via pg_cron.';
