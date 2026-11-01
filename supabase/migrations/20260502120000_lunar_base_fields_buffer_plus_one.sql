-- =====================================================================
-- FIX: Aumentar fields_max de las lunas en +1 (buffer de campo libre).
--
-- Fórmula anterior: fields_max = 1 + (lunar_base_level * 3)
-- Fórmula nueva:    fields_max = 2 + (lunar_base_level * 3)
--
-- Motivo: dejar siempre 1 campo libre tras construir la Base Lunar para
-- que el jugador pueda iniciar la siguiente mejora sin quedarse atascado.
--
-- Lunas afectadas: TODAS. Recálculo masivo con GREATEST(fields_used, ...)
-- para no romper a quienes ya están sobreocupados (Lucifer, etc.).
--
-- Funciones recreadas con la fórmula nueva:
--   - admin_process_stuck_building_queues
--   - bot_process_queues
--   - enforce_lunar_base_fields_max
--   - global_process_all_expired_queues
--   - optimized_global_queue_processor
--   - process_all_user_building_queues
-- =====================================================================

-- ---------- admin_process_stuck_building_queues (1 reemplazo) ----------
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
  SET fields_max = GREATEST(fields_max, 2 + v_queue_item.target_level * 3)
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
$function$
;

-- ---------- bot_process_queues (1 reemplazo) ----------
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
      SET fields_max = GREATEST(fields_max, 2 + v_bq.target_level * 3)
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
$function$
;

-- ---------- enforce_lunar_base_fields_max (1 reemplazo) ----------
CREATE OR REPLACE FUNCTION public.enforce_lunar_base_fields_max()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lunar_base_id integer;
  v_planet_type text;
  v_expected_max integer;
BEGIN
  -- Solo actúa si esta fila corresponde a la Base Lunar.
  SELECT id INTO v_lunar_base_id FROM building_types WHERE code = 'lunar_base' LIMIT 1;
  IF v_lunar_base_id IS NULL OR NEW.building_type_id <> v_lunar_base_id THEN
    RETURN NEW;
  END IF;

  -- Solo en lunas.
  SELECT planet_type INTO v_planet_type FROM planets WHERE id = NEW.planet_id;
  IF v_planet_type IS DISTINCT FROM 'moon' THEN
    RETURN NEW;
  END IF;

  -- fields_max >= 1 + level*3. Nunca reduce (GREATEST).
  v_expected_max := 2 + COALESCE(NEW.level, 0) * 3;

  UPDATE planets
     SET fields_max = GREATEST(fields_max, v_expected_max)
   WHERE id = NEW.planet_id
     AND fields_max < v_expected_max;

  RETURN NEW;
END;
$function$
;

-- ---------- global_process_all_expired_queues (1 reemplazo) ----------
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
  SET fields_max = GREATEST(fields_max, 2 + v_queue_item.target_level * 3)
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
$function$
;

-- ---------- optimized_global_queue_processor (1 reemplazo) ----------
CREATE OR REPLACE FUNCTION public.optimized_global_queue_processor()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
SET fields_max = 2 + (v_queue_item.target_level * 3)
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
        ), 0) + COALESCE((
          SELECT SUM((st2.metal_cost + st2.crystal_cost + st2.deuterium_cost) * fs.quantity / 1000)
          FROM fleet_ships fs
          JOIN fleets fl ON fl.id = fs.fleet_id
          JOIN ship_types st2 ON st2.id = fs.ship_type_id
          WHERE fl.user_id = p.id AND fl.is_completed = false AND fs.quantity > 0
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
-- Rankings moved to separate cron job (every 10h)

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

$function$
;

-- ---------- process_all_user_building_queues (1 reemplazo) ----------
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
SET fields_max = GREATEST(p.fields_max, 2 + c.target_level * 3)
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
$function$
;

-- ---------- Recalcular fields_max de TODAS las lunas existentes ----------
-- Usa GREATEST(fields_used, 2 + level*3) para no reducir bajo lo ya construido.
WITH moon_lb AS (
  SELECT p.id AS planet_id,
         p.fields_used,
         p.fields_max AS old_max,
         COALESCE(pb.level, 0) AS lb_level,
         GREATEST(p.fields_used, 2 + COALESCE(pb.level, 0) * 3) AS new_max
  FROM planets p
  LEFT JOIN planet_buildings pb
    ON pb.planet_id = p.id AND pb.building_type_id = 15
  WHERE p.planet_type = 'moon'
)
UPDATE planets p
SET fields_max = m.new_max
FROM moon_lb m
WHERE p.id = m.planet_id
  AND p.fields_max <> m.new_max;

-- ---------- Verificación post-fix ----------
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM planets p
  LEFT JOIN planet_buildings pb
    ON pb.planet_id = p.id AND pb.building_type_id = 15
  WHERE p.planet_type = 'moon'
    AND p.fields_max < 2 + COALESCE(pb.level, 0) * 3
    AND p.fields_max < p.fields_used;
  IF v_bad > 0 THEN
    RAISE WARNING 'Quedan % lunas con fields_max menor al esperado', v_bad;
  ELSE
    RAISE NOTICE 'OK: todas las lunas cumplen la nueva fórmula (o el sobre-uso lo justifica).';
  END IF;
END$$;
