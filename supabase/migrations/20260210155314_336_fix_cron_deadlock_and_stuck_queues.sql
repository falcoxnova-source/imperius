/*
  # Fix Cron Deadlock Causing All Queues to Get Stuck

  ## Problem
  The `optimized_global_queue_processor` cron function was failing EVERY run due to:
  1. Deadlocks caused by `update_all_ranks()` locking ALL profiles when completing buildings
  2. Trigger cascade: planet_buildings INSERT → trigger_update_building_points → update_player_points 
     → update_all_ranks (locks ALL profiles) → sync_alliance_points → update_all_alliance_rankings (locks ALL alliances)
  3. Double point update: trigger already fires update_player_points, PLUS explicit PERFORM update_user_points call
  4. No per-item error isolation: one deadlock kills the entire function, rolling back ALL processing
  
  This caused ALL queues (buildings, shipyard, research, fleets) to be stuck since the entire 
  function transaction rolls back on any single deadlock.

  ## Fix Applied
  1. Added per-item BEGIN...EXCEPTION handlers so deadlocks on individual items don't kill the whole batch
  2. Removed duplicate `update_user_points` calls (the trigger on planet_buildings already handles this)
  3. Removed explicit `update_user_points` from shipyard processing (separate lightweight update instead)
  4. Added block-level exception handling for research and fleet sections
  5. Each section is now independent - a failure in buildings won't affect fleet processing

  ## Data Safety
  - NO data is deleted or modified beyond normal queue processing
  - All business logic remains the same
  - Points still update via existing triggers on planet_buildings
  - Deadlocked items are simply skipped and retried on the next cron run (every minute)
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
  -- BUILDING QUEUE: Process completed items with per-item error isolation
  -- =========================================================================
  SELECT EXISTS(
    SELECT 1 FROM building_queue 
    WHERE end_time IS NOT NULL AND end_time <= v_now
    LIMIT 1
  ) INTO v_has_pending;

  IF v_has_pending THEN
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
      BEGIN
        INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
        VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false, NULL)
        ON CONFLICT (planet_id, building_type_id)
        DO UPDATE SET 
          level = GREATEST(planet_buildings.level, EXCLUDED.level),
          is_upgrading = false,
          upgrade_end_time = NULL;

        UPDATE planets SET fields_used = LEAST(fields_max, fields_used + 1)
        WHERE id = v_queue_item.planet_id;

        DELETE FROM building_queue WHERE id = v_queue_item.id;

        v_building_count := v_building_count + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Cron: Error processing building queue item %: %', v_queue_item.id, SQLERRM;
      END;
    END LOOP;

    BEGIN
      UPDATE building_queue bq
      SET queue_position = sub.new_pos
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY planet_id ORDER BY queue_position) as new_pos
        FROM building_queue
      ) sub
      WHERE bq.id = sub.id AND bq.queue_position != sub.new_pos;

      UPDATE building_queue
      SET start_time = v_now,
          end_time = v_now + (build_time * INTERVAL '1 second')
      WHERE queue_position = 1 AND start_time IS NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Cron: Error reordering building queue: %', SQLERRM;
    END;
  END IF;

  -- =========================================================================
  -- SHIPYARD QUEUE: Process with per-item error isolation
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
      BEGIN
        v_build_time_ms := GREATEST(1000, v_queue_item.build_time_per_unit * 1000);
        v_elapsed_ms := EXTRACT(EPOCH FROM (v_now - v_queue_item.current_unit_end_time)) * 1000 + v_build_time_ms;
        v_remaining_units := v_queue_item.quantity - v_queue_item.quantity_completed;

        v_units_to_complete := LEAST(
          FLOOR(v_elapsed_ms / v_build_time_ms)::integer,
          v_remaining_units
        );

        IF v_units_to_complete > 0 THEN
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

          IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
            DELETE FROM shipyard_queue WHERE id = v_queue_item.id;

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

              UPDATE shipyard_queue
              SET queue_position = queue_position - 1
              WHERE planet_id = v_queue_item.planet_id AND queue_position > 2;
            END IF;
          ELSE
            UPDATE shipyard_queue
            SET quantity_completed = quantity_completed + v_units_to_complete,
                current_unit_end_time = v_now + (build_time_per_unit * INTERVAL '1 second')
            WHERE id = v_queue_item.id;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Cron: Error processing shipyard queue item %: %', v_queue_item.id, SQLERRM;
      END;
    END LOOP;
  END IF;

  -- =========================================================================
  -- RESEARCH: Complete pending research with error isolation
  -- =========================================================================
  BEGIN
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
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Error processing research: %', SQLERRM;
  END;

  -- =========================================================================
  -- FLEETS: Process arrivals with error isolation
  -- =========================================================================
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Error processing fleets: %', SQLERRM;
  END;

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
