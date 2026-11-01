/*
  # FIX: Bug de Procesamiento Doble de Flotas al Acelerar (Duplicación de Naves)
  
  ## DESCRIPCIÓN DEL BUG
  ============================================================================
  Cuando un jugador paga FXU para acelerar la llegada de una flota (especialmente
  flotas en retorno), las naves se duplicaban. El jugador obtenía el doble de 
  las naves que estaban volando.
  
  ## CAUSA RAÍZ DEL BUG
  ============================================================================
  El bug es una CONDICIÓN DE CARRERA (race condition) causada por:
  
  1. La función `accelerate_fleet` cambia el tiempo de llegada/retorno a 
     `now() - interval '1 second'` pero NO procesa la flota directamente.
  
  2. Después de acelerar, el frontend llama a `fetchFleets()` y también hay
     un `setInterval` cada 5 segundos que llama a `checkFleetArrivals()`.
  
  3. `checkFleetArrivals()` llama a `process_user_pending_fleets()` que busca
     flotas con tiempo expirado y llama a `process_fleet_arrival()` para cada una.
  
  4. Si hay múltiples llamadas concurrentes (refresh de página, cron job, 
     múltiples tabs), la función `process_fleet_arrival()` se ejecuta 
     MÚLTIPLES VECES para la misma flota ANTES de que se marque como 
     `is_completed = true`.
  
  5. Cada ejecución concurrente añade las naves al planeta, resultando en
     duplicación (o triplicación, etc.) de naves.
  
  ## FLUJO DEL BUG (ANTES DE LA CORRECCIÓN)
  ============================================================================
  Tiempo T0: Usuario acelera flota de retorno con 100 naves
             → accelerate_fleet() cambia return_time a T0 - 1 segundo
             → Retorna success, NO procesa la flota
  
  Tiempo T0+50ms: Frontend llama fetchFleets() (solo lee, no procesa)
                  Frontend tiene setInterval que llamará checkFleetArrivals()
  
  Tiempo T0+100ms: Llamada A: checkFleetArrivals() → process_user_pending_fleets()
                   → Encuentra flota con return_time <= NOW() AND is_completed = false
                   → Llama process_fleet_arrival(fleet_id)
                   → INICIA procesamiento, aún no marca is_completed = true
  
  Tiempo T0+150ms: Llamada B: (otra tab, refresh, o cron) 
                   → process_user_pending_fleets()
                   → También encuentra la MISMA flota (is_completed aún = false)
                   → Llama process_fleet_arrival(fleet_id) OTRA VEZ
  
  Tiempo T0+200ms: Llamada A completa:
                   → Agrega 100 naves al planeta
                   → Marca is_completed = true
  
  Tiempo T0+250ms: Llamada B completa:
                   → Agrega 100 naves al planeta (DUPLICACIÓN!)
                   → Intenta marcar is_completed = true (ya estaba true)
  
  RESULTADO: El jugador tiene 200 naves en lugar de 100.
  
  ## SOLUCIÓN IMPLEMENTADA
  ============================================================================
  Se agregan DOS capas de protección:
  
  1. BLOQUEO DE FILA (FOR UPDATE SKIP LOCKED):
     Al inicio de process_fleet_arrival(), se bloquea la fila de la flota
     de forma exclusiva. Si otra transacción intenta procesar la misma flota,
     será saltada (SKIP LOCKED) o esperará.
  
  2. PROCESAMIENTO DIRECTO EN accelerate_fleet():
     Después de cambiar el tiempo, la función accelerate_fleet() ahora
     llama DIRECTAMENTE a process_fleet_arrival() en la misma transacción,
     evitando que otras llamadas concurrentes procesen la flota.
  
  ## ARCHIVOS AFECTADOS
  ============================================================================
  - supabase/migrations/..._293_fix_fleet_acceleration_double_processing_bug.sql (este archivo)
  - src/pages/game/FleetPage.tsx (comentarios agregados)
  - src/store/gameStore.ts (comentarios agregados)
*/

-- ============================================================================
-- PASO 1: CORREGIR process_fleet_arrival() CON BLOQUEO DE FILA
-- ============================================================================
-- BUG FIX: Agregar SELECT ... FOR UPDATE para bloquear la fila y evitar 
-- procesamiento concurrente de la misma flota.

CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- ==========================================================================
  -- BUG FIX: BLOQUEO DE FILA PARA EVITAR PROCESAMIENTO CONCURRENTE
  -- ==========================================================================
  -- Usamos SELECT ... FOR UPDATE para obtener un bloqueo exclusivo en la fila.
  -- Si otra transacción ya está procesando esta flota, esta llamada esperará
  -- o fallará, evitando la duplicación de naves.
  --
  -- IMPORTANTE: Si la flota ya está marcada como is_completed = true,
  -- simplemente retornamos sin hacer nada.
  -- ==========================================================================
  SELECT * INTO fleet_record 
  FROM fleets 
  WHERE id = p_fleet_id 
    AND is_completed = false  -- BUG FIX: Solo procesar si NO está completada
  FOR UPDATE;  -- BUG FIX: Bloqueo exclusivo de la fila
  
  -- Si no encontramos la flota (ya fue procesada por otra transacción), salimos
  IF NOT FOUND THEN 
    RETURN; 
  END IF;

  -- Verificar tiempos (mismo código que antes)
  IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN 
    RETURN; 
  END IF;
  
  IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN 
    RETURN; 
  END IF;

  -- Manejo de flotas ACS (sin cambios)
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

  -- ==========================================================================
  -- PROCESAMIENTO DE FLOTA EN RETORNO
  -- ==========================================================================
  -- BUG ANTERIOR: Esta sección se ejecutaba múltiples veces si había llamadas
  -- concurrentes, porque no había bloqueo de fila. Cada ejecución agregaba
  -- las naves al planeta, causando duplicación.
  --
  -- BUG FIX: Ahora con FOR UPDATE arriba, solo una transacción puede ejecutar
  -- esta sección para una flota específica.
  -- ==========================================================================
  IF fleet_record.is_returning THEN
    -- Agregar naves al planeta de origen
    FOR ship_record IN 
      SELECT fs.ship_type_id, fs.quantity 
      FROM fleet_ships fs 
      WHERE fs.fleet_id = p_fleet_id
    LOOP
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity) 
      VALUES (fleet_record.origin_planet_id, ship_record.ship_type_id, ship_record.quantity)
      ON CONFLICT (planet_id, ship_type_id) 
      DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
    END LOOP;

    -- Agregar recursos del cargo
    UPDATE planet_resources 
    SET metal = metal + fleet_record.cargo_metal, 
        crystal = crystal + fleet_record.cargo_crystal, 
        deuterium = deuterium + fleet_record.cargo_deuterium 
    WHERE planet_id = fleet_record.origin_planet_id;

    -- Limpiar la flota
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    
    -- BUG FIX: Marcar como completada INMEDIATAMENTE para evitar reprocesamiento
    UPDATE fleets 
    SET is_completed = true, 
        acs_id = NULL, 
        is_acs = false 
    WHERE id = p_fleet_id;
    
    RETURN;
  END IF;

  -- ==========================================================================
  -- RESTO DEL CÓDIGO (MISIONES DE IDA) - SIN CAMBIOS SIGNIFICATIVOS
  -- ==========================================================================
  CASE fleet_record.mission_type

  WHEN 'attack' THEN
    SELECT p.* INTO target_planet 
    FROM planets p 
    WHERE p.galaxy = fleet_record.target_galaxy 
      AND p.solar_system = fleet_record.target_system 
      AND p.position = fleet_record.target_position;

    IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
      combat_result := perform_combat(p_fleet_id, target_planet.id);

      v_attacker_units_report := format_unit_report(combat_result->'initial_attacker', combat_result->'attacker_remaining', 'attacker');
      v_defender_units_report := format_unit_report(combat_result->'initial_defender', combat_result->'defender_remaining', 'defender');

      IF (combat_result->>'result') = 'attacker_won' THEN
        SELECT COALESCE(SUM((unit->>'quantity')::integer * (SELECT cargo_capacity FROM ship_types WHERE id = (unit->>'type_id')::integer)), 0) 
        INTO total_cargo_capacity
        FROM jsonb_array_elements(combat_result->'attacker_remaining') AS unit 
        WHERE (unit->>'quantity')::integer > 0;

        SELECT LEAST(metal * 0.5, total_cargo_capacity / 3), 
               LEAST(crystal * 0.5, total_cargo_capacity / 3), 
               LEAST(deuterium * 0.5, total_cargo_capacity / 3) 
        INTO loot_metal, loot_crystal, loot_deuterium 
        FROM planet_resources WHERE planet_id = target_planet.id;

        UPDATE planet_resources 
        SET metal = GREATEST(0, metal - loot_metal), 
            crystal = GREATEST(0, crystal - loot_crystal), 
            deuterium = GREATEST(0, deuterium - loot_deuterium) 
        WHERE planet_id = target_planet.id;

        UPDATE fleets 
        SET cargo_metal = cargo_metal + loot_metal, 
            cargo_crystal = cargo_crystal + loot_crystal, 
            cargo_deuterium = cargo_deuterium + loot_deuterium 
        WHERE id = p_fleet_id;

        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining') LOOP
          IF (v_unit->>'quantity')::integer > 0 THEN 
            INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) 
            VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer); 
          END IF;
        END LOOP;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          IF NOT (v_unit->>'is_defense')::boolean THEN 
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer 
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; 
          END IF;
        END LOOP;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
          DECLARE 
            v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer; 
            v_rebuilt_qty INTEGER := 0; 
            v_i INTEGER;
          BEGIN 
            FOR v_i IN 1..v_destroyed_qty LOOP 
              IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF; 
            END LOOP;
            UPDATE planet_defenses 
            SET quantity = GREATEST(0, quantity - v_destroyed_qty + v_rebuilt_qty) 
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
          END;
        END LOOP;

        UPDATE profiles 
        SET battles_won = battles_won + 1, 
            units_destroyed = units_destroyed + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0) 
        WHERE id = fleet_record.user_id;
        UPDATE profiles 
        SET battles_lost = battles_lost + 1, 
            units_lost = units_lost + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0) 
        WHERE id = target_planet.user_id;

      ELSIF (combat_result->>'result') = 'defender_won' THEN
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          IF (v_unit->>'is_defense')::boolean THEN 
            UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer 
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
          ELSE 
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer 
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; 
          END IF;
        END LOOP;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
          DECLARE 
            v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer; 
            v_rebuilt_qty INTEGER := 0; 
            v_i INTEGER;
          BEGIN 
            FOR v_i IN 1..v_destroyed_qty LOOP 
              IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF; 
            END LOOP;
            UPDATE planet_defenses SET quantity = quantity + v_rebuilt_qty 
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
          END;
        END LOOP;

        UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = fleet_record.user_id;
        UPDATE profiles SET battles_won = battles_won + 1 WHERE id = target_planet.user_id;
        loot_metal := 0; loot_crystal := 0; loot_deuterium := 0;

      ELSE
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining') LOOP
          IF (v_unit->>'quantity')::integer > 0 THEN 
            INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) 
            VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer); 
          END IF;
        END LOOP;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          IF (v_unit->>'is_defense')::boolean THEN 
            UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer 
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
          ELSE 
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer 
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; 
          END IF;
        END LOOP;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
          DECLARE 
            v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer; 
            v_rebuilt_qty INTEGER := 0; 
            v_i INTEGER;
          BEGIN 
            FOR v_i IN 1..v_destroyed_qty LOOP 
              IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF; 
            END LOOP;
            UPDATE planet_defenses SET quantity = quantity + v_rebuilt_qty 
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
          END;
        END LOOP;

        UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = fleet_record.user_id;
        UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = target_planet.user_id;
        loot_metal := 0; loot_crystal := 0; loot_deuterium := 0;
      END IF;

      v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);
      v_debris_crystal := COALESCE((combat_result->>'debris_crystal')::numeric, 0);

      IF v_debris_metal > 0 OR v_debris_crystal > 0 THEN
        INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal) 
        VALUES (fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_debris_metal, v_debris_crystal)
        ON CONFLICT (galaxy, solar_system, position) 
        DO UPDATE SET metal = debris_fields.metal + EXCLUDED.metal, crystal = debris_fields.crystal + EXCLUDED.crystal, updated_at = NOW();

        UPDATE profiles 
        SET debris_metal_total = debris_metal_total + v_debris_metal, 
            debris_crystal_total = debris_crystal_total + v_debris_crystal 
        WHERE id = fleet_record.user_id;
      END IF;

      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) 
      VALUES (NULL, fleet_record.user_id,
        format('Reporte de Combate - %s', CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'Victoria' WHEN 'defender_won' THEN 'Derrota' ELSE 'Empate' END),
        format(E'Combate en %s [%s:%s:%s]\n\nResultado: %s\nRondas: %s\n\n=== TUS FUERZAS ===\n%s\n\n=== FUERZAS ENEMIGAS ===\n%s\n\nBotin: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nPerdidas del atacante: %s Metal, %s Cristal\nPerdidas del defensor: %s Metal, %s Cristal',
          target_planet.name, fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
          CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'VICTORIA' WHEN 'defender_won' THEN 'DERROTA' ELSE 'EMPATE' END,
          (combat_result->>'rounds'), v_attacker_units_report, v_defender_units_report,
          floor(COALESCE(loot_metal, 0)), floor(COALESCE(loot_crystal, 0)), floor(COALESCE(loot_deuterium, 0)),
          floor(v_debris_metal), floor(v_debris_crystal),
          floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0)),
          floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0))), 
        'battle');

      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) 
      VALUES (NULL, target_planet.user_id,
        format('Tu planeta %s fue atacado - %s', target_planet.name, CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'Derrota' WHEN 'defender_won' THEN 'Victoria' ELSE 'Empate' END),
        format(E'Tu planeta %s en [%s:%s:%s] fue atacado.\n\nResultado: %s\nRondas: %s\n\n=== TUS FUERZAS ===\n%s\n\n=== FUERZAS ATACANTES ===\n%s\n\nRecursos saqueados: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nTus perdidas: %s Metal, %s Cristal\nPerdidas del atacante: %s Metal, %s Cristal\n\nLas defensas destruidas tienen 70%% de probabilidad de ser reconstruidas automaticamente.',
          target_planet.name, fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
          CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'DERROTA' WHEN 'defender_won' THEN 'VICTORIA' ELSE 'EMPATE' END,
          (combat_result->>'rounds'), v_defender_units_report, v_attacker_units_report,
          floor(COALESCE(loot_metal, 0)), floor(COALESCE(loot_crystal, 0)), floor(COALESCE(loot_deuterium, 0)),
          floor(v_debris_metal), floor(v_debris_crystal),
          floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0)),
          floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0))), 
        'battle');

      IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN 
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      ELSE 
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id; 
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
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id; 
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
        VALUES (NULL, fleet_record.user_id, 'Reciclaje Fallido',
          format('No se encontraron escombros en [%s:%s:%s].', 
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position), 
          'system');
      END IF;
    END;

  WHEN 'colonize' THEN
    SELECT p.* INTO target_planet 
    FROM planets p 
    WHERE p.galaxy = fleet_record.target_galaxy 
      AND p.solar_system = fleet_record.target_system 
      AND p.position = fleet_record.target_position;

    IF NOT FOUND THEN
      DECLARE 
        colony_ship_type_id INTEGER; 
        has_colony_ship BOOLEAN; 
        new_planet_id uuid;
        v_colony_ship_quantity INTEGER;
        v_cargo_metal NUMERIC;
        v_cargo_crystal NUMERIC;
        v_cargo_deuterium NUMERIC;
      BEGIN
        SELECT id INTO colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';

        SELECT quantity INTO v_colony_ship_quantity 
        FROM fleet_ships 
        WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;

        has_colony_ship := COALESCE(v_colony_ship_quantity, 0) > 0;

        IF has_colony_ship THEN
          v_cargo_metal := COALESCE(fleet_record.cargo_metal, 0);
          v_cargo_crystal := COALESCE(fleet_record.cargo_crystal, 0);
          v_cargo_deuterium := COALESCE(fleet_record.cargo_deuterium, 0);

          INSERT INTO planets (user_id, name, galaxy, solar_system, position, planet_type, is_main_planet, diameter, fields_max, temp_min, temp_max, image_id)
          VALUES (fleet_record.user_id, 'Colonia', fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, 
            'planet', false, 12800 + floor(random() * 5000)::integer, 163 + floor(random() * 50)::integer, 
            -20 + floor(random() * 40)::integer, 20 + floor(random() * 60)::integer, floor(random() * 10 + 1)::integer)
          RETURNING id INTO new_planet_id;

          INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, metal_per_hour, crystal_per_hour, deuterium_per_hour) 
          VALUES (new_planet_id, 500 + v_cargo_metal, 500 + v_cargo_crystal, v_cargo_deuterium, 30, 15, 0);

          IF v_colony_ship_quantity = 1 THEN
            DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
          ELSE
            UPDATE fleet_ships SET quantity = quantity - 1 WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
          END IF;

          UPDATE fleets SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0 WHERE id = p_fleet_id;

          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) 
          VALUES (NULL, fleet_record.user_id, 'Colonia Establecida',
            format('Se ha establecido una nueva colonia en [%s:%s:%s]. Recursos depositados: %s Metal, %s Cristal, %s Deuterio', 
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
              floor(500 + v_cargo_metal), floor(500 + v_cargo_crystal), floor(v_cargo_deuterium)), 
            'system');
        END IF;
      END;
    END IF;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  WHEN 'expedition' THEN
    DECLARE 
      v_metal_found NUMERIC; 
      v_crystal_found NUMERIC; 
      v_deuterium_found NUMERIC; 
      v_event_roll NUMERIC; 
      v_ship_find_type_id INTEGER; 
      v_ship_find_quantity INTEGER;
    BEGIN
      v_event_roll := random();
      v_metal_found := floor(random() * 15000 + 5000)::integer;
      v_crystal_found := floor(random() * 8000 + 2000)::integer;
      v_deuterium_found := floor(random() * 4000 + 1000)::integer;

      v_expedition_message := format('Tu flota ha regresado de la expedicion con %s Metal, %s Cristal y %s Deuterio.', 
        v_metal_found, v_crystal_found, v_deuterium_found);

      IF v_event_roll < 0.25 THEN
        v_dark_matter_found := floor(random() * 500 + 100)::integer;
        v_expedition_message := v_expedition_message || format(' Ademas, encontraron %s Materia Oscura!', v_dark_matter_found);
        UPDATE profiles SET dark_matter = dark_matter + v_dark_matter_found WHERE id = fleet_record.user_id;
      ELSIF v_event_roll < 0.35 THEN
        SELECT id INTO v_ship_find_type_id FROM ship_types WHERE code IN ('light_fighter', 'heavy_fighter', 'cruiser') ORDER BY random() LIMIT 1;
        IF v_ship_find_type_id IS NOT NULL THEN
          v_ship_find_quantity := floor(random() * 10 + 1)::integer;
          INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (p_fleet_id, v_ship_find_type_id, v_ship_find_quantity)
          ON CONFLICT (fleet_id, ship_type_id) DO UPDATE SET quantity = fleet_ships.quantity + EXCLUDED.quantity;
          v_expedition_message := v_expedition_message || format(' Encontraron %s naves abandonadas y las incorporaron a la flota!', v_ship_find_quantity);
        END IF;
      ELSIF v_event_roll < 0.40 THEN
        v_metal_found := v_metal_found * 3; 
        v_crystal_found := v_crystal_found * 3; 
        v_deuterium_found := v_deuterium_found * 2;
        v_expedition_message := format('Gran descubrimiento! Tu flota encontro un deposito rico en recursos: %s Metal, %s Cristal y %s Deuterio!', 
          v_metal_found, v_crystal_found, v_deuterium_found);
      END IF;

      UPDATE fleets 
      SET cargo_metal = cargo_metal + v_metal_found, 
          cargo_crystal = cargo_crystal + v_crystal_found, 
          cargo_deuterium = cargo_deuterium + v_deuterium_found, 
          is_returning = true 
      WHERE id = p_fleet_id;

      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) 
      VALUES (NULL, fleet_record.user_id, 'Reporte de Expedicion', v_expedition_message, 'expedition');
    END;

  ELSE
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$$;


