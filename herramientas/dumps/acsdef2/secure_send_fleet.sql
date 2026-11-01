CREATE OR REPLACE FUNCTION public.secure_send_fleet(p_origin_planet_id uuid, p_target_galaxy integer, p_target_system integer, p_target_position integer, p_mission_type text, p_fleet_ships jsonb, p_cargo_metal bigint DEFAULT 0, p_cargo_crystal bigint DEFAULT 0, p_cargo_deuterium bigint DEFAULT 0, p_speed_percent integer DEFAULT 100, p_target_type text DEFAULT 'planet'::text, p_override_user_id uuid DEFAULT NULL::uuid)
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
  v_mega_recycler_type_id int;
  v_probe_type_id int;
  v_computer_tech_level int := 0;
  v_has_admiral boolean;
  v_admiral_speed_bonus numeric := 0;
  v_max_fleet_slots int;
  v_active_fleet_count int;
  v_profile record;
  -- [PATCH TPX1] exclusion mutua Fortaleza <-> Planeta del Tesoro
  v_sh_alliance uuid;
  v_sh_owner uuid;
  v_sh_block text;
BEGIN
  PERFORM public._occ_guard(p_origin_planet_id); /* [OCUPA1-g] */
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

  -- [COLMKT5] colonia en venta: no salen flotas de ella ni van flotas propias hacia ella
  IF public._colony_listed_since(p_origin_planet_id) IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.planets c
                JOIN public.market_listings ml ON ml.planet_id = c.id AND ml.listing_type = 'colony' AND ml.status = 'active'
                WHERE c.user_id = v_user_id AND c.galaxy = p_target_galaxy
                  AND c.solar_system = p_target_system AND c.position = p_target_position) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.');
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

  IF p_mission_type NOT IN ('attack', 'transport', 'deploy', 'colonize', 'espionage', 'recycle', 'expedition', 'harvest') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid mission type');
  END IF;

  IF p_target_type NOT IN ('planet', 'moon') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid target type');
  END IF;

  IF p_mission_type = 'expedition' AND p_target_position != 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expeditions must target position 16');
  END IF;

  -- [BATTLESHIP1] 3:250:6 reservada para la Batalla de Naves
  IF public._battleship_is_location(p_target_galaxy, p_target_system, p_target_position) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coordenada reservada para la Batalla de Naves');
  END IF;

  -- [SPORTS1] 3:250:4 reservada para las Apuestas Deportivas
  IF public._sports_is_location(p_target_galaxy, p_target_system, p_target_position) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coordenada reservada para las Apuestas Deportivas');
  END IF;

  -- [CASINO1] El Casino Galactico solo admite la Nave Heroe (hero_casino_travel)
  IF public._casino_is_location(p_target_galaxy, p_target_system, p_target_position) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo la Nave Heroe puede viajar al Casino Galactico');
  END IF;

  IF p_mission_type != 'expedition' AND p_target_position = 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only expeditions can target position 16');
  END IF;

  -- [PATCH TPX1] Exclusion mutua Fortaleza (250:8) <-> Planeta del Tesoro (250:9).
  -- Atacar SI se permite; estacionar/transportar en una que no sea de tu alianza NO,
  -- porque equivale a capturarla. Incluye la regla FORT1X.
  IF p_target_system = 250 AND p_target_position IN (8, 9)
     AND p_mission_type IN ('deploy', 'transport')
  THEN
    SELECT am.alliance_id INTO v_sh_alliance
    FROM alliance_members am WHERE am.user_id = v_user_id LIMIT 1;

    IF v_sh_alliance IS NOT NULL THEN
      IF p_target_position = 8 THEN
        SELECT af.owner_alliance_id INTO v_sh_owner
        FROM alliance_fortresses af WHERE af.galaxy = p_target_galaxy;
      ELSE
        SELECT tp.owner_alliance_id INTO v_sh_owner
        FROM treasure_planets tp WHERE tp.galaxy = p_target_galaxy;
      END IF;

      IF FOUND AND v_sh_owner IS DISTINCT FROM v_sh_alliance THEN
        v_sh_block := public.alliance_stronghold_block(
          v_sh_alliance,
          CASE WHEN p_target_position = 8 THEN 'fortress' ELSE 'treasure' END,
          p_target_galaxy);
        IF v_sh_block IS NOT NULL THEN
          RETURN jsonb_build_object('success', false, 'error',
            v_sh_block || ' Puedes atacar, pero no estacionar ni transportar aqui.');
        END IF;
      END IF;
    END IF;
  END IF;

  -- [PATCH 20260424] refrescar recursos antes de validar cargo
  PERFORM sync_planet_resources(p_origin_planet_id);
  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_origin_planet_id FOR UPDATE;
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
  SELECT id INTO v_mega_recycler_type_id FROM ship_types WHERE code = 'mega_recycler';
  SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';

  -- [SONDAS SOLO ESPIAN] Las Sondas de Espionaje SOLO sirven para la mision Espionaje.
  -- No se permiten en ataques ni expediciones (ni solas ni mezcladas con otras naves).
  IF p_mission_type IN ('attack', 'expedition') AND v_probe_type_id IS NOT NULL THEN
    PERFORM 1 FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    WHERE x.quantity > 0 AND x.ship_type_id = v_probe_type_id;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error',
        CASE WHEN p_mission_type = 'attack'
             THEN 'No puedes atacar con Sondas de Espionaje. Las sondas solo sirven para espiar.'
             ELSE 'No puedes enviar expediciones con Sondas de Espionaje. Las sondas solo sirven para espiar.' END);
    END IF;
  END IF;

  -- [DEPLOY: SOLO NAVES A OTROS] Solo puedes desplegar RECURSOS a tus propias colonias.
  -- Al deposito de alianza / fortaleza solo se despliegan NAVES (nunca recursos a otro jugador).
  IF p_mission_type = 'deploy'
     AND (COALESCE(p_cargo_metal,0) + COALESCE(p_cargo_crystal,0) + COALESCE(p_cargo_deuterium,0)) > 0
     AND NOT EXISTS (
       SELECT 1 FROM planets p
       WHERE p.galaxy = p_target_galaxy AND p.solar_system = p_target_system
         AND p.position = p_target_position AND p.planet_type = p_target_type
         AND p.user_id = v_user_id AND NOT p.is_destroyed
     ) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Solo puedes desplegar recursos a tus propias colonias. Al deposito de alianza solo puedes desplegar naves (sin recursos).');
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
    WHERE x.ship_type_id IN (v_recycler_type_id, v_mega_recycler_type_id) AND x.quantity >= 1;

    IF NOT COALESCE(v_has_required_ship, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Recycling requires a Recycler or Mega Recycler');
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

  -- [HARVEST] Recoleccion de materia oscura: solo en luna propia y requiere Recolector de Materia Oscura
  IF p_mission_type = 'harvest' THEN
    IF p_target_type != 'moon' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Los Recolectores de Materia Oscura solo pueden recolectar en lunas');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM planets p
      WHERE p.galaxy = p_target_galaxy AND p.solar_system = p_target_system
        AND p.position = p_target_position AND p.planet_type = 'moon'
        AND p.user_id = v_user_id AND NOT p.is_destroyed
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Solo puedes recolectar materia oscura en tus propias lunas');
    END IF;

    SELECT true INTO v_has_required_ship
    FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    JOIN ship_types st ON st.id = x.ship_type_id
    WHERE st.code = 'dark_matter_collector' AND x.quantity >= 1;

    IF NOT COALESCE(v_has_required_ship, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'La recoleccion requiere al menos un Recolector de Materia Oscura');
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
  -- Apply daily mission speed bonus (stackable with admiral and Plus)
  v_flight_time := GREATEST(10, FLOOR(v_flight_time / (1.0 + COALESCE(get_user_daily_mission_speed_bonus(v_user_id), 0))));

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

  -- Anti-bashing server-side: maximo 3 ataques por objetivo cada 24h (agrupado por alianza).
  -- Se valida aqui para que NO se pueda saltar el limite atacando directo por RPC.
  IF p_mission_type = 'attack' THEN
    DECLARE
      v_bash_defender uuid;
      v_bash jsonb;
    BEGIN
      SELECT user_id INTO v_bash_defender
      FROM planets
      WHERE galaxy = p_target_galaxy
        AND solar_system = p_target_system
        AND position = p_target_position
        AND planet_type = COALESCE(p_target_type, 'planet')
        AND NOT is_destroyed
      LIMIT 1;

      IF v_bash_defender IS NOT NULL AND COALESCE(p_target_type, 'planet') = 'planet' AND EXISTS (
           SELECT 1 FROM occupations o JOIN planets op ON op.id = o.planet_id
           WHERE o.status = 'active' AND op.galaxy = p_target_galaxy AND op.solar_system = p_target_system
             AND op.position = p_target_position AND op.planet_type = 'planet'
             AND o.occupier_id <> v_user_id) THEN /* [OCCNOOB1] */
        v_bash_defender := NULL; /* [OCCALLY1] rescate de planeta ocupado */
      END IF;
      IF v_bash_defender IS NOT NULL AND v_bash_defender <> v_user_id
         AND NOT (p_target_system = 250 AND ((p_target_position = 8 AND EXISTS (SELECT 1 FROM alliance_fortresses af WHERE af.galaxy = p_target_galaxy)) OR (p_target_position = 9 AND EXISTS (SELECT 1 FROM treasure_planets tp WHERE tp.galaxy = p_target_galaxy)))) THEN -- [NOOBSTRONG1]
        v_bash := check_bashing_limit(v_user_id, v_bash_defender);
        IF NOT COALESCE((v_bash->>'allowed')::boolean, true) THEN
          RETURN jsonb_build_object('success', false, 'error', COALESCE(v_bash->>'reason', 'Limite de ataques alcanzado'));
        END IF;
      END IF;
    END;
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
 $function$

