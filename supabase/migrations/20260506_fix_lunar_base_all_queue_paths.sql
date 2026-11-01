-- ============================================================================
-- Migration: Fix Lunar Base fields_max across ALL queue-processing paths
-- Date: 2026-05-06
--
-- Issue: Users who built/upgraded Lunar Base on their moons sometimes got NO
-- extra fields. Only `optimized_global_queue_processor` had the correct
-- formula (`fields_max = 1 + target_level*3`). Four other functions that can
-- complete the building queue (cron fallback, on-reconnect bulk processor,
-- admin stuck-queue cleaner, bot processor) updated `fields_used` but NEVER
-- touched `fields_max` when the completed building was `lunar_base` on a moon.
--
-- Fix strategy:
--   1. Patch each broken function to bump `planets.fields_max` to
--      `1 + target_level * 3` whenever a Lunar Base completes on a moon.
--   2. Use GREATEST so we never lower an already-correct (or legacy-inflated)
--      value.
--   3. Backfill moons where fields_max < expected value.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) global_process_all_expired_queues
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.global_process_all_expired_queues()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_queue_item RECORD;
v_building_completed integer := 0;
v_shipyard_completed integer := 0;
v_fleet_processed integer := 0;
v_research_completed integer := 0;
v_errors integer := 0;
v_units_to_complete integer;
v_lunar_base_id integer;
BEGIN
SELECT id INTO v_lunar_base_id FROM building_types WHERE code = 'lunar_base' LIMIT 1;

FOR v_queue_item IN 
SELECT bq.*
FROM building_queue bq
WHERE bq.end_time IS NOT NULL 
AND bq.end_time <= NOW()
ORDER BY bq.end_time ASC
LIMIT 100
LOOP
BEGIN
INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false, NULL)
ON CONFLICT (planet_id, building_type_id)
DO UPDATE SET 
level = GREATEST(planet_buildings.level, v_queue_item.target_level),
is_upgrading = false,
upgrade_end_time = NULL;

UPDATE planets SET fields_used = LEAST(fields_max, fields_used + 1) WHERE id = v_queue_item.planet_id;

-- [FIX 2026-05-06] Lunar base on moon: grant +3 fields per level
IF v_lunar_base_id IS NOT NULL AND v_queue_item.building_type_id = v_lunar_base_id THEN
  UPDATE planets
  SET fields_max = GREATEST(fields_max, 1 + v_queue_item.target_level * 3)
  WHERE id = v_queue_item.planet_id AND planet_type = 'moon';
END IF;

DELETE FROM building_queue WHERE id = v_queue_item.id;
UPDATE building_queue SET queue_position = queue_position - 1 
WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;

v_building_completed := v_building_completed + 1;
EXCEPTION WHEN OTHERS THEN
v_errors := v_errors + 1;
END;
END LOOP;

FOR v_queue_item IN 
SELECT sq.*
FROM shipyard_queue sq
WHERE sq.current_unit_end_time IS NOT NULL 
AND sq.current_unit_end_time <= NOW()
ORDER BY sq.current_unit_end_time ASC
LIMIT 100
LOOP
BEGIN
v_units_to_complete := v_queue_item.quantity - v_queue_item.quantity_completed;

IF v_queue_item.item_type = 'ship' AND v_queue_item.ship_type_id IS NOT NULL THEN
INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
VALUES (v_queue_item.planet_id, v_queue_item.ship_type_id, v_units_to_complete)
ON CONFLICT (planet_id, ship_type_id)
DO UPDATE SET quantity = planet_ships.quantity + v_units_to_complete;
ELSIF v_queue_item.item_type = 'defense' AND v_queue_item.defense_type_id IS NOT NULL THEN
INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
VALUES (v_queue_item.planet_id, v_queue_item.defense_type_id, v_units_to_complete)
ON CONFLICT (planet_id, defense_type_id)
DO UPDATE SET quantity = planet_defenses.quantity + v_units_to_complete;
END IF;

DELETE FROM shipyard_queue WHERE id = v_queue_item.id;
UPDATE shipyard_queue SET queue_position = queue_position - 1 
WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;

v_shipyard_completed := v_shipyard_completed + v_units_to_complete;
EXCEPTION WHEN OTHERS THEN
v_errors := v_errors + 1;
END;
END LOOP;

FOR v_queue_item IN 
SELECT ut.*
FROM user_technologies ut
WHERE ut.is_researching = true
AND ut.research_end_time IS NOT NULL
AND ut.research_end_time <= NOW()
ORDER BY ut.research_end_time ASC
LIMIT 50
LOOP
BEGIN
UPDATE user_technologies
SET level = level + 1,
is_researching = false,
research_end_time = NULL,
research_planet_id = NULL
WHERE id = v_queue_item.id;

v_research_completed := v_research_completed + 1;
EXCEPTION WHEN OTHERS THEN
v_errors := v_errors + 1;
END;
END LOOP;

