/*
  # Fix Lunar Base fields_max on completion

  ## Problem
  When the cron job (optimized_global_queue_processor) completes a building,
  it only increments `fields_used` but never updates `fields_max` when the
  completed building is a Lunar Base. In XNova, each Lunar Base level adds
  3 fields to the moon.

  ## Fix
  - Update `optimized_global_queue_processor` to recalculate `fields_max`
    when a Lunar Base is completed on a moon
  - Formula: fields_max = 1 + (lunar_base_level * 3)
  - Also backfill existing moons that have incorrect fields_max

  ## Backfill
  - Correct fields_max for all existing moons based on current Lunar Base level
*/

-- Backfill: fix fields_max for all existing moons
UPDATE planets p
SET fields_max = 1 + (COALESCE(pb.level, 0) * 3)
FROM (
  SELECT planet_id, level
  FROM planet_buildings
  WHERE building_type_id = 15
) pb
WHERE p.id = pb.planet_id
AND p.planet_type = 'moon'
AND p.fields_max != 1 + (pb.level * 3);

-- Also fix moons without lunar_base (should have fields_max = 1)
UPDATE planets
SET fields_max = 1
WHERE planet_type = 'moon'
AND fields_max != 1
AND id NOT IN (
  SELECT planet_id FROM planet_buildings WHERE building_type_id = 15 AND level > 0
);

-- Now update the cron processor to handle lunar base fields_max
CREATE OR REPLACE FUNCTION public.optimized_global_queue_processor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '55s'
AS $function$
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
  v_affected_users uuid[] := ARRAY[]::uuid[];
  v_stuck RECORD;
  v_is_lunar_base boolean;
  v_is_moon boolean;