-- ============================================================================
-- PASO 2: CORREGIR accelerate_fleet() PARA PROCESAR DIRECTAMENTE
-- ============================================================================
-- BUG FIX: Después de cambiar el tiempo de llegada, llamamos DIRECTAMENTE a
-- process_fleet_arrival() en la misma transacción. Esto garantiza que la flota
-- se procese UNA SOLA VEZ y no sea reprocesada por checkFleetArrivals().

CREATE OR REPLACE FUNCTION accelerate_fleet(p_fleet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fleet fleets%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_jackpot_percent numeric;
  v_jackpot_amount numeric;
  v_revenue_amount numeric;
  v_target_planet planets%ROWTYPE;
  v_defender_id uuid;
  v_origin_coords text;
  v_is_hostile boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- ==========================================================================
  -- BUG FIX: Obtener flota CON BLOQUEO para evitar concurrencia
  -- ==========================================================================
  SELECT * INTO v_fleet 
  FROM fleets 
  WHERE id = p_fleet_id
  FOR UPDATE;  -- BUG FIX: Bloqueo exclusivo

  IF v_fleet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada');
  END IF;

  IF v_fleet.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres el propietario de esta flota');
  END IF;

  IF v_fleet.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya ha llegado');
  END IF;

  v_fxu_cost := calculate_fxu_cost_fleet(p_fleet_id);

  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota esta a punto de llegar');
  END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente. Necesitas ' || v_fxu_cost || ' FXU (tienes ' || COALESCE(v_current_fxu, 0)::integer || ')'
    );
  END IF;

  SELECT COALESCE(value::numeric, 49) INTO v_jackpot_percent
  FROM game_settings WHERE key = 'fleet_acceleration_jackpot_percent';

  IF v_jackpot_percent < 0 THEN v_jackpot_percent := 0; END IF;
  IF v_jackpot_percent > 100 THEN v_jackpot_percent := 100; END IF;

  v_jackpot_amount := FLOOR(v_fxu_cost * v_jackpot_percent / 100);
  v_revenue_amount := v_fxu_cost - v_jackpot_amount;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles
  SET fxu_balance = fxu_balance - v_fxu_cost
  WHERE id = v_user_id;

  IF v_revenue_amount > 0 THEN
    INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
    VALUES ('fleet_acceleration', v_revenue_amount, v_user_id,
      'Aceleracion de flota ' || v_fleet.mission_type ||
      CASE WHEN v_fleet.is_returning THEN ' (regreso)' ELSE '' END
    );
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'fleet_acceleration', v_user_id);
  END IF;

  v_is_hostile := v_fleet.mission_type IN ('attack', 'espionage', 'acs_attack') AND NOT v_fleet.is_returning;

  IF v_is_hostile THEN
    SELECT p.* INTO v_target_planet
    FROM planets p
    WHERE p.galaxy = v_fleet.target_galaxy
      AND p.solar_system = v_fleet.target_system
      AND p.position = v_fleet.target_position
    LIMIT 1;

    IF v_target_planet IS NOT NULL AND v_target_planet.user_id != v_user_id THEN
      v_defender_id := v_target_planet.user_id;

      SELECT '[' || p.galaxy || ':' || p.solar_system || ':' || p.position || ']' INTO v_origin_coords
      FROM planets p WHERE p.id = v_fleet.origin_planet_id;

      INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
      VALUES (
        v_defender_id,
        'Sistema de Defensa',
        'ALERTA: Flota hostil acelerada',
        'Una flota hostil de tipo "' || v_fleet.mission_type || '" procedente de ' || COALESCE(v_origin_coords, 'coordenadas desconocidas') ||
        ' ha sido ACELERADA y llegara antes de lo previsto a tu planeta en [' ||
        v_fleet.target_galaxy || ':' || v_fleet.target_system || ':' || v_fleet.target_position || '].' ||
        E'\n\nPrepara tus defensas inmediatamente.',
        'combat'
      );
    END IF;
  END IF;

  -- ==========================================================================
  -- BUG FIX: Actualizar tiempo Y PROCESAR INMEDIATAMENTE
  -- ==========================================================================
  -- CÓDIGO ANTERIOR (BUGGY):
  --   IF v_fleet.is_returning THEN
  --     UPDATE fleets SET return_time = now() - interval '1 second' WHERE id = p_fleet_id;
  --   ELSE
  --     UPDATE fleets SET arrival_time = now() - interval '1 second' WHERE id = p_fleet_id;
  --   END IF;
  --   -- PROBLEMA: Solo cambiaba el tiempo pero NO procesaba la flota.
  --   -- checkFleetArrivals() encontraba la flota con tiempo expirado y la procesaba.
  --   -- Si había múltiples llamadas concurrentes, se procesaba múltiples veces.
  --
  -- CÓDIGO NUEVO (CORREGIDO):
  -- Cambiamos el tiempo y LLAMAMOS DIRECTAMENTE a process_fleet_arrival()
  -- en la misma transacción. Esto garantiza procesamiento único.
  -- ==========================================================================
  
  IF v_fleet.is_returning THEN
    UPDATE fleets
    SET return_time = now() - interval '1 second'
    WHERE id = p_fleet_id;
  ELSE
    UPDATE fleets
    SET arrival_time = now() - interval '1 second'
    WHERE id = p_fleet_id;
  END IF;

  -- ==========================================================================
  -- BUG FIX: PROCESAR LA FLOTA INMEDIATAMENTE
  -- ==========================================================================
  -- Llamamos a process_fleet_arrival() directamente aquí.
  -- Como process_fleet_arrival() ahora usa FOR UPDATE y verifica is_completed,
  -- no hay riesgo de procesamiento doble.
  -- ==========================================================================
  PERFORM process_fleet_arrival(p_fleet_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota acelerada exitosamente',
    'fxu_spent', v_fxu_cost,
    'jackpot_contribution', v_jackpot_amount
  );