RETURN jsonb_build_object(
'success', true,
'building_completed', v_building_completed,
'shipyard_completed', v_shipyard_completed,
'research_completed', v_research_completed,
'errors', v_errors,
'timestamp', NOW()
);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2) process_all_user_building_queues (on-reconnect bulk processor)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_all_user_building_queues()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_user_id uuid;
v_completed_count integer := 0;
v_has_pending boolean;
v_lunar_base_id integer;
BEGIN
SELECT auth.uid() INTO v_user_id;
IF v_user_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
END IF;

SELECT id INTO v_lunar_base_id FROM building_types WHERE code = 'lunar_base' LIMIT 1;

SELECT EXISTS(
SELECT 1 FROM building_queue bq
JOIN planets p ON bq.planet_id = p.id
WHERE p.user_id = v_user_id
AND bq.end_time IS NOT NULL 
AND bq.end_time <= NOW()
LIMIT 1
) INTO v_has_pending;

IF NOT v_has_pending THEN
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
-- [FIX 2026-05-06] Lunar base on moon: grant +3 fields per level
moon_fields_updated AS (
UPDATE planets p
SET fields_max = GREATEST(p.fields_max, 1 + c.target_level * 3)
FROM completed c
WHERE p.id = c.planet_id
  AND p.planet_type = 'moon'
  AND c.building_type_id = v_lunar_base_id
),
deleted AS (
DELETE FROM building_queue WHERE id IN (SELECT id FROM completed)
RETURNING id
)
SELECT COUNT(*) INTO v_completed_count FROM deleted;

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
$function$;

-- ----------------------------------------------------------------------------
-- 3) admin_process_stuck_building_queues
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_process_stuck_building_queues()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_user_id uuid;
v_is_admin boolean;
v_queue_item RECORD;
v_completed_count integer := 0;
v_error_count integer := 0;
v_building_record RECORD;
v_planet RECORD;
v_lunar_base_id integer;
BEGIN
SELECT auth.uid() INTO v_user_id;

IF v_user_id IS NOT NULL THEN
SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
IF NOT COALESCE(v_is_admin, false) THEN
RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
END IF;
END IF;

SELECT id INTO v_lunar_base_id FROM building_types WHERE code = 'lunar_base' LIMIT 1;

FOR v_queue_item IN 
SELECT bq.*, bt.code as building_code
FROM building_queue bq
JOIN building_types bt ON bq.building_type_id = bt.id
WHERE bq.end_time IS NOT NULL 
AND bq.end_time <= NOW()
ORDER BY bq.end_time ASC
LOOP
BEGIN
SELECT * INTO v_planet FROM planets WHERE id = v_queue_item.planet_id;

SELECT * INTO v_building_record 
FROM planet_buildings 
WHERE planet_id = v_queue_item.planet_id 
AND building_type_id = v_queue_item.building_type_id;

IF v_building_record IS NOT NULL THEN
UPDATE planet_buildings
SET level = v_queue_item.target_level,
is_upgrading = false,
upgrade_end_time = NULL
WHERE id = v_building_record.id;
ELSE
INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false);
END IF;

UPDATE planets
SET fields_used = fields_used + 1
WHERE id = v_queue_item.planet_id
AND fields_used < fields_max;

-- [FIX 2026-05-06] Lunar base on moon: grant +3 fields per level
IF v_lunar_base_id IS NOT NULL AND v_queue_item.building_type_id = v_lunar_base_id THEN
  UPDATE planets
  SET fields_max = GREATEST(fields_max, 1 + v_queue_item.target_level * 3)
  WHERE id = v_queue_item.planet_id AND planet_type = 'moon';
END IF;

DELETE FROM building_queue WHERE id = v_queue_item.id;

UPDATE building_queue
SET queue_position = queue_position - 1
WHERE planet_id = v_queue_item.planet_id
AND queue_position > v_queue_item.queue_position;

v_completed_count := v_completed_count + 1;

EXCEPTION WHEN OTHERS THEN
v_error_count := v_error_count + 1;
END;
END LOOP;

FOR v_queue_item IN 
SELECT bq.*, bt.code as building_code, p.user_id
FROM building_queue bq
JOIN building_types bt ON bq.building_type_id = bt.id
JOIN planets p ON bq.planet_id = p.id
WHERE bq.queue_position = 1 
AND bq.end_time IS NULL
LOOP
BEGIN
PERFORM secure_activate_building_queue(v_queue_item.planet_id);
EXCEPTION WHEN OTHERS THEN
NULL;
END;
END LOOP;

