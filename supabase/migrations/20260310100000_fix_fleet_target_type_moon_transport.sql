/*
  # Fix Fleet Target Type - Allow Transport to Moons

  BUG: validate_fleet_mission only looks for planet_type = 'planet' when
       finding the target planet. This means transport/deploy to a moon
       is impossible since the moon shares the same coordinates as the
       planet but has planet_type = 'moon'.

  FIX:
  1. Add p_target_type parameter (DEFAULT 'planet') to validate_fleet_mission
  2. Add p_target_type parameter (DEFAULT 'planet') to secure_send_fleet
  3. Fix process_fleet_arrival transport to use fleet_record.target_type
  
  The column `target_type` already exists in the `fleets` table.
  All existing calls continue working via the DEFAULT 'planet' value.
*/

-- ============================================================
-- FIX 1: validate_fleet_mission with target_type parameter
-- ============================================================
-- Drop ALL possible overloads to avoid ambiguity
DO $$ BEGIN
  DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, uuid, integer, integer, integer, text);
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, uuid, int, int, int, text);
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, uuid, integer, integer, integer, text, text);
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text,
  p_target_type text DEFAULT 'planet'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_planet record;
  v_protection_check jsonb;
  v_bashing_check jsonb;
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
  v_attacker_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
  v_expedition_result jsonb;
  v_user_alliance_id uuid;
  v_target_alliance_id uuid;
  v_depot_level integer;
  v_stationed_count integer;
  v_max_stationed integer;
BEGIN
  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;
  
  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  -- Use p_target_type to find the correct planet or moon
  SELECT p.*, pr.id as owner_id, pr.vacation_mode as target_vacation_mode 
  INTO v_target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = p_target_type
    AND NOT p.is_destroyed;

  IF v_target_planet IS NOT NULL 
     AND v_target_planet.target_vacation_mode = true 
     AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes atacar a jugadores en modo vacaciones'
    );
  END IF;

  -- ===========================================
  -- COLONIZE MISSION
  -- ===========================================
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'La posicion ya esta ocupada');
    END IF;

    SELECT COUNT(*) INTO v_current_colonies
    FROM planets WHERE user_id = p_user_id AND NOT is_destroyed;

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

    v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

    IF v_current_colonies >= v_max_colonies THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica.', v_max_colonies)
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================
  -- EXPEDITION MISSION
  -- ===========================================
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    
    v_expedition_result := charge_expedition_fee(p_user_id);
    
    IF NOT (v_expedition_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', v_expedition_result->>'error',
        'expedition_fee_required', (v_expedition_result->>'required_fee')::numeric,
        'current_fxu', (v_expedition_result->>'current_balance')::numeric
      );
    END IF;
    
    RETURN jsonb_build_object(
      'valid', true,
      'expedition_charged', (v_expedition_result->>'charged')::boolean,
      'expedition_fee', (v_expedition_result->>'fee')::numeric,
      'expedition_number', (v_expedition_result->>'expedition_number')::integer
    );
  END IF;

  -- ===========================================
  -- ATTACK / ESPIONAGE / DESTROY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('attack', 'espionage', 'destroy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tus propios planetas');
    END IF;

    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'can_attack')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;
  END IF;

  -- ===========================================
  -- TRANSPORT / DEPLOY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('transport', 'deploy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta ni luna en esas coordenadas');
    END IF;

    IF p_mission_type = 'transport' THEN
      -- Transport to own planets/moons: always allowed
      IF v_target_planet.user_id = p_user_id THEN
        RETURN jsonb_build_object('valid', true);
      END IF;

      -- Transport to other players: alliance restriction
      SELECT alliance_id INTO v_user_alliance_id FROM alliance_members WHERE user_id = p_user_id;
      SELECT alliance_id INTO v_target_alliance_id FROM alliance_members WHERE user_id = v_target_planet.user_id;

      IF v_user_alliance_id IS NULL THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'Debes pertenecer a una alianza para transportar recursos a otros jugadores'
        );
      END IF;

      IF v_target_alliance_id IS NULL THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'El jugador destino debe pertenecer a una alianza para recibir transportes'
        );
      END IF;

      IF v_user_alliance_id != v_target_alliance_id THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'Solo puedes transportar recursos a miembros de tu misma alianza'
        );
      END IF;

      RETURN jsonb_build_object('valid', true);
    END IF;

    IF p_mission_type = 'deploy' AND v_target_planet.user_id != p_user_id THEN
      SELECT alliance_id INTO v_user_alliance_id FROM alliance_members WHERE user_id = p_user_id;
      SELECT alliance_id INTO v_target_alliance_id FROM alliance_members WHERE user_id = v_target_planet.user_id;

      IF v_user_alliance_id IS NULL OR v_target_alliance_id IS NULL OR v_user_alliance_id != v_target_alliance_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes estacionar en planetas de tu alianza');
      END IF;

      SELECT COALESCE(pb.level, 0) INTO v_depot_level
      FROM planet_buildings pb
      JOIN building_types bt ON pb.building_type_id = bt.id
      WHERE pb.planet_id = v_target_planet.id AND bt.code = 'alliance_depot';

      IF COALESCE(v_depot_level, 0) < 1 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'El planeta aliado necesita Deposito de Alianza nivel 1 o superior');
      END IF;

      v_max_stationed := COALESCE(v_depot_level, 0);

      SELECT COUNT(*) INTO v_stationed_count
      FROM fleets f
      WHERE f.target_galaxy = p_target_galaxy
        AND f.target_system = p_target_system
        AND f.target_position = p_target_position
        AND f.mission_type = 'deploy'
        AND f.is_completed = false
        AND f.is_returning = false
        AND f.user_id != v_target_planet.user_id;

      IF v_stationed_count >= v_max_stationed THEN
        RETURN jsonb_build_object(
          'valid', false,
          'reason', format('El Deposito de Alianza nivel %s solo permite %s flota(s) estacionada(s). Actualmente hay %s.', v_depot_level, v_max_stationed, v_stationed_count)
        );
      END IF;
    END IF;
  END IF;

  -- ===========================================
  -- RECYCLE MISSION
  -- ===========================================
  IF p_mission_type = 'recycle' THEN
    IF NOT EXISTS (
      SELECT 1 FROM debris_fields
      WHERE galaxy = p_target_galaxy
        AND solar_system = p_target_system
        AND position = p_target_position
        AND (metal > 0 OR crystal > 0)
    ) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay campo de escombros en esas coordenadas');
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;


