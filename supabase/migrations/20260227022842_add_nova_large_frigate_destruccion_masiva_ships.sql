/*
  # Add 3 New Ships: Nova, Fragata Grande, Destruccion Masiva

  1. New Ships
    - `nova` (special category) - Capital war ship with incredibly strong shields
      - Structure: 10,100,000 | Shield: 70,000 | Attack: 150,000
      - Cargo: 15,000,000 | Speed: 900 | Fuel: 250
      - Cost: 6M metal, 5M crystal, 2M deuterium
      - Requires escort: 10 cruisers + 5 battlecruisers to send on missions

    - `large_frigate` (civil category) - Largest frigate with massive cargo capacity
      - Structure: 95,000 | Shield: 120 | Attack: 50
      - Cargo: 400,000,000 | Speed: 6,000 | Fuel: 90
      - Cost: 80K metal, 80K crystal, 30K deuterium

    - `destruccion_masiva` (special category) - Ultimate capital destruction ship
      - Structure: 525,000,000 | Shield: 2,000,000 | Attack: 35,000,000
      - Cargo: 50,000,000 | Speed: 10 | Fuel: 10,000
      - Cost: 350M metal, 280M crystal, 120M deuterium
      - Requires escort: 10 cruisers + 5 battlecruisers to send on missions

  2. Requirements
    - Nova: Shipyard 14, Hyperspace Drive 12, Hyperspace Tech 10, Graviton Tech 2,
            Shielding Tech 12, Weapons Tech 10, Armor Tech 10
    - Large Frigate: Shipyard 6, Combustion Drive 8, Armor Tech 4
    - Destruccion Masiva: Shipyard 15, Hyperspace Drive 15, Hyperspace Tech 12,
            Graviton Tech 3, Plasma Tech 12, Weapons Tech 14, Armor Tech 14, Laser Tech 14

  3. Security
    - No RLS changes needed (uses existing ship_types table)
    - Escort validation added to secure_send_fleet function
*/

-- Fix sequence to avoid ID collision
SELECT setval('ship_types_id_seq', (SELECT MAX(id) FROM ship_types));

-- =============================================
-- INSERT NOVA
-- =============================================
INSERT INTO ship_types (code, name, description, category, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, structural_integrity, shield_power, weapon_power, cargo_capacity, base_speed, fuel_consumption, rapid_fire, image_url)
VALUES (
  'nova',
  'Nova',
  'Nave capital de guerra con escudos increiblemente fuertes. Es extremadamente dura de derribar. Requiere escolta de al menos 10 cruceros y 5 acorazados para enviarla a cualquier mision.',
  'special',
  6000000, 5000000, 2000000,
  90000,
  10100000, 70000, 150000,
  15000000, 900, 250,
  '{
    "small_cargo": 250,
    "large_cargo": 250,
    "light_fighter": 200,
    "heavy_fighter": 100,
    "cruiser": 33,
    "battlecruiser": 30,
    "colony_ship": 250,
    "recycler": 250,
    "espionage_probe": 1250,
    "bomber": 25,
    "solar_satellite": 1250,
    "destroyer": 5,
    "battleship": 15,
    "deathstar": 35,
    "rocket_launcher": 400,
    "light_laser": 200,
    "heavy_laser": 100,
    "gauss_cannon": 50,
    "ion_cannon": 100
  }'::jsonb,
  NULL
)
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- INSERT LARGE FRIGATE
-- =============================================
INSERT INTO ship_types (code, name, description, category, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, structural_integrity, shield_power, weapon_power, cargo_capacity, base_speed, fuel_consumption, rapid_fire, image_url)
VALUES (
  'large_frigate',
  'Fragata Grande',
  'La fragata mas grande de todas. Posee un gran sistema de produccion y su tamano es realmente grande. El 90% de su estructura esta ocupada por enormes almacenes para contener recursos. Nave necesaria para los imperios mineros extremadamente grandes.',
  'civil',
  80000, 80000, 30000,
  30000,
  95000, 120, 50,
  400000000, 6000, 90,
  '{"espionage_probe": 5, "solar_satellite": 5}'::jsonb,
  NULL
)
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- INSERT DESTRUCCION MASIVA
-- =============================================
INSERT INTO ship_types (code, name, description, category, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, structural_integrity, shield_power, weapon_power, cargo_capacity, base_speed, fuel_consumption, rapid_fire, image_url)
VALUES (
  'destruccion_masiva',
  'Destruccion Masiva',
  'Nave capital de destruccion masiva. Un ataque de esta nave significa la victoria. Solo los imperios mas poderosos del universo poseen la tecnologia de punta para crearla. Requiere escolta de al menos 10 cruceros y 5 acorazados para enviarla a cualquier mision.',
  'special',
  350000000, 280000000, 120000000,
  500000,
  525000000, 2000000, 35000000,
  50000000, 10, 10000,
  '{
    "small_cargo": 250,
    "large_cargo": 250,
    "light_fighter": 200,
    "heavy_fighter": 100,
    "cruiser": 33,
    "battlecruiser": 30,
    "colony_ship": 250,
    "recycler": 250,
    "espionage_probe": 1250,
    "bomber": 25,
    "solar_satellite": 1250,
    "destroyer": 5,
    "battleship": 15,
    "deathstar": 55,
    "rocket_launcher": 400,
    "light_laser": 200,
    "heavy_laser": 100,
    "gauss_cannon": 50,
    "ion_cannon": 100
  }'::jsonb,
  NULL
)
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- INSERT REQUIREMENTS
-- =============================================
DO $$
DECLARE
  v_nova_id int;
  v_large_frigate_id int;
  v_destruccion_masiva_id int;
  v_shipyard_id int;
  v_hyperspace_drive_id int;
  v_hyperspace_tech_id int;
  v_graviton_tech_id int;
  v_shielding_tech_id int;
  v_weapons_tech_id int;
  v_armour_tech_id int;
  v_combustion_drive_id int;
  v_plasma_tech_id int;
  v_laser_tech_id int;
