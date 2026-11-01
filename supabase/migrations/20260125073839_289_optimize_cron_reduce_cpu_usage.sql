/*
  # Optimize Cron Jobs to Reduce CPU Usage

  ## Problem
  The database CPU usage spiked to 100% due to:
  1. Four cron jobs running every minute (5,760 executions/day)
  2. Functions using FOR loops (row-by-row) instead of bulk operations
  3. No early-exit when there's nothing to process
  4. Two functions using auth.uid() which returns NULL from pg_cron

  ## Solution
  1. Reduce cron frequency from every minute to every 5 minutes
  2. Use a single optimized global function that handles everything
  3. Add early-exit conditions to skip when nothing is pending
  4. Use bulk SQL operations instead of FOR loops
  5. Remove unnecessary cron jobs and consolidate into one

  ## Changes
  - Unschedule individual cron jobs
  - Create optimized_global_queue_processor() with bulk operations
  - Schedule single consolidated job every 5 minutes
  - Maintain exact same business logic for all queue processing

  ## Data Safety
  - NO data is deleted or modified
  - Same business rules apply
  - Just optimizing HOW processing happens, not WHAT gets processed
*/

-- Step 1: Unschedule existing cron jobs to reduce load
SELECT cron.unschedule('process-pending-fleets');
SELECT cron.unschedule('process-building-queues');
SELECT cron.unschedule('process-shipyard-queues');
SELECT cron.unschedule('process-research-completion');

-- Step 2: Create highly optimized global processor with bulk operations and early-exit
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
BEGIN
  -- BUILDING QUEUE: Check if anything pending before processing
  SELECT EXISTS(
    SELECT 1 FROM building_queue 
    WHERE end_time IS NOT NULL AND end_time <= NOW()
    LIMIT 1
  ) INTO v_has_pending;
  
  IF v_has_pending THEN
    -- Bulk complete buildings (no FOR loop)
    WITH completed AS (
      SELECT bq.id, bq.planet_id, bq.building_type_id, bq.target_level, bq.queue_position
      FROM building_queue bq
      WHERE bq.end_time IS NOT NULL AND bq.end_time <= NOW()
      ORDER BY bq.end_time
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    ),
    upserted AS (
      INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
      SELECT c.planet_id, c.building_type_id, c.target_level, false, NULL
      FROM completed c
      ON CONFLICT (planet_id, building_type_id)
      DO UPDATE SET 
        level = GREATEST(planet_buildings.level, EXCLUDED.level),
        is_upgrading = false,
        upgrade_end_time = NULL
      RETURNING planet_id
    ),
    fields_updated AS (
      UPDATE planets p
      SET fields_used = LEAST(fields_max, fields_used + sub.cnt)
      FROM (SELECT planet_id, COUNT(*) as cnt FROM upserted GROUP BY planet_id) sub
      WHERE p.id = sub.planet_id
    ),
    deleted AS (
      DELETE FROM building_queue WHERE id IN (SELECT id FROM completed)
      RETURNING id
    )
    SELECT COUNT(*) INTO v_building_count FROM deleted;
    
    -- Reorder remaining queue positions (bulk)
    UPDATE building_queue bq
    SET queue_position = sub.new_pos
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY planet_id ORDER BY queue_position) as new_pos
      FROM building_queue
    ) sub
    WHERE bq.id = sub.id AND bq.queue_position != sub.new_pos;
    
    -- Activate next items in queue (bulk)
    UPDATE building_queue
    SET start_time = NOW(),
        end_time = NOW() + (build_time * INTERVAL '1 second')
    WHERE queue_position = 1 AND start_time IS NULL;
  END IF;

  -- SHIPYARD QUEUE: Check if anything pending
  SELECT EXISTS(
    SELECT 1 FROM shipyard_queue 
    WHERE current_unit_end_time IS NOT NULL AND current_unit_end_time <= NOW()
    LIMIT 1
  ) INTO v_has_pending;
  
  IF v_has_pending THEN
    -- Process shipyard completions (bulk for ships)
    WITH completed_ships AS (
      SELECT sq.id, sq.planet_id, sq.ship_type_id, sq.quantity - sq.quantity_completed as units
      FROM shipyard_queue sq
      WHERE sq.item_type = 'ship'
        AND sq.ship_type_id IS NOT NULL
        AND sq.current_unit_end_time IS NOT NULL 
        AND sq.current_unit_end_time <= NOW()
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    ),
    ship_upsert AS (
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      SELECT cs.planet_id, cs.ship_type_id, cs.units
      FROM completed_ships cs
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity
      RETURNING planet_id
    ),
    deleted_ships AS (
      DELETE FROM shipyard_queue WHERE id IN (SELECT id FROM completed_ships)
      RETURNING id
    )
    SELECT COUNT(*) INTO v_shipyard_count FROM deleted_ships;
    
    -- Process defense completions (bulk)
    WITH completed_defense AS (
      SELECT sq.id, sq.planet_id, sq.defense_type_id, sq.quantity - sq.quantity_completed as units
      FROM shipyard_queue sq
      WHERE sq.item_type = 'defense'
        AND sq.defense_type_id IS NOT NULL
        AND sq.current_unit_end_time IS NOT NULL 
        AND sq.current_unit_end_time <= NOW()
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    ),
    defense_upsert AS (
      INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
      SELECT cd.planet_id, cd.defense_type_id, cd.units
      FROM completed_defense cd
      ON CONFLICT (planet_id, defense_type_id)
      DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity
      RETURNING planet_id
    ),
    deleted_defense AS (
      DELETE FROM shipyard_queue WHERE id IN (SELECT id FROM completed_defense)
      RETURNING id
    )
    SELECT v_shipyard_count + COUNT(*) INTO v_shipyard_count FROM deleted_defense;
    
    -- Reorder shipyard queues (bulk)
    UPDATE shipyard_queue sq
    SET queue_position = sub.new_pos
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY planet_id ORDER BY queue_position) as new_pos
      FROM shipyard_queue
    ) sub
    WHERE sq.id = sub.id AND sq.queue_position != sub.new_pos;
    
    -- Activate next shipyard items (bulk)
    UPDATE shipyard_queue
    SET start_time = NOW(),
        current_unit_end_time = NOW() + (build_time_per_unit * INTERVAL '1 second')
    WHERE queue_position = 1 AND start_time IS NULL;
  END IF;

  -- RESEARCH: Check if anything pending
  SELECT EXISTS(
    SELECT 1 FROM user_technologies 
    WHERE is_researching = true AND research_end_time IS NOT NULL AND research_end_time <= NOW()
    LIMIT 1
  ) INTO v_has_pending;
  
  IF v_has_pending THEN
    -- Bulk complete research
    WITH completed_research AS (
      UPDATE user_technologies
      SET level = level + 1,
          is_researching = false,
          research_end_time = NULL,
          research_planet_id = NULL
      WHERE is_researching = true
        AND research_end_time IS NOT NULL
        AND research_end_time <= NOW()
      RETURNING user_id
    )
    SELECT COUNT(*) INTO v_research_count FROM completed_research;
  END IF;

  -- FLEETS: Check if anything pending
  SELECT EXISTS(
    SELECT 1 FROM fleets 
    WHERE status = 'in_transit' AND arrival_time IS NOT NULL AND arrival_time <= NOW()
    LIMIT 1
  ) INTO v_has_pending;
  
  IF v_has_pending THEN
    -- Process fleets using existing function (already optimized)
    SELECT COALESCE((process_all_pending_fleets()->>'processed_count')::integer, 0) INTO v_fleet_count;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'buildings_completed', v_building_count,
    'shipyard_completed', v_shipyard_count,
    'research_completed', v_research_count,
    'fleets_processed', v_fleet_count,
    'timestamp', NOW()
  );
