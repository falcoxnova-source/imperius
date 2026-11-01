/*
  # Fix Alliance Deploy: Cron Re-processing, Fleet Limits, and Arrival Notifications

  This migration addresses three issues with the alliance deploy (station) system
  without changing any table names, column names, or existing business logic.

  ## Fix 1: Cron Skip Re-processing Stationed Fleets (MODERADO)
    - `process_all_pending_fleets` was picking up stationed deploy fleets every cron cycle
      because they match `is_completed = false AND NOT is_returning AND arrival_time <= NOW()`
    - The deploy handler would re-run each time, depositing 0 cargo and wasting CPU/locks
    - Fix: Add `AND NOT (mission_type = 'deploy' AND cargo_metal = 0 AND cargo_crystal = 0 AND cargo_deuterium = 0)`
      to exclude already-stationed fleets (cargo already deposited = 0 means already processed)
    - Also update the cron existence check in `optimized_global_queue_processor` with the same filter

  ## Fix 2: Limit Stationed Fleets Per Alliance Depot Level (MODERADO)
    - Previously no limit on how many fleets could be stationed on an ally planet
    - Now validates in `validate_fleet_mission`: max stationed fleets = depot_level
    - Simple formula: depot level 1 = 1 fleet, level 2 = 2 fleets, etc (up to max_level 10)
    - Only counts non-completed, non-returning deploy fleets from OTHER users at target coords

  ## Fix 3: Arrival Notifications for Stationed Fleets (MENOR)
    - Fleet owner gets a system message confirming their fleet arrived and is stationed
    - Planet owner gets a system message informing them an allied fleet arrived for defense
    - Uses existing `messages` table with `message_type = 'system'`
    - Added inside the deploy handler of `process_fleet_arrival` (ally planet branch only)

  ## Security
    - No RLS changes
    - No new tables
    - No column changes
*/


-- ============================================
-- FIX 1: Update process_all_pending_fleets to skip already-stationed deploy fleets
-- ============================================
CREATE OR REPLACE FUNCTION process_all_pending_fleets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet record;
  v_processed_count integer := 0;
  v_error_count integer := 0;
BEGIN
  FOR v_fleet IN 
    SELECT id, user_id, mission_type
    FROM fleets 
    WHERE is_completed = false
    AND NOT is_returning
    AND arrival_time <= NOW()
    AND NOT (
      mission_type = 'deploy'
      AND cargo_metal = 0
      AND cargo_crystal = 0
      AND cargo_deuterium = 0
    )
    ORDER BY arrival_time ASC
    LIMIT 100
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing fleet %: %', v_fleet.id, SQLERRM;
    END;
  END LOOP;
  
  FOR v_fleet IN 
    SELECT id, user_id, mission_type
    FROM fleets 
    WHERE is_completed = false
    AND is_returning
    AND return_time <= NOW()
    ORDER BY return_time ASC
    LIMIT 100
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing returning fleet %: %', v_fleet.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'error_count', v_error_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_all_pending_fleets() TO authenticated;


-- ============================================
-- FIX 1b: Update optimized_global_queue_processor fleet existence check
--          to also skip stationed deploy fleets
-- ============================================
DO $$
DECLARE
  v_func_body text;
BEGIN
  SELECT prosrc INTO v_func_body
  FROM pg_proc
  WHERE proname = 'optimized_global_queue_processor';

  IF v_func_body IS NOT NULL AND v_func_body LIKE '%NOT is_returning AND arrival_time IS NOT NULL AND arrival_time <= v_now%' THEN
    v_func_body := replace(
      v_func_body,
      '(NOT is_returning AND arrival_time IS NOT NULL AND arrival_time <= v_now)',
      '(NOT is_returning AND arrival_time IS NOT NULL AND arrival_time <= v_now AND NOT (mission_type = ''deploy'' AND cargo_metal = 0 AND cargo_crystal = 0 AND cargo_deuterium = 0))'
    );

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION optimized_global_queue_processor() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
      v_func_body
    );
  END IF;
END $$;


-- ============================================
-- FIX 2: Add stationed fleet limit per depot level in validate_fleet_mission
-- FIX 3: Add arrival notifications in process_fleet_arrival deploy handler
-- ============================================