BEGIN
  SELECT id INTO v_nova_id FROM ship_types WHERE code = 'nova';
  SELECT id INTO v_large_frigate_id FROM ship_types WHERE code = 'large_frigate';
  SELECT id INTO v_destruccion_masiva_id FROM ship_types WHERE code = 'destruccion_masiva';

  SELECT id INTO v_shipyard_id FROM building_types WHERE code = 'shipyard';
  SELECT id INTO v_hyperspace_drive_id FROM technology_types WHERE code = 'hyperspace_drive';
  SELECT id INTO v_hyperspace_tech_id FROM technology_types WHERE code = 'hyperspace_tech';
  SELECT id INTO v_graviton_tech_id FROM technology_types WHERE code = 'graviton_tech';
  SELECT id INTO v_shielding_tech_id FROM technology_types WHERE code = 'shielding_tech';
  SELECT id INTO v_weapons_tech_id FROM technology_types WHERE code = 'weapons_tech';
  SELECT id INTO v_armour_tech_id FROM technology_types WHERE code = 'armour_tech';
  SELECT id INTO v_combustion_drive_id FROM technology_types WHERE code = 'combustion_drive';
  SELECT id INTO v_plasma_tech_id FROM technology_types WHERE code = 'plasma_tech';
  SELECT id INTO v_laser_tech_id FROM technology_types WHERE code = 'laser_tech';

  -- Nova requirements: Shipyard 14, Hyperspace Drive 12, Hyperspace Tech 10, Graviton 2, Shielding 12, Weapons 10, Armor 10
  IF NOT EXISTS (SELECT 1 FROM ship_requirements WHERE ship_type_id = v_nova_id) THEN
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
    VALUES (v_nova_id, v_shipyard_id, 14);

    INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
    VALUES
      (v_nova_id, v_hyperspace_drive_id, 12),
      (v_nova_id, v_hyperspace_tech_id, 10),
      (v_nova_id, v_graviton_tech_id, 2),
      (v_nova_id, v_shielding_tech_id, 12),
      (v_nova_id, v_weapons_tech_id, 10),
      (v_nova_id, v_armour_tech_id, 10);
  END IF;

  -- Large Frigate requirements: Shipyard 6, Combustion Drive 8, Armor Tech 4
  IF NOT EXISTS (SELECT 1 FROM ship_requirements WHERE ship_type_id = v_large_frigate_id) THEN
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
    VALUES (v_large_frigate_id, v_shipyard_id, 6);

    INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
    VALUES
      (v_large_frigate_id, v_combustion_drive_id, 8),
      (v_large_frigate_id, v_armour_tech_id, 4);
  END IF;

  -- Destruccion Masiva requirements: Shipyard 15, Hyperspace Drive 15, Hyperspace Tech 12, Graviton 3, Plasma 12, Weapons 14, Armor 14, Laser 14
  IF NOT EXISTS (SELECT 1 FROM ship_requirements WHERE ship_type_id = v_destruccion_masiva_id) THEN
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
    VALUES (v_destruccion_masiva_id, v_shipyard_id, 15);

    INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
    VALUES
      (v_destruccion_masiva_id, v_hyperspace_drive_id, 15),
      (v_destruccion_masiva_id, v_hyperspace_tech_id, 12),
      (v_destruccion_masiva_id, v_graviton_tech_id, 3),
      (v_destruccion_masiva_id, v_plasma_tech_id, 12),
      (v_destruccion_masiva_id, v_weapons_tech_id, 14),
      (v_destruccion_masiva_id, v_armour_tech_id, 14),
      (v_destruccion_masiva_id, v_laser_tech_id, 14);
  END IF;
