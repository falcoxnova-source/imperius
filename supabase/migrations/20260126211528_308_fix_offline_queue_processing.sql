/*
  # Corregir procesamiento offline de colas
  
  ## Problema
  La funcion optimized_global_queue_processor completaba TODAS las unidades
  pendientes de shipyard cuando current_unit_end_time <= NOW(), en lugar de
  calcular cuantas unidades deberian haberse completado segun el tiempo
  transcurrido.
  
  ## Solucion
  1. Actualizar optimized_global_queue_processor para calcular unidades
     basandose en el tiempo real transcurrido
  2. Procesar cada item de cola individualmente para calcular correctamente
  3. Manejar cascada de items en cola correctamente
*/

CREATE OR REPLACE FUNCTION optimized_global_queue_processor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_building_count integer := 0;
  v_shipyard_count integer := 0;
  v_research_count integer := 0;
  v_fleet_count integer := 0;
  v_has_pending boolean;
  v_queue_item record;
  v_now timestamptz := NOW();
  v_build_time_ms bigint;
  v_elapsed_ms bigint;
  v_units_to_complete integer;
  v_remaining_units integer;
  v_next_item record;
BEGIN
  -- =========================================================================
  -- BUILDING QUEUE: Procesar items completados
  -- =========================================================================
  SELECT EXISTS(
    SELECT 1 FROM building_queue 
    WHERE end_time IS NOT NULL AND end_time <= v_now
    LIMIT 1
  ) INTO v_has_pending;

  IF v_has_pending THEN
    -- Procesar edificios completados en cascada
    FOR v_queue_item IN
      SELECT bq.id, bq.planet_id, bq.building_type_id, bq.target_level, 
             bq.queue_position, bq.end_time, p.user_id
      FROM building_queue bq
      JOIN planets p ON p.id = bq.planet_id
      WHERE bq.end_time IS NOT NULL AND bq.end_time <= v_now
      ORDER BY bq.planet_id, bq.end_time
      LIMIT 100
      FOR UPDATE OF bq SKIP LOCKED
    LOOP
      -- Completar el edificio
      INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
      VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false, NULL)
      ON CONFLICT (planet_id, building_type_id)
      DO UPDATE SET 
        level = GREATEST(planet_buildings.level, EXCLUDED.level),
        is_upgrading = false,
        upgrade_end_time = NULL;

      -- Actualizar campos usados
      UPDATE planets SET fields_used = LEAST(fields_max, fields_used + 1)
      WHERE id = v_queue_item.planet_id;

      -- Eliminar de la cola
      DELETE FROM building_queue WHERE id = v_queue_item.id;

      v_building_count := v_building_count + 1;

      -- Actualizar puntos
      PERFORM update_user_points(v_queue_item.user_id);
    END LOOP;

    -- Reordenar posiciones y activar siguiente item
    UPDATE building_queue bq
    SET queue_position = sub.new_pos
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY planet_id ORDER BY queue_position) as new_pos
      FROM building_queue
    ) sub
    WHERE bq.id = sub.id AND bq.queue_position != sub.new_pos;

    -- Activar items en posicion 1 sin start_time
    UPDATE building_queue
    SET start_time = v_now,
        end_time = v_now + (build_time * INTERVAL '1 second')
    WHERE queue_position = 1 AND start_time IS NULL;
  END IF;

  -- =========================================================================
  -- SHIPYARD QUEUE: Procesar con calculo correcto de tiempo
  -- =========================================================================
  SELECT EXISTS(
    SELECT 1 FROM shipyard_queue 
    WHERE queue_position = 1 
      AND current_unit_end_time IS NOT NULL 
      AND current_unit_end_time <= v_now
    LIMIT 1
  ) INTO v_has_pending;

  IF v_has_pending THEN
    FOR v_queue_item IN
      SELECT sq.*, p.user_id
      FROM shipyard_queue sq
      JOIN planets p ON p.id = sq.planet_id
      WHERE sq.queue_position = 1
        AND sq.current_unit_end_time IS NOT NULL 
        AND sq.current_unit_end_time <= v_now
      ORDER BY sq.current_unit_end_time
      LIMIT 100
      FOR UPDATE OF sq SKIP LOCKED
    LOOP
      -- Calcular cuantas unidades se completaron basandose en el tiempo
      v_build_time_ms := GREATEST(1000, v_queue_item.build_time_per_unit * 1000);
      v_elapsed_ms := EXTRACT(EPOCH FROM (v_now - v_queue_item.current_unit_end_time)) * 1000 + v_build_time_ms;
      v_remaining_units := v_queue_item.quantity - v_queue_item.quantity_completed;
      
      v_units_to_complete := LEAST(
        FLOOR(v_elapsed_ms / v_build_time_ms)::integer,
        v_remaining_units
      );

      IF v_units_to_complete > 0 THEN
        -- Agregar naves/defensas al planeta
        IF v_queue_item.item_type = 'ship' AND v_queue_item.ship_type_id IS NOT NULL THEN
          INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
          VALUES (v_queue_item.planet_id, v_queue_item.ship_type_id, v_units_to_complete)
          ON CONFLICT (planet_id, ship_type_id)
          DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
        ELSIF v_queue_item.item_type = 'defense' AND v_queue_item.defense_type_id IS NOT NULL THEN
          INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
          VALUES (v_queue_item.planet_id, v_queue_item.defense_type_id, v_units_to_complete)
          ON CONFLICT (planet_id, defense_type_id)
          DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity;
        END IF;

        v_shipyard_count := v_shipyard_count + v_units_to_complete;

        -- Verificar si se completo toda la cola
        IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
          -- Eliminar item completado
          DELETE FROM shipyard_queue WHERE id = v_queue_item.id;

          -- Activar siguiente item en la cola
          SELECT * INTO v_next_item
          FROM shipyard_queue
          WHERE planet_id = v_queue_item.planet_id AND queue_position = 2
          LIMIT 1;

          IF FOUND THEN
            UPDATE shipyard_queue
            SET queue_position = 1,
                start_time = v_now,
                current_unit_end_time = v_now + (build_time_per_unit * INTERVAL '1 second')
            WHERE id = v_next_item.id;

            -- Reordenar resto de la cola
            UPDATE shipyard_queue
            SET queue_position = queue_position - 1
            WHERE planet_id = v_queue_item.planet_id AND queue_position > 2;
          END IF;
        ELSE
          -- Actualizar progreso parcial
          UPDATE shipyard_queue
          SET quantity_completed = quantity_completed + v_units_to_complete,
              current_unit_end_time = v_now + (build_time_per_unit * INTERVAL '1 second')
          WHERE id = v_queue_item.id;
        END IF;

        -- Actualizar puntos del usuario
        PERFORM update_user_points(v_queue_item.user_id);
      END IF;
    END LOOP;
  END IF;

  -- =========================================================================
  -- RESEARCH: Completar investigaciones
  -- =========================================================================
  SELECT EXISTS(
    SELECT 1 FROM user_technologies 
    WHERE is_researching = true 
      AND research_end_time IS NOT NULL 
      AND research_end_time <= v_now
    LIMIT 1
  ) INTO v_has_pending;

  IF v_has_pending THEN
    WITH completed_research AS (
      UPDATE user_technologies
      SET level = level + 1,
          is_researching = false,
          research_end_time = NULL,
          research_planet_id = NULL
      WHERE is_researching = true
        AND research_end_time IS NOT NULL
        AND research_end_time <= v_now
      RETURNING user_id
    )
    SELECT COUNT(*) INTO v_research_count FROM completed_research;

    -- Actualizar puntos de usuarios con investigacion completada
    UPDATE profiles p
    SET points_total = COALESCE(points_buildings, 0) + COALESCE(points_research, 0) + COALESCE(points_fleet, 0) + COALESCE(points_defense, 0)
    WHERE id IN (
      SELECT DISTINCT user_id FROM user_technologies 
      WHERE is_researching = false 
        AND research_end_time IS NULL
    );
  END IF;

  -- =========================================================================
  -- FLEETS: Procesar llegadas
  -- =========================================================================
  SELECT EXISTS(
    SELECT 1 FROM fleets 
    WHERE is_completed = false 
      AND (
        (NOT is_returning AND arrival_time IS NOT NULL AND arrival_time <= v_now)
        OR (is_returning AND return_time IS NOT NULL AND return_time <= v_now)
      )
    LIMIT 1
  ) INTO v_has_pending;

  IF v_has_pending THEN
    SELECT COALESCE((process_all_pending_fleets()->>'processed_count')::integer, 0) INTO v_fleet_count;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'buildings_completed', v_building_count,
    'shipyard_completed', v_shipyard_count,
    'research_completed', v_research_count,
    'fleets_processed', v_fleet_count,
    'timestamp', v_now
  );
END;
$$;


-- Tambien actualizar el cron para que corra cada 1 minuto en lugar de cada 10
SELECT cron.unschedule('optimized-queue-processor');
SELECT cron.schedule(
  'optimized-queue-processor',
  '* * * * *',
  'SELECT optimized_global_queue_processor()'
);
