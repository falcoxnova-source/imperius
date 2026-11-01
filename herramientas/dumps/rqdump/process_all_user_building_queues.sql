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
$function$