BEGIN
  ALTER TABLE planet_buildings DISABLE TRIGGER trigger_building_points;
  ALTER TABLE planet_ships DISABLE TRIGGER trigger_fleet_points;
  ALTER TABLE planet_defenses DISABLE TRIGGER trigger_defense_points;

  -- =========================================================================
  -- BUILDING QUEUE
  -- =========================================================================
  BEGIN
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

          -- If this is a Lunar Base on a moon, update fields_max
          SELECT
            v_queue_item.building_type_id = 15,
            pl.planet_type = 'moon'
          INTO v_is_lunar_base, v_is_moon
          FROM planets pl WHERE pl.id = v_queue_item.planet_id;

          IF v_is_lunar_base AND v_is_moon THEN
            UPDATE planets
            SET fields_max = 1 + (v_queue_item.target_level * 3)
            WHERE id = v_queue_item.planet_id;
          END IF;

          DELETE FROM building_queue WHERE id = v_queue_item.id;
          v_building_count := v_building_count + 1;

          IF NOT (v_queue_item.user_id = ANY(v_affected_users)) THEN
            v_affected_users := array_append(v_affected_users, v_queue_item.user_id);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Cron: Error building %: %', v_queue_item.id, SQLERRM;
        END;
      END LOOP;

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
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Building section error: %', SQLERRM;
  END;

  -- =========================================================================
  -- SHIPYARD QUEUE
  -- =========================================================================
  BEGIN
    FOR v_stuck IN
      SELECT sq.id, sq.planet_id, sq.queue_position, p.user_id
      FROM shipyard_queue sq
      JOIN planets p ON p.id = sq.planet_id
      WHERE sq.quantity_completed >= sq.quantity
      ORDER BY sq.planet_id, sq.queue_position
      FOR UPDATE OF sq SKIP LOCKED
    LOOP
      BEGIN
        DELETE FROM shipyard_queue WHERE id = v_stuck.id;

        UPDATE shipyard_queue
        SET queue_position = queue_position - 1
        WHERE planet_id = v_stuck.planet_id
        AND queue_position > v_stuck.queue_position;

        UPDATE shipyard_queue
        SET start_time = v_now,
          current_unit_end_time = v_now + (build_time_per_unit || ' seconds')::interval
        WHERE planet_id = v_stuck.planet_id
        AND queue_position = 1
        AND start_time IS NULL;

        IF NOT (v_stuck.user_id = ANY(v_affected_users)) THEN
          v_affected_users := array_append(v_affected_users, v_stuck.user_id);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Cron: Error cleaning stuck shipyard %: %', v_stuck.id, SQLERRM;
      END;
    END LOOP;

    UPDATE shipyard_queue
    SET
      start_time = COALESCE(start_time, v_now),
      current_unit_end_time = COALESCE(start_time, v_now) + (build_time_per_unit || ' seconds')::interval
    WHERE queue_position = 1
    AND current_unit_end_time IS NULL;

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

            IF NOT (v_queue_item.user_id = ANY(v_affected_users)) THEN
              v_affected_users := array_append(v_affected_users, v_queue_item.user_id);
            END IF;

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
          RAISE WARNING 'Cron: Error shipyard %: %', v_queue_item.id, SQLERRM;
        END;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Shipyard section error: %', SQLERRM;
  END;

  ALTER TABLE planet_buildings ENABLE TRIGGER trigger_building_points;
  ALTER TABLE planet_ships ENABLE TRIGGER trigger_fleet_points;
  ALTER TABLE planet_defenses ENABLE TRIGGER trigger_defense_points;

  -- =========================================================================
  -- RESEARCH
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
      FOR v_queue_item IN
        SELECT ut.id, ut.user_id
        FROM user_technologies ut
        WHERE ut.is_researching = true
        AND ut.research_end_time IS NOT NULL
        AND ut.research_end_time <= v_now
        FOR UPDATE OF ut SKIP LOCKED
      LOOP
        BEGIN
          UPDATE user_technologies
          SET level = level + 1,
            is_researching = false,
            research_end_time = NULL,
            research_planet_id = NULL
          WHERE id = v_queue_item.id;

          v_research_count := v_research_count + 1;

          IF NOT (v_queue_item.user_id = ANY(v_affected_users)) THEN
            v_affected_users := array_append(v_affected_users, v_queue_item.user_id);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Cron: Error research %: %', v_queue_item.id, SQLERRM;
        END;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Research error: %', SQLERRM;
  END;

  -- =========================================================================
  -- FLEETS
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
    RAISE WARNING 'Cron: Fleet error: %', SQLERRM;
  END;

  -- =========================================================================
  -- BATCH POINTS UPDATE
  -- =========================================================================
  BEGIN
    IF array_length(v_affected_users, 1) > 0 THEN
      UPDATE profiles p
      SET
        points_buildings = COALESCE((
          SELECT SUM(
            CASE WHEN bt.metal_cost > 0 OR bt.crystal_cost > 0 OR bt.deuterium_cost > 0
            THEN (bt.metal_cost + bt.crystal_cost + bt.deuterium_cost) *
              (POWER(bt.cost_factor, pb.level) - 1) / (bt.cost_factor - 1) / 1000
            ELSE 0 END
          )
          FROM planet_buildings pb
          JOIN building_types bt ON bt.id = pb.building_type_id
          JOIN planets pl ON pl.id = pb.planet_id
          WHERE pl.user_id = p.id AND pb.level > 0
        ), 0),
        points_fleet = COALESCE((
          SELECT SUM((st.metal_cost + st.crystal_cost + st.deuterium_cost) * ps.quantity / 1000)
          FROM planet_ships ps
          JOIN ship_types st ON st.id = ps.ship_type_id
          JOIN planets pl ON pl.id = ps.planet_id
          WHERE pl.user_id = p.id AND ps.quantity > 0
        ), 0),
        points_defense = COALESCE((
          SELECT SUM((dt.metal_cost + dt.crystal_cost + dt.deuterium_cost) * pd.quantity / 1000)
          FROM planet_defenses pd
          JOIN defense_types dt ON dt.id = pd.defense_type_id
          JOIN planets pl ON pl.id = pd.planet_id
          WHERE pl.user_id = p.id AND pd.quantity > 0
        ), 0),
        updated_at = now()
      WHERE p.id = ANY(v_affected_users);

      UPDATE profiles
      SET points_total = COALESCE(points_buildings, 0) + COALESCE(points_research, 0) + COALESCE(points_fleet, 0) + COALESCE(points_defense, 0)
      WHERE id = ANY(v_affected_users);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Points update error: %', SQLERRM;
  END;

  -- =========================================================================
  -- GLOBAL RANKING UPDATE
  -- =========================================================================
  BEGIN
    IF v_building_count > 0 OR v_shipyard_count > 0 OR v_research_count > 0 OR v_fleet_count > 0 THEN
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (ORDER BY points_total DESC, created_at ASC) as rank_total,
          ROW_NUMBER() OVER (ORDER BY points_buildings DESC, created_at ASC) as rank_b,
          ROW_NUMBER() OVER (ORDER BY points_research DESC, created_at ASC) as rank_r,
          ROW_NUMBER() OVER (ORDER BY points_fleet DESC, created_at ASC) as rank_f,
          ROW_NUMBER() OVER (ORDER BY points_defense DESC, created_at ASC) as rank_d
        FROM profiles
      )
      UPDATE profiles p
      SET
        rank_position = r.rank_total,
        rank_buildings = r.rank_b,
        rank_research = r.rank_r,
        rank_fleet = r.rank_f,
        rank_defense = r.rank_d
      FROM ranked r
      WHERE p.id = r.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Ranking update error: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'buildings_completed', v_building_count,
    'shipyard_completed', v_shipyard_count,
    'research_completed', v_research_count,
    'fleets_processed', v_fleet_count,
    'affected_users', array_length(v_affected_users, 1),
    'timestamp', v_now
  );
END;
$function$;
