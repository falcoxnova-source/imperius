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
$function$

