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
WHERE sq.queue_position = 1
AND sq.current_unit_end_time IS NOT NULL
AND sq.current_unit_end_time <= NOW()
ORDER BY sq.current_unit_end_time ASC
LIMIT 100
LOOP
BEGIN
v_units_to_complete := LEAST(
1 + FLOOR(
EXTRACT(EPOCH FROM (NOW() - v_queue_item.current_unit_end_time))
/ GREATEST(1, v_queue_item.build_time_per_unit)
)::integer,
v_queue_item.quantity - v_queue_item.quantity_completed
);

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

IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
DELETE FROM shipyard_queue WHERE id = v_queue_item.id;
UPDATE shipyard_queue
SET queue_position = queue_position - 1,
start_time = CASE WHEN queue_position = v_queue_item.queue_position + 1 THEN NOW() ELSE start_time END,
current_unit_end_time = CASE WHEN queue_position = v_queue_item.queue_position + 1
THEN NOW() + (build_time_per_unit || ' seconds')::interval
ELSE current_unit_end_time END
WHERE planet_id = v_queue_item.planet_id AND item_type = v_queue_item.item_type AND queue_position > v_queue_item.queue_position;
ELSE
UPDATE shipyard_queue
SET quantity_completed = quantity_completed + v_units_to_complete,
current_unit_end_time = NOW() + (v_queue_item.build_time_per_unit || ' seconds')::interval
WHERE id = v_queue_item.id;
END IF;

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