-- FIX 2: Update validate_fleet_mission with fleet limit check
CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text
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

  SELECT p.*, pr.id as owner_id, pr.vacation_mode as target_vacation_mode 
  INTO v_target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet'
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
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
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

      -- FIX 2: Check stationed fleet limit based on depot level
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


-- ============================================
-- FIX 3: Update process_fleet_arrival deploy handler to send notifications
-- Re-declare full function (same logic, only adding INSERTs in ally deploy branch)
-- ============================================
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  fleet_record RECORD;
  target_planet RECORD;
  ship_record RECORD;
  total_cargo_capacity INTEGER;
  loot_metal NUMERIC;
  loot_crystal NUMERIC;
  loot_deuterium NUMERIC;
  combat_result jsonb;
  v_unit jsonb;
  v_debris_metal NUMERIC := 0;
  v_debris_crystal NUMERIC := 0;
  v_dark_matter_found INTEGER := 0;
  v_expedition_message TEXT;
  v_attacker_units_report TEXT;
  v_defender_units_report TEXT;
  v_all_acs_fleets_arrived BOOLEAN;
  v_expedition_result jsonb;
  v_colonization_success BOOLEAN := false;
  v_attacker_name TEXT;
  v_origin_coords TEXT;
  v_moon_result jsonb;
  v_moon_text TEXT := '';
  v_planet_metal NUMERIC;
  v_planet_crystal NUMERIC;
  v_planet_deuterium NUMERIC;
  v_unit_source TEXT;
  v_allied_fleet_id uuid;
  v_fleet_owner_name TEXT;
  v_planet_owner_name TEXT;
  v_ship_summary TEXT;