END $$;

-- =============================================
-- UPDATE secure_send_fleet TO ADD ESCORT VALIDATION
-- Nova and Destruccion Masiva require:
--   At least 10 cruisers (code: 'cruiser')
--   At least 5 battlecruisers (code: 'battlecruiser')
-- =============================================
CREATE OR REPLACE FUNCTION secure_send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy int,
  p_target_system int,
  p_target_position int,
  p_mission_type text,
  p_fleet_ships jsonb,
  p_speed_percent int DEFAULT 100,
  p_cargo_metal bigint DEFAULT 0,
  p_cargo_crystal bigint DEFAULT 0,
  p_cargo_deuterium bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
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
  v_max_fleet_slots int;
  v_active_fleet_count int;
  v_profile record;
  v_needs_escort boolean := false;
  v_cruiser_count int := 0;
  v_battlecruiser_count int := 0;
  v_cruiser_type_id int;
  v_battlecruiser_type_id int;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_mission_type = 'attack' AND is_attack_cooldown_active() THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Ataques temporalmente deshabilitados hasta ' ||
      to_char(get_attack_cooldown_end() AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC');
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
    (SELECT level FROM user_technologies ut
     JOIN technology_types tt ON ut.technology_type_id = tt.id
     WHERE ut.user_id = v_user_id AND tt.code = 'computer_tech'), 0
  ) INTO v_computer_tech_level;

  v_has_admiral := has_active_officer(v_user_id, 'admiral');
  v_max_fleet_slots := 1 + v_computer_tech_level + (CASE WHEN v_has_admiral THEN 2 ELSE 0 END);

  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE user_id = v_user_id AND is_completed = false;

  IF v_active_fleet_count >= v_max_fleet_slots THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available fleet slots');
  END IF;

  SELECT id INTO v_colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
  SELECT id INTO v_recycler_type_id FROM ship_types WHERE code = 'recycler';
  SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';
  SELECT id INTO v_cruiser_type_id FROM ship_types WHERE code = 'cruiser';
  SELECT id INTO v_battlecruiser_type_id FROM ship_types WHERE code = 'battlecruiser';

  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
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

      IF v_ship_type.code IN ('nova', 'destruccion_masiva') THEN
        v_needs_escort := true;
      END IF;

      IF v_ship.ship_type_id = v_cruiser_type_id THEN
        v_cruiser_count := v_ship.quantity;
      END IF;
      IF v_ship.ship_type_id = v_battlecruiser_type_id THEN
        v_battlecruiser_count := v_ship.quantity;
      END IF;
    END IF;
  END LOOP;

  IF v_needs_escort THEN
    IF v_cruiser_count < 10 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Nova/Destruccion Masiva requiere al menos 10 Cruceros de escolta');
    END IF;
    IF v_battlecruiser_count < 5 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Nova/Destruccion Masiva requiere al menos 5 Acorazados de escolta');
    END IF;
  END IF;

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
    v_planet.galaxy, v_planet.solar_system, v_planet.position,
    p_target_galaxy, p_target_system, p_target_position
  );

  v_slowest_speed := fleet_calc_slowest_speed(p_fleet_ships, v_user_id);
  IF v_slowest_speed <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No valid ships with speed selected');
  END IF;

  v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent);
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
    p_mission_type
  );

  IF v_validation IS NOT NULL AND NOT (v_validation->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_validation->>'reason');
  END IF;

  v_arrival_time := now() + (v_flight_time || ' seconds')::interval;
  v_return_time := now() + (v_flight_time * 2 || ' seconds')::interval;

  INSERT INTO fleets (
    user_id,
    origin_planet_id,
    target_galaxy,
    target_system,
    target_position,
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
    p_mission_type,
    COALESCE(p_cargo_metal, 0),
    COALESCE(p_cargo_crystal, 0),
    COALESCE(p_cargo_deuterium, 0),
    now(),
    v_arrival_time,
    v_return_time
  ) RETURNING id INTO v_fleet_id;

  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
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
  SET
    metal = metal - COALESCE(p_cargo_metal, 0),
    crystal = crystal - COALESCE(p_cargo_crystal, 0),
    deuterium = deuterium - v_total_deut_needed
  WHERE planet_id = p_origin_planet_id;

  IF p_mission_type = 'attack' THEN
    BEGIN
      PERFORM notify_alliance_attack_launched(
        v_user_id,
        p_target_galaxy,
        p_target_system,
        p_target_position,
        v_arrival_time
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Alliance attack notification error: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'fleet_id', v_fleet_id,
    'arrival_time', v_arrival_time,
    'return_time', v_return_time,
    'flight_time', v_flight_time,
    'fuel_consumption', v_fuel_consumption,
    'expedition_fee', 0
  );
END;
$$;