END;
$$;

-- Step 3: Schedule single optimized job every 5 minutes
SELECT cron.schedule(
  'optimized-queue-processor',
  '*/5 * * * *',
  $$SELECT optimized_global_queue_processor()$$
);

-- Step 4: Keep the user-facing functions but optimize them too
-- These are called when user reconnects, not by cron
CREATE OR REPLACE FUNCTION process_all_user_building_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_completed_count integer := 0;
  v_has_pending boolean;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Early exit if nothing pending
  SELECT EXISTS(
    SELECT 1 FROM building_queue bq
    JOIN planets p ON bq.planet_id = p.id
    WHERE p.user_id = v_user_id
      AND bq.end_time IS NOT NULL 
      AND bq.end_time <= NOW()
    LIMIT 1
  ) INTO v_has_pending;
  
  IF NOT v_has_pending THEN
    -- Just activate any pending first items
    UPDATE building_queue bq
    SET start_time = NOW(),
        end_time = NOW() + (bq.build_time * INTERVAL '1 second')
    FROM planets p
    WHERE bq.planet_id = p.id
      AND p.user_id = v_user_id
      AND bq.queue_position = 1
      AND bq.start_time IS NULL;
    
    RETURN jsonb_build_object('success', true, 'completed_count', 0);
  END IF;

  -- Bulk process completed buildings
  WITH completed AS (
    SELECT bq.id, bq.planet_id, bq.building_type_id, bq.target_level
    FROM building_queue bq
    JOIN planets p ON bq.planet_id = p.id
    WHERE p.user_id = v_user_id
      AND bq.end_time IS NOT NULL 
      AND bq.end_time <= NOW()
    ORDER BY bq.end_time
    LIMIT 20
    FOR UPDATE OF bq SKIP LOCKED
  ),
  upserted AS (
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
    SELECT c.planet_id, c.building_type_id, c.target_level, false, NULL
    FROM completed c
    ON CONFLICT (planet_id, building_type_id)
    DO UPDATE SET 
      level = GREATEST(planet_buildings.level, EXCLUDED.level),
      is_upgrading = false,
      upgrade_end_time = NULL
    RETURNING planet_id
  ),
  fields_updated AS (
    UPDATE planets p
    SET fields_used = LEAST(fields_max, fields_used + sub.cnt)
    FROM (SELECT planet_id, COUNT(*) as cnt FROM upserted GROUP BY planet_id) sub
    WHERE p.id = sub.planet_id
  ),
  deleted AS (
    DELETE FROM building_queue WHERE id IN (SELECT id FROM completed)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_completed_count FROM deleted;

  -- Reorder and activate
  UPDATE building_queue bq
  SET queue_position = sub.new_pos
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY planet_id ORDER BY queue_position) as new_pos
    FROM building_queue bq2
    JOIN planets p ON bq2.planet_id = p.id
    WHERE p.user_id = v_user_id
  ) sub
  WHERE bq.id = sub.id AND bq.queue_position != sub.new_pos;

  UPDATE building_queue bq
  SET start_time = NOW(),
      end_time = NOW() + (bq.build_time * INTERVAL '1 second')
  FROM planets p
  WHERE bq.planet_id = p.id
    AND p.user_id = v_user_id
    AND bq.queue_position = 1
    AND bq.start_time IS NULL;

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count);
END;
$$;