BEGIN
  SELECT * INTO fleet_record
  FROM fleets
  WHERE id = p_fleet_id
  AND is_completed = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN
    RETURN;
  END IF;

  IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN
    RETURN;
  END IF;

  IF fleet_record.is_acs AND fleet_record.acs_id IS NOT NULL AND NOT fleet_record.is_returning THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM fleets f
      WHERE f.acs_id = fleet_record.acs_id
      AND f.arrival_time > NOW()
      AND NOT f.is_returning
      AND NOT f.is_completed
    ) INTO v_all_acs_fleets_arrived;

    IF v_all_acs_fleets_arrived THEN
      PERFORM process_acs_fleet_arrival(fleet_record.acs_id);
    END IF;
    RETURN;
  END IF;

  IF fleet_record.is_returning THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.id = fleet_record.origin_planet_id;

    IF FOUND THEN
      FOR ship_record IN SELECT fs.ship_type_id, fs.quantity FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id LOOP
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (target_planet.id, ship_record.ship_type_id, ship_record.quantity)
        ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
      END LOOP;

      UPDATE planet_resources
      SET metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
      WHERE planet_id = target_planet.id;
    END IF;

    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    RETURN;
  END IF;

  CASE fleet_record.mission_type
  WHEN 'attack' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position
    AND p.planet_type = 'planet';

    IF FOUND AND target_planet.user_id IS NOT NULL THEN
      combat_result := perform_combat(p_fleet_id, target_planet.id);

      IF (combat_result->>'winner') = 'attacker' THEN
        SELECT COALESCE(pr.metal, 0), COALESCE(pr.crystal, 0), COALESCE(pr.deuterium, 0)
        INTO v_planet_metal, v_planet_crystal, v_planet_deuterium
        FROM planet_resources pr
        WHERE pr.planet_id = target_planet.id;

        SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0) INTO total_cargo_capacity
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id;

        loot_metal := LEAST(v_planet_metal * 0.5, total_cargo_capacity / 3);
        loot_crystal := LEAST(v_planet_crystal * 0.5, total_cargo_capacity / 3);
        loot_deuterium := LEAST(v_planet_deuterium * 0.5, total_cargo_capacity / 3);

        IF (loot_metal + loot_crystal + loot_deuterium) < total_cargo_capacity THEN
          DECLARE
            v_remaining_capacity NUMERIC;
            v_extra_metal NUMERIC;
            v_extra_crystal NUMERIC;
          BEGIN
            v_remaining_capacity := total_cargo_capacity - (loot_metal + loot_crystal + loot_deuterium);
            v_extra_metal := LEAST(v_planet_metal * 0.5 - loot_metal, v_remaining_capacity / 2);
            IF v_extra_metal > 0 THEN
              loot_metal := loot_metal + v_extra_metal;
              v_remaining_capacity := v_remaining_capacity - v_extra_metal;
            END IF;
            v_extra_crystal := LEAST(v_planet_crystal * 0.5 - loot_crystal, v_remaining_capacity);
            IF v_extra_crystal > 0 THEN
              loot_crystal := loot_crystal + v_extra_crystal;
            END IF;
          END;
        END IF;

        UPDATE planet_resources
        SET metal = GREATEST(0, metal - loot_metal),
            crystal = GREATEST(0, crystal - loot_crystal),
            deuterium = GREATEST(0, deuterium - loot_deuterium)
        WHERE planet_id = target_planet.id;

        UPDATE fleets
        SET cargo_metal = cargo_metal + loot_metal,
            cargo_crystal = cargo_crystal + loot_crystal,
            cargo_deuterium = cargo_deuterium + loot_deuterium,
            is_returning = true
        WHERE id = p_fleet_id;
      ELSIF (combat_result->>'winner') = 'defender' THEN
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

      v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);
      v_debris_crystal := COALESCE((combat_result->>'debris_crystal')::numeric, 0);
      IF v_debris_metal > 0 OR v_debris_crystal > 0 THEN
        INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal)
        VALUES (fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_debris_metal, v_debris_crystal)
        ON CONFLICT (galaxy, solar_system, position) DO UPDATE
        SET metal = debris_fields.metal + EXCLUDED.metal,
            crystal = debris_fields.crystal + EXCLUDED.crystal,
            updated_at = NOW();
      END IF;

      v_moon_result := check_moon_creation(
        fleet_record.target_galaxy,
        fleet_record.target_system,
        fleet_record.target_position,
        v_debris_metal,
        v_debris_crystal
      );
      IF v_moon_result IS NOT NULL AND (v_moon_result->>'moon_created')::boolean THEN
        v_moon_text := format(E'\n\nSe ha creado una Luna en [%s:%s:%s] con probabilidad del %s%%.',
          fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
          (v_moon_result->>'probability')::numeric);
      END IF;

      v_attacker_units_report := COALESCE(combat_result->>'attacker_report', '');
      v_defender_units_report := COALESCE(combat_result->>'defender_report', '');

      SELECT COALESCE(username, 'Desconocido') INTO v_attacker_name
      FROM profiles WHERE id = fleet_record.user_id;

      SELECT format('[%s:%s:%s]', p2.galaxy, p2.solar_system, p2.position) INTO v_origin_coords
      FROM planets p2 WHERE p2.id = fleet_record.origin_planet_id;

      IF (combat_result->>'winner') = 'attacker' THEN
        v_defender_units_report := COALESCE(combat_result->>'defender_report', '');
        FOR v_unit IN SELECT * FROM jsonb_array_elements(COALESCE(combat_result->'defender_remaining', '[]'::jsonb)) LOOP
          v_unit_source := COALESCE(v_unit->>'source', 'planet');
          IF v_unit_source != 'planet' AND v_unit_source != 'defense' THEN
            BEGIN
              v_allied_fleet_id := v_unit_source::uuid;
              UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer
              WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer;

              IF NOT EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND quantity > 0) THEN
                DELETE FROM fleet_ships WHERE fleet_id = v_allied_fleet_id;
                UPDATE fleets SET is_completed = true WHERE id = v_allied_fleet_id;
              END IF;
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END;
          END IF;
        END LOOP;
      ELSIF (combat_result->>'winner') = 'defender' THEN
        FOR v_unit IN SELECT * FROM jsonb_array_elements(COALESCE(combat_result->'defender_remaining', '[]'::jsonb)) LOOP
          v_unit_source := COALESCE(v_unit->>'source', 'planet');
          IF v_unit_source != 'planet' AND v_unit_source != 'defense' THEN
            BEGIN
              v_allied_fleet_id := v_unit_source::uuid;
              UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer
              WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer;

              IF NOT EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND quantity > 0) THEN
                DELETE FROM fleet_ships WHERE fleet_id = v_allied_fleet_id;
                UPDATE fleets SET is_completed = true WHERE id = v_allied_fleet_id;
              END IF;
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END;
          END IF;
        END LOOP;
      ELSE
        FOR v_unit IN SELECT * FROM jsonb_array_elements(COALESCE(combat_result->'defender_remaining', '[]'::jsonb)) LOOP
          v_unit_source := COALESCE(v_unit->>'source', 'planet');
          IF v_unit_source != 'planet' AND v_unit_source != 'defense' THEN
            BEGIN
              v_allied_fleet_id := v_unit_source::uuid;
              UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer
              WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer;

              IF NOT EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND quantity > 0) THEN
                DELETE FROM fleet_ships WHERE fleet_id = v_allied_fleet_id;
                UPDATE fleets SET is_completed = true WHERE id = v_allied_fleet_id;
              END IF;
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END;
          END IF;
        END LOOP;
      END IF;

      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      VALUES (NULL, fleet_record.user_id, 'Reporte de Batalla',
        format(E'Tu flota desde %s ataco [%s:%s:%s].\n\nResultado: %s\n\nEscombros generados: %s Metal, %s Cristal\nSaqueo: %s Metal, %s Cristal, %s Deuterio\n\n--- Unidades Atacante ---\n%s\n\n--- Unidades Defensor ---\n%s%s',
          COALESCE(v_origin_coords, 'Desconocido'),
          fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
          UPPER(COALESCE(combat_result->>'winner', 'draw')),
          COALESCE(floor(v_debris_metal), 0), COALESCE(floor(v_debris_crystal), 0),
          COALESCE(floor(loot_metal), 0), COALESCE(floor(loot_crystal), 0), COALESCE(floor(loot_deuterium), 0),
          COALESCE(v_attacker_units_report, 'Sin datos'),
          COALESCE(v_defender_units_report, 'Sin datos'),
          v_moon_text
        ),
        'battle');

      IF target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (NULL, target_planet.user_id, 'Reporte de Batalla',
          format(E'Tu planeta [%s:%s:%s] fue atacado por %s desde %s.\n\nResultado: %s\n\nEscombros generados: %s Metal, %s Cristal\nRecursos perdidos: %s Metal, %s Cristal, %s Deuterio\n\n--- Unidades Atacante ---\n%s\n\n--- Unidades Defensor ---\n%s%s',
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            COALESCE(v_attacker_name, 'Desconocido'), COALESCE(v_origin_coords, 'Desconocido'),
            UPPER(COALESCE(combat_result->>'winner', 'draw')),
            COALESCE(floor(v_debris_metal), 0), COALESCE(floor(v_debris_crystal), 0),
            COALESCE(floor(loot_metal), 0), COALESCE(floor(loot_crystal), 0), COALESCE(floor(loot_deuterium), 0),
            COALESCE(v_attacker_units_report, 'Sin datos'),
            COALESCE(v_defender_units_report, 'Sin datos'),
            v_moon_text
          ),
          'battle');
      END IF;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;

  WHEN 'transport' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position;

    IF FOUND THEN
      UPDATE planet_resources
      SET metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
      WHERE planet_id = target_planet.id;

      UPDATE fleets
      SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0, is_returning = true
      WHERE id = p_fleet_id;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;

  WHEN 'deploy' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position
    AND p.user_id = fleet_record.user_id;

    IF FOUND THEN
      FOR ship_record IN SELECT fs.ship_type_id, fs.quantity FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id LOOP
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (target_planet.id, ship_record.ship_type_id, ship_record.quantity)
        ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
      END LOOP;

      UPDATE planet_resources
      SET metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
      WHERE planet_id = target_planet.id;

      DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
      UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    ELSE
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position
      AND p.user_id IS NOT NULL
      AND p.user_id != fleet_record.user_id;

      IF FOUND THEN
        UPDATE planet_resources
        SET metal = metal + fleet_record.cargo_metal,
            crystal = crystal + fleet_record.cargo_crystal,
            deuterium = deuterium + fleet_record.cargo_deuterium
        WHERE planet_id = target_planet.id;

        UPDATE fleets
        SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0
        WHERE id = p_fleet_id;

        -- FIX 3: Send arrival notifications
        BEGIN
          SELECT string_agg(st.name || ' x' || fs.quantity, ', ')
          INTO v_ship_summary
          FROM fleet_ships fs
          JOIN ship_types st ON fs.ship_type_id = st.id
          WHERE fs.fleet_id = p_fleet_id AND fs.quantity > 0;

          SELECT COALESCE(username, 'Desconocido') INTO v_fleet_owner_name
          FROM profiles WHERE id = fleet_record.user_id;

          SELECT COALESCE(username, 'Desconocido') INTO v_planet_owner_name
          FROM profiles WHERE id = target_planet.user_id;

          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
          VALUES (NULL, fleet_record.user_id, 'Flota Estacionada',
            format('Tu flota ha llegado al planeta de %s en [%s:%s:%s] y permanece estacionada para defensa. Naves: %s',
              v_planet_owner_name,
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
              COALESCE(v_ship_summary, 'Sin naves')),
            'system');

          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
          VALUES (NULL, target_planet.user_id, 'Flota Aliada Estacionada',
            format('La flota de %s ha llegado a tu planeta [%s:%s:%s] y permanece estacionada para defensa. Naves: %s',
              v_fleet_owner_name,
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
              COALESCE(v_ship_summary, 'Sin naves')),
            'system');
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;
    END IF;

  WHEN 'espionage' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position
    AND p.planet_type = 'planet';

    IF FOUND AND target_planet.user_id IS NOT NULL THEN
      PERFORM generate_espionage_report(fleet_record.user_id, target_planet.id, target_planet.user_id);
    END IF;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  WHEN 'recycle' THEN
    DECLARE
      debris RECORD;
      recycler_capacity INTEGER;
      collected_metal NUMERIC;
      collected_crystal NUMERIC;
    BEGIN
      SELECT * INTO debris
      FROM debris_fields
      WHERE galaxy = fleet_record.target_galaxy
      AND solar_system = fleet_record.target_system
      AND position = fleet_record.target_position;

      IF FOUND AND (debris.metal > 0 OR debris.crystal > 0) THEN
        SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0) INTO recycler_capacity
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id AND st.code = 'recycler';

        collected_metal := LEAST(debris.metal, recycler_capacity / 2);
        collected_crystal := LEAST(debris.crystal, recycler_capacity / 2);

        UPDATE debris_fields
        SET metal = metal - collected_metal, crystal = crystal - collected_crystal, updated_at = NOW()
        WHERE id = debris.id;

        DELETE FROM debris_fields WHERE id = debris.id AND metal <= 0 AND crystal <= 0;

        UPDATE fleets
        SET cargo_metal = cargo_metal + collected_metal,
            cargo_crystal = cargo_crystal + collected_crystal,
            is_returning = true
        WHERE id = p_fleet_id;

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (NULL, fleet_record.user_id, 'Reporte de Reciclaje',
          format('Tus recicladores han recogido %s Metal y %s Cristal de los escombros en [%s:%s:%s].',
            floor(collected_metal), floor(collected_crystal),
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
          'system');
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (NULL, fleet_record.user_id, 'Reporte de Reciclaje',
          format('No se encontraron escombros en [%s:%s:%s]. La flota regresa a casa.',
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
          'system');
      END IF;
    END;

  WHEN 'colonize' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position
    AND p.planet_type = 'planet';

    IF NOT FOUND THEN
      DECLARE
        v_new_planet_id uuid;
        v_max_colonies integer;
        v_current_colonies integer;
        v_astrophysics_level integer;
      BEGIN
        SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
        FROM user_technologies ut
        JOIN technology_types tt ON ut.technology_type_id = tt.id
        WHERE ut.user_id = fleet_record.user_id AND tt.code = 'astrophysics';

        v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

        SELECT COUNT(*) INTO v_current_colonies
        FROM planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed;

        IF v_current_colonies >= v_max_colonies THEN
          UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
          VALUES (NULL, fleet_record.user_id, 'Colonizacion Fallida',
            format('No se pudo colonizar [%s:%s:%s]. Has alcanzado el limite de colonias (%s).',
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_max_colonies),
            'system');
        ELSE
          INSERT INTO planets (user_id, name, galaxy, solar_system, position, planet_type, is_main_planet, diameter, fields_max, temp_min, temp_max, image_id)
          VALUES (fleet_record.user_id, 'Colonia', fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            'planet', false, 12800 + floor(random() * 5000)::integer, 163 + floor(random() * 50)::integer,
            -20 + floor(random() * 40)::integer, 20 + floor(random() * 60)::integer, floor(random() * 10 + 1)::integer)
          RETURNING id INTO v_new_planet_id;

          INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, metal_per_hour, crystal_per_hour, deuterium_per_hour)
          VALUES (v_new_planet_id, 500 + fleet_record.cargo_metal, 500 + fleet_record.cargo_crystal, 0 + fleet_record.cargo_deuterium, 30, 15, 0);

          DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id AND ship_type_id = (SELECT id FROM ship_types WHERE code = 'colony_ship' LIMIT 1);

          IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN
            FOR ship_record IN SELECT fs.ship_type_id, fs.quantity FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id AND fs.quantity > 0 LOOP
              INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
              VALUES (v_new_planet_id, ship_record.ship_type_id, ship_record.quantity)
              ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
            END LOOP;
          END IF;

          DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
          UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
          v_colonization_success := true;

          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
          VALUES (NULL, fleet_record.user_id, 'Colonizacion Exitosa',
            format('Se ha colonizado exitosamente el planeta en [%s:%s:%s]. Tamano: %s campos.',
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_planet_size),
            'system');
        END IF;
      END;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      VALUES (NULL, fleet_record.user_id, 'Colonizacion Fallida',
        format('No se pudo colonizar [%s:%s:%s]. La posicion ya esta ocupada.',
          fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
        'system');
    END IF;

  WHEN 'expedition' THEN
    v_expedition_result := process_expedition(p_fleet_id);
    v_expedition_message := COALESCE(v_expedition_result->>'message', 'La expedicion no encontro nada interesante.');

    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (NULL, fleet_record.user_id, 'Reporte de Expedicion', v_expedition_message, 'expedition');

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  WHEN 'destroy' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position;

    IF FOUND AND target_planet.user_id IS NOT NULL THEN
      combat_result := perform_combat(p_fleet_id, target_planet.id);

      IF (combat_result->>'winner') = 'attacker' THEN
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      ELSIF (combat_result->>'winner') = 'defender' THEN
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

      v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);
      v_debris_crystal := COALESCE((combat_result->>'debris_crystal')::numeric, 0);
      IF v_debris_metal > 0 OR v_debris_crystal > 0 THEN
        INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal)
        VALUES (fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_debris_metal, v_debris_crystal)
        ON CONFLICT (galaxy, solar_system, position) DO UPDATE
        SET metal = debris_fields.metal + EXCLUDED.metal,
            crystal = debris_fields.crystal + EXCLUDED.crystal,
            updated_at = NOW();
      END IF;

      SELECT COALESCE(username, 'Desconocido') INTO v_attacker_name
      FROM profiles WHERE id = fleet_record.user_id;
      SELECT format('[%s:%s:%s]', p2.galaxy, p2.solar_system, p2.position) INTO v_origin_coords
      FROM planets p2 WHERE p2.id = fleet_record.origin_planet_id;

      v_attacker_units_report := COALESCE(combat_result->>'attacker_report', '');
      v_defender_units_report := COALESCE(combat_result->>'defender_report', '');

      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      VALUES (NULL, fleet_record.user_id, 'Reporte de Batalla (Destruir)',
        format(E'Tu flota desde %s ataco [%s:%s:%s] con mision destruir.\n\nResultado: %s\n\nEscombros: %s Metal, %s Cristal\n\n--- Atacante ---\n%s\n\n--- Defensor ---\n%s',
          COALESCE(v_origin_coords, '?'), fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
          UPPER(COALESCE(combat_result->>'winner', 'draw')),
          COALESCE(floor(v_debris_metal), 0), COALESCE(floor(v_debris_crystal), 0),
          COALESCE(v_attacker_units_report, 'Sin datos'), COALESCE(v_defender_units_report, 'Sin datos')),
        'battle');

      IF target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (NULL, target_planet.user_id, 'Reporte de Batalla (Destruir)',
          format(E'Tu planeta [%s:%s:%s] fue atacado por %s con mision destruir.\n\nResultado: %s\n\nEscombros: %s Metal, %s Cristal\n\n--- Atacante ---\n%s\n\n--- Defensor ---\n%s',
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            COALESCE(v_attacker_name, '?'),
            UPPER(COALESCE(combat_result->>'winner', 'draw')),
            COALESCE(floor(v_debris_metal), 0), COALESCE(floor(v_debris_crystal), 0),
            COALESCE(v_attacker_units_report, 'Sin datos'), COALESCE(v_defender_units_report, 'Sin datos')),
          'battle');
      END IF;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;

  ELSE
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$fn$;