END;
$$;


-- ============================================================================
-- PASO 3: AGREGAR BLOQUEO A process_user_pending_fleets()
-- ============================================================================
-- BUG FIX: También actualizamos esta función para usar FOR UPDATE SKIP LOCKED
-- al seleccionar flotas pendientes. Esto evita que múltiples llamadas
-- concurrentes procesen la misma flota.

CREATE OR REPLACE FUNCTION process_user_pending_fleets(p_user_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet record;
  v_processed_count integer := 0;
BEGIN
  -- ==========================================================================
  -- BUG FIX: Usar FOR UPDATE SKIP LOCKED para evitar procesamiento concurrente
  -- ==========================================================================
  -- CÓDIGO ANTERIOR (BUGGY):
  --   FOR v_fleet IN 
  --     SELECT id, arrival_time, return_time, is_returning
  --     FROM fleets 
  --     WHERE user_id = p_user_id AND is_completed = false AND ...
  --   -- PROBLEMA: Si múltiples transacciones ejecutaban esta query al mismo
  --   -- tiempo, todas obtenían la misma lista de flotas y las procesaban.
  --
  -- CÓDIGO NUEVO (CORREGIDO):
  -- Agregamos FOR UPDATE SKIP LOCKED para que cada transacción obtenga un
  -- bloqueo exclusivo en las filas. Si otra transacción ya tiene el bloqueo,
  -- esa fila se salta (SKIP LOCKED).
  -- ==========================================================================
  FOR v_fleet IN 
    SELECT id, arrival_time, return_time, is_returning
    FROM fleets 
    WHERE user_id = p_user_id 
      AND is_completed = false
      AND (
        (NOT is_returning AND arrival_time <= NOW())
        OR (is_returning AND return_time <= NOW())
      )
    ORDER BY 
      CASE WHEN is_returning THEN return_time ELSE arrival_time END ASC
    FOR UPDATE SKIP LOCKED  -- BUG FIX: Bloqueo con salto de filas bloqueadas
  LOOP
    PERFORM process_fleet_arrival(v_fleet.id);
    v_processed_count := v_processed_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count
  );
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PASO 4: ACTUALIZAR process_all_pending_fleets() CON BLOQUEO
-- ============================================================================
-- BUG FIX: También actualizamos la función global de procesamiento de flotas

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
  -- ==========================================================================
  -- BUG FIX: FOR UPDATE SKIP LOCKED para flotas de ida
  -- ==========================================================================
  FOR v_fleet IN 
    SELECT id, user_id, mission_type
    FROM fleets 
    WHERE is_completed = false
      AND NOT is_returning
      AND arrival_time <= NOW()
    ORDER BY arrival_time ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED  -- BUG FIX
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing fleet %: %', v_fleet.id, SQLERRM;
    END;
  END LOOP;
  
  -- ==========================================================================
  -- BUG FIX: FOR UPDATE SKIP LOCKED para flotas de retorno
  -- ==========================================================================
  FOR v_fleet IN 
    SELECT id, user_id, mission_type
    FROM fleets 
    WHERE is_completed = false
      AND is_returning
      AND return_time <= NOW()
    ORDER BY return_time ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED  -- BUG FIX
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


-- ============================================================================
-- COMENTARIO FINAL
-- ============================================================================
-- Este bug de duplicación de naves era causado por una condición de carrera
-- (race condition) donde múltiples transacciones podían procesar la misma
-- flota simultáneamente.
--
-- La corrección implementa tres capas de protección:
-- 1. FOR UPDATE en process_fleet_arrival() para bloquear la fila
-- 2. Verificación de is_completed = false antes de procesar
-- 3. PERFORM process_fleet_arrival() directamente en accelerate_fleet()
-- 4. FOR UPDATE SKIP LOCKED en las funciones de procesamiento por lotes
--
-- Con estas correcciones, es imposible que una flota se procese más de una vez.
-- ============================================================================