CREATE OR REPLACE FUNCTION process_all_user_shipyard_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_completed_units integer := 0;
  v_has_pending boolean;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Early exit check
  SELECT EXISTS(
    SELECT 1 FROM shipyard_queue sq
    JOIN planets p ON sq.planet_id = p.id
    WHERE p.user_id = v_user_id
      AND sq.current_unit_end_time IS NOT NULL 
      AND sq.current_unit_end_time <= NOW()
    LIMIT 1
  ) INTO v_has_pending;
  
  IF NOT v_has_pending THEN
    -- Just activate pending first items
    UPDATE shipyard_queue sq
    SET start_time = NOW(),
        current_unit_end_time = NOW() + (sq.build_time_per_unit * INTERVAL '1 second')
    FROM planets p
    WHERE sq.planet_id = p.id
      AND p.user_id = v_user_id
      AND sq.queue_position = 1
      AND sq.start_time IS NULL;
    
    RETURN jsonb_build_object('success', true, 'completed_units', 0);
  END IF;

  -- Bulk process ships
  WITH completed_ships AS (
    SELECT sq.id, sq.planet_id, sq.ship_type_id, sq.quantity - sq.quantity_completed as units
    FROM shipyard_queue sq
    JOIN planets p ON sq.planet_id = p.id
    WHERE p.user_id = v_user_id
      AND sq.item_type = 'ship'
      AND sq.ship_type_id IS NOT NULL
      AND sq.current_unit_end_time IS NOT NULL 
      AND sq.current_unit_end_time <= NOW()
    LIMIT 20
    FOR UPDATE OF sq SKIP LOCKED
  ),
  ship_upsert AS (
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    SELECT cs.planet_id, cs.ship_type_id, cs.units
    FROM completed_ships cs
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity
    RETURNING 1 as done
  ),
  deleted_ships AS (
    DELETE FROM shipyard_queue WHERE id IN (SELECT id FROM completed_ships)
    RETURNING quantity - quantity_completed as units
  )
  SELECT COALESCE(SUM(units), 0) INTO v_completed_units FROM deleted_ships;

  -- Bulk process defense
  WITH completed_defense AS (
    SELECT sq.id, sq.planet_id, sq.defense_type_id, sq.quantity - sq.quantity_completed as units
    FROM shipyard_queue sq
    JOIN planets p ON sq.planet_id = p.id
    WHERE p.user_id = v_user_id
      AND sq.item_type = 'defense'
      AND sq.defense_type_id IS NOT NULL
      AND sq.current_unit_end_time IS NOT NULL 
      AND sq.current_unit_end_time <= NOW()
    LIMIT 20
    FOR UPDATE OF sq SKIP LOCKED
  ),
  defense_upsert AS (
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    SELECT cd.planet_id, cd.defense_type_id, cd.units
    FROM completed_defense cd
    ON CONFLICT (planet_id, defense_type_id)
    DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity
    RETURNING 1 as done
  ),
  deleted_defense AS (
    DELETE FROM shipyard_queue WHERE id IN (SELECT id FROM completed_defense)
    RETURNING quantity - quantity_completed as units
  )
  SELECT v_completed_units + COALESCE(SUM(units), 0) INTO v_completed_units FROM deleted_defense;

  -- Reorder and activate
  UPDATE shipyard_queue sq
  SET queue_position = sub.new_pos
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY planet_id ORDER BY queue_position) as new_pos
    FROM shipyard_queue sq2
    JOIN planets p ON sq2.planet_id = p.id
    WHERE p.user_id = v_user_id
  ) sub
  WHERE sq.id = sub.id AND sq.queue_position != sub.new_pos;

  UPDATE shipyard_queue sq
  SET start_time = NOW(),
      current_unit_end_time = NOW() + (sq.build_time_per_unit * INTERVAL '1 second')
  FROM planets p
  WHERE sq.planet_id = p.id
    AND p.user_id = v_user_id
    AND sq.queue_position = 1
    AND sq.start_time IS NULL;

  RETURN jsonb_build_object('success', true, 'completed_units', v_completed_units);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION optimized_global_queue_processor() TO service_role;
