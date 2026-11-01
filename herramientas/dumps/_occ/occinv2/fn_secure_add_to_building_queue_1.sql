CREATE OR REPLACE FUNCTION public.secure_add_to_building_queue(p_planet_id uuid, p_building_type_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

 
DECLARE
v_validation jsonb;
v_planet RECORD;
v_building_type RECORD;
v_current_level integer;
v_queued_count integer;
v_target_level integer;
v_resources RECORD;
v_cost_metal bigint;
v_cost_crystal bigint;
v_cost_deuterium bigint;
v_queue_position integer;
v_robotics_level integer;
v_nanite_level integer;
v_build_time integer;
v_is_first boolean;
v_start_time timestamptz;
v_end_time timestamptz;
v_total_queued_levels integer;
v_game_speed integer;
v_is_moon boolean;
v_moon_only_buildings text[];
v_planet_only_buildings text[];
v_has_active_research boolean;
BEGIN
IF auth.uid() IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
END IF;

IF is_user_in_vacation_mode(auth.uid()) THEN
RETURN jsonb_build_object('success', false, 'error', 'Cannot build while in vacation mode');
END IF;

SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
END IF;

SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Building type not found');
END IF;

v_is_moon := v_planet.planet_type = 'moon';
v_moon_only_buildings := get_moon_only_buildings();
v_planet_only_buildings := get_planet_only_buildings();

IF v_building_type.code = ANY(v_moon_only_buildings) AND NOT v_is_moon THEN
RETURN jsonb_build_object('success', false, 'error', 'This building can only be built on a moon');
END IF;

IF v_building_type.code = ANY(v_planet_only_buildings) AND v_is_moon THEN
RETURN jsonb_build_object('success', false, 'error', 'This building cannot be built on a moon');
END IF;

IF v_building_type.code = 'research_lab' THEN
SELECT EXISTS(
SELECT 1 FROM user_technologies
WHERE user_id = auth.uid() AND is_researching = true
) INTO v_has_active_research;

IF v_has_active_research THEN
RETURN jsonb_build_object('success', false, 'error', 'Cannot upgrade Research Lab while research is in progress');
END IF;
END IF;

SELECT COALESCE(COUNT(*), 0) INTO v_total_queued_levels FROM building_queue WHERE planet_id = p_planet_id;
IF (v_planet.fields_used + v_total_queued_levels) >= v_planet.fields_max THEN
RETURN jsonb_build_object('success', false, 'error', 'No available fields on planet');
END IF;

v_validation := validate_building_requirements(p_planet_id, p_building_type_id);
IF NOT (v_validation->>'valid')::boolean THEN
RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
END IF;

SELECT COALESCE(pb.level, 0) INTO v_current_level
FROM planet_buildings pb
WHERE pb.planet_id = p_planet_id AND pb.building_type_id = p_building_type_id;
IF v_current_level IS NULL THEN v_current_level := 0; END IF;

SELECT COUNT(*) INTO v_queued_count
FROM building_queue
WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;

v_target_level := v_current_level + v_queued_count + 1;

IF v_target_level > v_building_type.max_level THEN
RETURN jsonb_build_object('success', false, 'error', 'Max level reached');
END IF;

v_cost_metal := FLOOR(v_building_type.base_metal * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));
v_cost_crystal := FLOOR(v_building_type.base_crystal * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));
v_cost_deuterium := FLOOR(v_building_type.base_deuterium * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));

SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
IF v_resources.metal < v_cost_metal OR v_resources.crystal < v_cost_crystal OR v_resources.deuterium < v_cost_deuterium THEN
RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
END IF;

SELECT COALESCE(COUNT(*), 0) + 1 INTO v_queue_position FROM building_queue WHERE planet_id = p_planet_id;

SELECT COALESCE(pb.level, 0) INTO v_robotics_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'robotics_factory';
IF v_robotics_level IS NULL THEN v_robotics_level := 0; END IF;

SELECT COALESCE(pb.level, 0) INTO v_nanite_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';
IF v_nanite_level IS NULL THEN v_nanite_level := 0; END IF;

v_game_speed := get_game_speed();

v_build_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed));

-- VIP Plus: time bonus (game_settings.vip_time_speed_multiplier)
v_build_time := public.apply_vip_time_bonus(auth.uid(), v_build_time);

v_is_first := v_queue_position = 1;
IF v_is_first THEN
v_start_time := now();
v_end_time := now() + (v_build_time || ' seconds')::interval;
ELSE
v_start_time := NULL;
v_end_time := NULL;
END IF;

UPDATE planet_resources
SET metal = metal - v_cost_metal,
crystal = crystal - v_cost_crystal,
deuterium = deuterium - v_cost_deuterium,
last_update = now()
WHERE planet_id = p_planet_id;

INSERT INTO building_queue (
planet_id, building_type_id, target_level,
metal_cost, crystal_cost, deuterium_cost,
build_time, queue_position, start_time, end_time, status
) VALUES (
p_planet_id, p_building_type_id, v_target_level,
v_cost_metal, v_cost_crystal, v_cost_deuterium,
v_build_time, v_queue_position, v_start_time, v_end_time, 'building'
);

RETURN jsonb_build_object('success', true, 'target_level', v_target_level, 'build_time', v_build_time);
END;
 

$function$