-- ============================================================
-- FIX 2: secure_send_fleet with target_type parameter
-- ============================================================
-- Drop ALL possible overloads to avoid ambiguity
DO $$ BEGIN
  DROP FUNCTION IF EXISTS secure_send_fleet(uuid, int, int, int, text, jsonb, bigint, bigint, bigint, int);
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  DROP FUNCTION IF EXISTS secure_send_fleet(uuid, int, int, int, text, jsonb, int, bigint, bigint, bigint);
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  DROP FUNCTION IF EXISTS secure_send_fleet(uuid, integer, integer, integer, text, jsonb, bigint, bigint, bigint, integer);
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  DROP FUNCTION IF EXISTS secure_send_fleet(uuid, integer, integer, integer, text, jsonb, integer, bigint, bigint, bigint);
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  DROP FUNCTION IF EXISTS secure_send_fleet(uuid, int, int, int, text, jsonb, bigint, bigint, bigint, int, text);
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION secure_send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy int,
  p_target_system int,
  p_target_position int,
  p_mission_type text,
  p_fleet_ships jsonb,
  p_cargo_metal bigint DEFAULT 0,
  p_cargo_crystal bigint DEFAULT 0,
  p_cargo_deuterium bigint DEFAULT 0,
  p_speed_percent int DEFAULT 100,
  p_target_type text DEFAULT 'planet'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_expedition_fee bigint := 0;
  v_active_expeditions int;
  v_profile record;
BEGIN
  v_user_id := auth.uid();
  
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
  
  -- Pass p_target_type to validate_fleet_mission
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
  
  IF p_mission_type = 'expedition' THEN
    SELECT COUNT(*) INTO v_active_expeditions
    FROM fleets
    WHERE user_id = v_user_id 
      AND mission_type = 'expedition' 
      AND is_completed = false;
    
    IF v_active_expeditions > 0 THEN
      SELECT COALESCE(value::bigint, 0) INTO v_expedition_fee
      FROM game_settings WHERE key = 'expedition_extra_fee';
      
      v_expedition_fee := v_expedition_fee * v_active_expeditions;
      
      IF v_profile.fxu_balance < v_expedition_fee THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU for expedition fee: ' || v_expedition_fee);
      END IF;
      
      UPDATE profiles 
      SET fxu_balance = fxu_balance - v_expedition_fee 
      WHERE id = v_user_id;
    END IF;
  END IF;
  
  v_arrival_time := now() + (v_flight_time || ' seconds')::interval;
  v_return_time := now() + (v_flight_time * 2 || ' seconds')::interval;
  
  -- Include target_type in the INSERT
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
  
  RETURN jsonb_build_object(
    'success', true,
    'fleet_id', v_fleet_id,
    'arrival_time', v_arrival_time,
    'return_time', v_return_time,
    'flight_time', v_flight_time,
    'fuel_consumption', v_fuel_consumption,
    'expedition_fee', v_expedition_fee
  );
END;
$$;

GRANT EXECUTE ON FUNCTION secure_send_fleet TO authenticated;


-- ============================================================
-- FIX 3: Fix process_fleet_arrival transport to use target_type
-- ============================================================
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival'
  AND pronargs = 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'process_fleet_arrival not found, skipping';
    RETURN;
  END IF;

  -- Replace the transport branch query to use fleet_record.target_type
  v_src := replace(v_src,
    'WHEN ''transport'' THEN
SELECT p.* INTO target_planet
FROM planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position;',
    'WHEN ''transport'' THEN
SELECT p.* INTO target_planet
FROM planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position
AND p.planet_type = COALESCE(fleet_record.target_type, ''planet'');');

  -- Also fix deploy branch (same problem: doesn't filter by planet_type)
  v_src := replace(v_src,
    'WHEN ''deploy'' THEN
SELECT p.* INTO target_planet
FROM planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position
AND p.user_id = fleet_record.user_id;',
    'WHEN ''deploy'' THEN
SELECT p.* INTO target_planet
FROM planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position
AND p.user_id = fleet_record.user_id
AND p.planet_type = COALESCE(fleet_record.target_type, ''planet'');');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'fix_fleet_target_type: transport now uses fleet_record.target_type to find correct planet/moon';
END $$;