RETURN jsonb_build_object(
'success', true,
'completed_count', v_completed_count,
'error_count', v_error_count
);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4) bot_process_queues  (patch the building loop only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_process_queues(p_bot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bq RECORD;
  v_sq RECORD;
  v_ut RECORD;
  v_completed_qty integer;
  v_lunar_base_id integer;
BEGIN
  SELECT id INTO v_lunar_base_id FROM building_types WHERE code = 'lunar_base' LIMIT 1;

  -- 1. Process completed BUILDING queues
  FOR v_bq IN
    SELECT bq.*, p.user_id
    FROM building_queue bq
    JOIN planets p ON p.id = bq.planet_id
    WHERE p.user_id = p_bot_id
      AND bq.end_time <= now()
    ORDER BY bq.end_time ASC
  LOOP
    INSERT INTO planet_buildings (planet_id, building_type_id, level)
    VALUES (v_bq.planet_id, v_bq.building_type_id, v_bq.target_level)
    ON CONFLICT (planet_id, building_type_id)
    DO UPDATE SET level = v_bq.target_level;

    UPDATE planets SET fields_used = (
      SELECT COALESCE(SUM(level), 0) FROM planet_buildings WHERE planet_id = v_bq.planet_id
    ) WHERE id = v_bq.planet_id;

    -- [FIX 2026-05-06] Lunar base on moon: grant +3 fields per level
    IF v_lunar_base_id IS NOT NULL AND v_bq.building_type_id = v_lunar_base_id THEN
      UPDATE planets
      SET fields_max = GREATEST(fields_max, 1 + v_bq.target_level * 3)
      WHERE id = v_bq.planet_id AND planet_type = 'moon';
    END IF;

    DELETE FROM building_queue WHERE id = v_bq.id;
  END LOOP;

  -- 2. Process completed SHIPYARD queues
  FOR v_sq IN
    SELECT sq.*, p.user_id
    FROM shipyard_queue sq
    JOIN planets p ON p.id = sq.planet_id
    WHERE p.user_id = p_bot_id
    ORDER BY sq.start_time ASC
  LOOP
    IF v_sq.build_time_per_unit > 0 THEN
      v_completed_qty := LEAST(
        v_sq.quantity,
        v_sq.quantity_completed + FLOOR(EXTRACT(EPOCH FROM (now() - v_sq.start_time)) / v_sq.build_time_per_unit)::integer
      );
    ELSE
      v_completed_qty := v_sq.quantity;
    END IF;

    IF v_completed_qty > v_sq.quantity_completed THEN
      IF v_sq.item_type = 'ship' AND v_sq.ship_type_id IS NOT NULL THEN
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (v_sq.planet_id, v_sq.ship_type_id, v_completed_qty - v_sq.quantity_completed)
        ON CONFLICT (planet_id, ship_type_id)
        DO UPDATE SET quantity = planet_ships.quantity + (v_completed_qty - v_sq.quantity_completed);
      ELSIF v_sq.item_type = 'defense' AND v_sq.defense_type_id IS NOT NULL THEN
        INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
        VALUES (v_sq.planet_id, v_sq.defense_type_id, v_completed_qty - v_sq.quantity_completed)
        ON CONFLICT (planet_id, defense_type_id)
        DO UPDATE SET quantity = planet_defenses.quantity + (v_completed_qty - v_sq.quantity_completed);
      END IF;

      IF v_completed_qty >= v_sq.quantity THEN
        DELETE FROM shipyard_queue WHERE id = v_sq.id;
      ELSE
        UPDATE shipyard_queue SET
          quantity_completed = v_completed_qty,
          current_unit_end_time = v_sq.start_time + ((v_completed_qty + 1) * v_sq.build_time_per_unit || ' seconds')::interval
        WHERE id = v_sq.id;
      END IF;
    END IF;
  END LOOP;

  -- 3. Process completed RESEARCH
  FOR v_ut IN
    SELECT * FROM user_technologies
    WHERE user_id = p_bot_id
      AND is_researching = true
      AND research_end_time <= now()
  LOOP
    UPDATE user_technologies
    SET level = level + 1,
        is_researching = false,
        research_end_time = NULL,
        research_planet_id = NULL
    WHERE id = v_ut.id;
  END LOOP;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5) Backfill current broken moons (fields_max < expected)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_lb_id integer;
  v_fixed integer;
BEGIN
  SELECT id INTO v_lb_id FROM building_types WHERE code = 'lunar_base' LIMIT 1;
  IF v_lb_id IS NULL THEN
    RAISE NOTICE 'No lunar_base building type found, skipping backfill';
    RETURN;
  END IF;

  WITH fixed AS (
    UPDATE planets p
    SET fields_max = 1 + COALESCE(pb.level, 0) * 3
    FROM (
      SELECT p2.id AS planet_id, COALESCE(pb2.level, 0) AS level
      FROM planets p2
      LEFT JOIN planet_buildings pb2
        ON pb2.planet_id = p2.id AND pb2.building_type_id = v_lb_id
      WHERE p2.planet_type = 'moon'
        AND p2.fields_max < (1 + COALESCE(pb2.level, 0) * 3)
    ) pb
    WHERE p.id = pb.planet_id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_fixed FROM fixed;

  RAISE NOTICE 'Backfilled fields_max on % moon(s)', v_fixed;
END $$;
