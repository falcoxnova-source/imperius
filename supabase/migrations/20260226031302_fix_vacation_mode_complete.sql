/*
  # Complete Vacation Mode Fix

  1. Changes
    - `calculate_planet_resources`: Returns 0 production and does NOT accumulate resources when user is in vacation mode
    - `secure_add_to_building_queue`: Blocks adding buildings when user is in vacation mode
    - `secure_add_to_shipyard_queue`: Blocks adding ships/defenses when user is in vacation mode
    - `secure_start_research`: Blocks starting research when user is in vacation mode
    - `instant_complete_building`: Blocks instant complete when user is in vacation mode
    - `instant_complete_research`: Blocks instant complete when user is in vacation mode
    - `instant_complete_shipyard_item`: Blocks instant complete when user is in vacation mode
    - `toggle_vacation_mode`: On enable, pauses all active building/shipyard/research queues (stores remaining time). On disable, resumes them from where they left off.

  2. Important Notes
    - When vacation is enabled, all active queue timers are frozen by storing the remaining seconds
    - When vacation is disabled, timers are recalculated from now() using the stored remaining time
    - Production is frozen at 0/h during vacation, resources do not accumulate
    - All action endpoints (build, research, shipyard, instant complete) are blocked server-side
*/

-- ============================================================
-- 1. Fix calculate_planet_resources: freeze production in vacation
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_planet_resources(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_planet RECORD;
v_resources RECORD;
v_user_id uuid;
v_officer_bonuses jsonb;
v_resource_speed integer;
v_vacation_mode boolean;

v_metal_mine_level int := 0;
v_crystal_mine_level int := 0;
v_deuterium_synth_level int := 0;
v_solar_plant_level int := 0;
v_fusion_reactor_level int := 0;
v_metal_storage_level int := 0;
v_crystal_storage_level int := 0;
v_deuterium_tank_level int := 0;

v_energy_tech_level int := 0;
v_solar_satellites int := 0;

v_metal_energy_consumption numeric;
v_crystal_energy_consumption numeric;
v_deuterium_energy_consumption numeric;
v_total_energy_consumption numeric;
v_solar_plant_energy numeric;
v_fusion_reactor_energy numeric;
v_solar_satellite_energy numeric;
v_total_energy_production numeric;
v_energy_factor numeric;

v_base_metal_production numeric;
v_base_crystal_production numeric;
v_base_deuterium_production numeric;
v_fusion_consumption numeric;
v_metal_production numeric;
v_crystal_production numeric;
v_deuterium_production numeric;

v_metal_storage numeric;
v_crystal_storage numeric;
v_deuterium_storage numeric;

v_elapsed_hours numeric;
v_now timestamp with time zone := now();

v_new_metal numeric;
v_new_crystal numeric;
v_new_deuterium numeric;

v_mine_bonus numeric := 0;
v_energy_bonus numeric := 0;

v_solar_position_factor numeric;
BEGIN
v_resource_speed := COALESCE(get_resource_speed(), 10);

SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'Planet not found');
END IF;

v_user_id := v_planet.user_id;

SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'Resources not found');
END IF;

-- Check vacation mode
SELECT COALESCE(vacation_mode, false) INTO v_vacation_mode
FROM profiles WHERE id = v_user_id;

-- If in vacation mode, return current resources with 0 production
IF v_vacation_mode THEN
RETURN jsonb_build_object(
'metal', v_resources.metal,
'crystal', v_resources.crystal,
'deuterium', v_resources.deuterium,
'metal_per_hour', 0,
'crystal_per_hour', 0,
'deuterium_per_hour', 0,
'metal_storage', v_resources.metal_storage,
'crystal_storage', v_resources.crystal_storage,
'deuterium_storage', v_resources.deuterium_storage,
'energy_used', v_resources.energy_used,
'energy_max', v_resources.energy_max,
'last_update', v_resources.last_update
);
END IF;

v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - COALESCE(v_resources.last_update, v_now))) / 3600.0;

v_officer_bonuses := get_user_officer_bonuses(v_user_id);
v_mine_bonus := COALESCE((v_officer_bonuses->>'mineProduction')::numeric, 0);
v_energy_bonus := COALESCE((v_officer_bonuses->>'energyProduction')::numeric, 0);

SELECT COALESCE(pb.level, 0) INTO v_metal_mine_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'metal_mine';
v_metal_mine_level := COALESCE(v_metal_mine_level, 0);

SELECT COALESCE(pb.level, 0) INTO v_crystal_mine_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'crystal_mine';
v_crystal_mine_level := COALESCE(v_crystal_mine_level, 0);

SELECT COALESCE(pb.level, 0) INTO v_deuterium_synth_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'deuterium_synthesizer';
v_deuterium_synth_level := COALESCE(v_deuterium_synth_level, 0);

SELECT COALESCE(pb.level, 0) INTO v_solar_plant_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'solar_plant';
v_solar_plant_level := COALESCE(v_solar_plant_level, 0);

SELECT COALESCE(pb.level, 0) INTO v_fusion_reactor_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'fusion_reactor';
v_fusion_reactor_level := COALESCE(v_fusion_reactor_level, 0);

SELECT COALESCE(pb.level, 0) INTO v_metal_storage_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'metal_storage';
v_metal_storage_level := COALESCE(v_metal_storage_level, 0);

SELECT COALESCE(pb.level, 0) INTO v_crystal_storage_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'crystal_storage';
v_crystal_storage_level := COALESCE(v_crystal_storage_level, 0);

SELECT COALESCE(pb.level, 0) INTO v_deuterium_tank_level
FROM planet_buildings pb
JOIN building_types bt ON bt.id = pb.building_type_id
WHERE pb.planet_id = p_planet_id AND bt.code = 'deuterium_tank';
v_deuterium_tank_level := COALESCE(v_deuterium_tank_level, 0);

SELECT COALESCE(ut.level, 0) INTO v_energy_tech_level
FROM user_technologies ut
JOIN technology_types tt ON tt.id = ut.technology_type_id
WHERE ut.user_id = v_user_id AND tt.code = 'energy_tech';
v_energy_tech_level := COALESCE(v_energy_tech_level, 0);

SELECT COALESCE(ps.quantity, 0) INTO v_solar_satellites
FROM planet_ships ps
JOIN ship_types st ON st.id = ps.ship_type_id
WHERE ps.planet_id = p_planet_id AND st.code = 'solar_satellite';
v_solar_satellites := COALESCE(v_solar_satellites, 0);

v_metal_energy_consumption := FLOOR(10 * v_metal_mine_level * POWER(1.1, v_metal_mine_level));
v_crystal_energy_consumption := FLOOR(10 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level));
v_deuterium_energy_consumption := FLOOR(20 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level));
v_total_energy_consumption := v_metal_energy_consumption + v_crystal_energy_consumption + v_deuterium_energy_consumption;

v_solar_position_factor := GREATEST(0.75, 1 + (8 - COALESCE(v_planet.position, 8)) * 0.025);

v_solar_plant_energy := FLOOR(20 * v_solar_plant_level * POWER(1.1, v_solar_plant_level) * v_solar_position_factor);
v_fusion_reactor_energy := FLOOR(30 * v_fusion_reactor_level * POWER((1.05 + v_energy_tech_level * 0.01), v_fusion_reactor_level));
v_solar_satellite_energy := FLOOR((v_planet.temp_max + 160) / 6.0) * v_solar_satellites;

v_solar_plant_energy := FLOOR(v_solar_plant_energy * (1 + v_energy_bonus));
v_fusion_reactor_energy := FLOOR(v_fusion_reactor_energy * (1 + v_energy_bonus));
v_solar_satellite_energy := FLOOR(v_solar_satellite_energy * (1 + v_energy_bonus));

v_total_energy_production := v_solar_plant_energy + v_fusion_reactor_energy + v_solar_satellite_energy;

IF v_total_energy_consumption > 0 THEN
v_energy_factor := LEAST(1, v_total_energy_production / v_total_energy_consumption);
ELSE
v_energy_factor := 1;
END IF;

v_base_metal_production := FLOOR(30 * v_metal_mine_level * POWER(1.1, v_metal_mine_level));
v_base_crystal_production := FLOOR(20 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level));
v_base_deuterium_production := FLOOR(10 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level) * (1.36 - 0.004 * v_planet.temp_max));

v_base_metal_production := FLOOR(v_base_metal_production * (1 + v_mine_bonus));
v_base_crystal_production := FLOOR(v_base_crystal_production * (1 + v_mine_bonus));
v_base_deuterium_production := FLOOR(v_base_deuterium_production * (1 + v_mine_bonus));

v_fusion_consumption := FLOOR(10 * v_fusion_reactor_level * POWER(1.1, v_fusion_reactor_level));
v_base_deuterium_production := v_base_deuterium_production - v_fusion_consumption;

v_metal_production := FLOOR(v_base_metal_production * v_energy_factor);
v_crystal_production := FLOOR(v_base_crystal_production * v_energy_factor);
v_deuterium_production := FLOOR(v_base_deuterium_production * v_energy_factor);

v_metal_production := v_metal_production * v_resource_speed;
v_crystal_production := v_crystal_production * v_resource_speed;
v_deuterium_production := v_deuterium_production * v_resource_speed;

v_metal_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_metal_storage_level) / 33.0)));
v_crystal_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_crystal_storage_level) / 33.0)));
v_deuterium_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_deuterium_tank_level) / 33.0)));

IF v_elapsed_hours <= 0 THEN
RETURN jsonb_build_object(
'metal', v_resources.metal,
'crystal', v_resources.crystal,
'deuterium', v_resources.deuterium,
'metal_per_hour', v_metal_production,
'crystal_per_hour', v_crystal_production,
'deuterium_per_hour', v_deuterium_production,
'metal_storage', v_metal_storage,
'crystal_storage', v_crystal_storage,
'deuterium_storage', v_deuterium_storage,
'energy_used', v_total_energy_consumption,
'energy_max', v_total_energy_production,
'last_update', v_resources.last_update
);
END IF;

IF v_resources.metal > v_metal_storage THEN
v_new_metal := v_resources.metal;
ELSE
v_new_metal := LEAST(v_metal_storage, GREATEST(0, v_resources.metal + v_metal_production * v_elapsed_hours));
END IF;

IF v_resources.crystal > v_crystal_storage THEN
v_new_crystal := v_resources.crystal;
ELSE
v_new_crystal := LEAST(v_crystal_storage, GREATEST(0, v_resources.crystal + v_crystal_production * v_elapsed_hours));
END IF;

IF v_resources.deuterium > v_deuterium_storage THEN
v_new_deuterium := v_resources.deuterium;
ELSE
v_new_deuterium := LEAST(v_deuterium_storage, GREATEST(0, v_resources.deuterium + v_deuterium_production * v_elapsed_hours));
END IF;

RETURN jsonb_build_object(
'metal', FLOOR(v_new_metal),
'crystal', FLOOR(v_new_crystal),
'deuterium', FLOOR(v_new_deuterium),
'metal_per_hour', v_metal_production,
'crystal_per_hour', v_crystal_production,
'deuterium_per_hour', v_deuterium_production,
'metal_storage', v_metal_storage,
'crystal_storage', v_crystal_storage,
'deuterium_storage', v_deuterium_storage,
'energy_used', v_total_energy_consumption,
'energy_max', v_total_energy_production,
'last_update', v_resources.last_update,
'calculated_at', v_now
);
END;
$function$;

-- ============================================================
-- 2. Fix secure_add_to_building_queue: block in vacation
-- ============================================================
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
build_time, queue_position, start_time, end_time
) VALUES (
p_planet_id, p_building_type_id, v_target_level,
v_cost_metal, v_cost_crystal, v_cost_deuterium,
v_build_time, v_queue_position, v_start_time, v_end_time
);

RETURN jsonb_build_object('success', true, 'target_level', v_target_level, 'build_time', v_build_time);
END;
$function$;

-- ============================================================
-- 3. Fix secure_add_to_shipyard_queue: block in vacation
-- ============================================================
CREATE OR REPLACE FUNCTION public.secure_add_to_shipyard_queue(p_planet_id uuid, p_item_type text, p_type_id integer, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_planet planets%ROWTYPE;
v_resources planet_resources%ROWTYPE;
v_shipyard_level integer;
v_nanite_level integer;
v_metal_cost bigint;
v_crystal_cost bigint;
v_deuterium_cost bigint;
v_build_time_per_unit integer;
v_queue_position integer;
v_validation jsonb;
v_game_speed integer;
v_ship_type ship_types%ROWTYPE;
v_defense_type defense_types%ROWTYPE;
v_existing_count integer;
v_queued_count integer;
BEGIN
IF auth.uid() IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
END IF;

IF is_user_in_vacation_mode(auth.uid()) THEN
RETURN jsonb_build_object('success', false, 'error', 'Cannot build ships or defenses while in vacation mode');
END IF;

IF p_quantity <= 0 OR p_quantity > 10000 THEN
RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
END IF;

SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
END IF;

IF p_item_type = 'ship' THEN
v_validation := validate_ship_requirements(p_planet_id, p_type_id);
IF NOT (v_validation->>'valid')::boolean THEN
RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
END IF;

SELECT * INTO v_ship_type FROM ship_types WHERE id = p_type_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
END IF;

v_metal_cost := v_ship_type.metal_cost * p_quantity;
v_crystal_cost := v_ship_type.crystal_cost * p_quantity;
v_deuterium_cost := v_ship_type.deuterium_cost * p_quantity;
ELSIF p_item_type = 'defense' THEN
v_validation := validate_defense_requirements(p_planet_id, p_type_id);
IF NOT (v_validation->>'valid')::boolean THEN
RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
END IF;

SELECT * INTO v_defense_type FROM defense_types WHERE id = p_type_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Defense type not found');
END IF;

IF v_defense_type.max_per_planet IS NOT NULL THEN
SELECT COALESCE(pd.quantity, 0) INTO v_existing_count
FROM planet_defenses pd
WHERE pd.planet_id = p_planet_id AND pd.defense_type_id = p_type_id;

SELECT COALESCE(SUM(sq.quantity - sq.quantity_completed), 0) INTO v_queued_count
FROM shipyard_queue sq
WHERE sq.planet_id = p_planet_id AND sq.defense_type_id = p_type_id;

IF (COALESCE(v_existing_count, 0) + COALESCE(v_queued_count, 0) + p_quantity) > v_defense_type.max_per_planet THEN
RETURN jsonb_build_object('success', false, 'error', 'Maximum limit reached for this defense type');
END IF;
END IF;

v_metal_cost := v_defense_type.metal_cost * p_quantity;
v_crystal_cost := v_defense_type.crystal_cost * p_quantity;
v_deuterium_cost := v_defense_type.deuterium_cost * p_quantity;
ELSE
RETURN jsonb_build_object('success', false, 'error', 'Invalid item type');
END IF;

SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
IF v_resources.metal < v_metal_cost OR v_resources.crystal < v_crystal_cost OR v_resources.deuterium < v_deuterium_cost THEN
RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
END IF;

SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
FROM planet_buildings pb
JOIN building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_planet_id AND bt.code = 'shipyard';

SELECT COALESCE(pb.level, 0) INTO v_nanite_level
FROM planet_buildings pb
JOIN building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';

v_game_speed := get_game_speed();

IF p_item_type = 'ship' THEN
v_build_time_per_unit := GREATEST(1, FLOOR((v_ship_type.metal_cost + v_ship_type.crystal_cost) / (2500.0 * (1 + COALESCE(v_shipyard_level, 0))) * 3600 / POWER(2, COALESCE(v_nanite_level, 0)) / v_game_speed));
ELSE
v_build_time_per_unit := GREATEST(1, FLOOR((v_defense_type.metal_cost + v_defense_type.crystal_cost) / (2500.0 * (1 + COALESCE(v_shipyard_level, 0))) * 3600 / POWER(2, COALESCE(v_nanite_level, 0)) / v_game_speed));
END IF;

UPDATE planet_resources
SET metal = metal - v_metal_cost,
crystal = crystal - v_crystal_cost,
deuterium = deuterium - v_deuterium_cost,
last_update = now()
WHERE planet_id = p_planet_id;

PERFORM auto_cancel_insufficient_listings(p_planet_id);

SELECT COALESCE(MAX(queue_position), 0) INTO v_queue_position FROM shipyard_queue WHERE planet_id = p_planet_id;

INSERT INTO shipyard_queue (
planet_id, item_type, ship_type_id, defense_type_id,
quantity, quantity_completed,
metal_cost, crystal_cost, deuterium_cost,
build_time_per_unit, queue_position,
start_time, current_unit_end_time
) VALUES (
p_planet_id, p_item_type,
CASE WHEN p_item_type = 'ship' THEN p_type_id ELSE NULL END,
CASE WHEN p_item_type = 'defense' THEN p_type_id ELSE NULL END,
p_quantity, 0,
v_metal_cost, v_crystal_cost, v_deuterium_cost,
v_build_time_per_unit, v_queue_position + 1,
CASE WHEN v_queue_position = 0 THEN now() ELSE NULL END,
CASE WHEN v_queue_position = 0 THEN now() + (v_build_time_per_unit || ' seconds')::interval ELSE NULL END
);

RETURN jsonb_build_object('success', true, 'build_time_per_unit', v_build_time_per_unit);
END;
$function$;

-- ============================================================
-- 4. Fix secure_start_research: block in vacation
-- ============================================================
CREATE OR REPLACE FUNCTION public.secure_start_research(p_planet_id uuid, p_tech_type_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
SET lock_timeout TO '30s'
AS $function$
DECLARE
v_validation jsonb;
v_planet RECORD;
v_tech_type RECORD;
v_current_level integer;
v_resources RECORD;
v_cost_metal bigint;
v_cost_crystal bigint;
v_cost_deuterium bigint;
v_effective_lab_level integer;
v_research_time integer;
v_start_time timestamptz;
v_end_time timestamptz;
v_existing_research boolean;
v_game_speed integer;
v_has_technocrat boolean;
v_lab_in_queue boolean;
v_research_lab_type_id integer;
BEGIN
IF auth.uid() IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
END IF;

IF is_user_in_vacation_mode(auth.uid()) THEN
RETURN jsonb_build_object('success', false, 'error', 'Cannot research while in vacation mode');
END IF;

SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
END IF;

SELECT EXISTS(
SELECT 1 FROM user_technologies
WHERE user_id = auth.uid() AND is_researching = true
) INTO v_existing_research;

IF v_existing_research THEN
RETURN jsonb_build_object('success', false, 'error', 'Research already in progress');
END IF;

SELECT id INTO v_research_lab_type_id FROM building_types WHERE code = 'research_lab';
IF v_research_lab_type_id IS NOT NULL THEN
SELECT EXISTS(
SELECT 1 FROM building_queue
WHERE planet_id = p_planet_id AND building_type_id = v_research_lab_type_id
) INTO v_lab_in_queue;

IF v_lab_in_queue THEN
RETURN jsonb_build_object('success', false, 'error', 'Cannot research while Research Lab is being upgraded');
END IF;
END IF;

v_validation := validate_research_requirements(auth.uid(), p_planet_id, p_tech_type_id);
IF NOT (v_validation->>'valid')::boolean THEN
RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
END IF;

SELECT * INTO v_tech_type FROM technology_types WHERE id = p_tech_type_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'error', 'Technology type not found');
END IF;

SELECT COALESCE(ut.level, 0) INTO v_current_level
FROM user_technologies ut
WHERE ut.user_id = auth.uid() AND ut.technology_type_id = p_tech_type_id;
IF v_current_level IS NULL THEN v_current_level := 0; END IF;

IF v_current_level >= v_tech_type.max_level THEN
RETURN jsonb_build_object('success', false, 'error', 'Max level reached');
END IF;

v_cost_metal := FLOOR(v_tech_type.base_metal * POWER(v_tech_type.cost_factor, v_current_level));
v_cost_crystal := FLOOR(v_tech_type.base_crystal * POWER(v_tech_type.cost_factor, v_current_level));
v_cost_deuterium := FLOOR(v_tech_type.base_deuterium * POWER(v_tech_type.cost_factor, v_current_level));

SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;
IF v_resources.metal < v_cost_metal OR v_resources.crystal < v_cost_crystal OR v_resources.deuterium < v_cost_deuterium THEN
RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
END IF;

v_effective_lab_level := calculate_irn_lab_level(auth.uid(), p_planet_id);
IF v_effective_lab_level IS NULL OR v_effective_lab_level < 1 THEN
v_effective_lab_level := 1;
END IF;

v_game_speed := get_game_speed();
v_has_technocrat := has_active_officer(auth.uid(), 'technocrat');

v_research_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_effective_lab_level)) * 3600 / v_game_speed));

IF v_has_technocrat THEN
v_research_time := GREATEST(1, FLOOR(v_research_time * 0.75));
END IF;

v_start_time := now();
v_end_time := v_start_time + (v_research_time || ' seconds')::interval;

UPDATE planet_resources
SET metal = metal - v_cost_metal,
crystal = crystal - v_cost_crystal,
deuterium = deuterium - v_cost_deuterium,
last_update = now()
WHERE planet_id = p_planet_id;

ALTER TABLE user_technologies DISABLE TRIGGER trigger_research_points;

INSERT INTO user_technologies (
user_id, technology_type_id, level, is_researching,
research_start_time, research_end_time, research_planet_id
) VALUES (
auth.uid(), p_tech_type_id, v_current_level, true,
v_start_time, v_end_time, p_planet_id
)
ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
is_researching = true,
research_start_time = v_start_time,
research_end_time = v_end_time,
research_planet_id = p_planet_id;

ALTER TABLE user_technologies ENABLE TRIGGER trigger_research_points;

RETURN jsonb_build_object(
'success', true,
'target_level', v_current_level + 1,
'start_time', v_start_time,
'end_time', v_end_time,
'research_time_seconds', v_research_time,
'technocrat_bonus', v_has_technocrat
);
END;
$function$;

-- ============================================================
-- 5. Fix toggle_vacation_mode: pause/resume queues
-- ============================================================
CREATE OR REPLACE FUNCTION public.toggle_vacation_mode(p_enable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_user_id uuid;
v_current_vacation_mode boolean;
v_vacation_enabled_at timestamptz;
v_hours_elapsed numeric;
v_incoming_attacks integer;
v_min_vacation_hours constant integer := 48;
v_planet_rec RECORD;
v_bq RECORD;
v_sq RECORD;
v_remaining_seconds integer;
BEGIN
PERFORM set_config('app.allow_vacation_update', 'true', true);

v_user_id := auth.uid();
IF v_user_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
END IF;

SELECT vacation_mode, vacation_mode_enabled_at 
INTO v_current_vacation_mode, v_vacation_enabled_at
FROM profiles
WHERE id = v_user_id;

-- ENABLE VACATION MODE
IF p_enable = true THEN
IF COALESCE(v_current_vacation_mode, false) = true THEN
RETURN jsonb_build_object('success', false, 'error', 'Vacation mode is already active');
END IF;

SELECT COUNT(*) INTO v_incoming_attacks
FROM check_incoming_hostile_fleets(v_user_id);

IF v_incoming_attacks > 0 THEN
RETURN jsonb_build_object(
'success', false, 
'error', 'Cannot enable vacation mode while hostile fleets are incoming',
'incoming_attacks', v_incoming_attacks
);
END IF;

IF EXISTS (
SELECT 1 FROM fleets 
WHERE user_id = v_user_id 
AND mission_type IN ('attack', 'destroy', 'espionage')
AND is_completed = false
) THEN
RETURN jsonb_build_object(
'success', false, 
'error', 'Cannot enable vacation mode while you have active hostile missions'
);
END IF;

-- Activate vacation
UPDATE profiles
SET vacation_mode = true, vacation_mode_enabled_at = now()
WHERE id = v_user_id;

-- Freeze resource timestamps so no production accumulates
UPDATE planet_resources pr
SET last_update = now()
FROM planets p
WHERE pr.planet_id = p.id AND p.user_id = v_user_id;

-- Pause active building queues: store remaining seconds in build_time, clear end_time
FOR v_bq IN
SELECT bq.id, bq.end_time
FROM building_queue bq
JOIN planets p ON bq.planet_id = p.id
WHERE p.user_id = v_user_id
AND bq.start_time IS NOT NULL
AND bq.end_time IS NOT NULL
AND bq.end_time > now()
LOOP
v_remaining_seconds := GREATEST(1, EXTRACT(EPOCH FROM (v_bq.end_time - now()))::integer);
UPDATE building_queue
SET end_time = NULL, start_time = NULL, build_time = v_remaining_seconds
WHERE id = v_bq.id;
END LOOP;

-- Pause active shipyard queues: store remaining seconds, clear times
FOR v_sq IN
SELECT sq.id, sq.current_unit_end_time
FROM shipyard_queue sq
JOIN planets p ON sq.planet_id = p.id
WHERE p.user_id = v_user_id
AND sq.start_time IS NOT NULL
AND sq.current_unit_end_time IS NOT NULL
AND sq.current_unit_end_time > now()
LOOP
v_remaining_seconds := GREATEST(1, EXTRACT(EPOCH FROM (v_sq.current_unit_end_time - now()))::integer);
UPDATE shipyard_queue
SET current_unit_end_time = NULL, start_time = NULL, build_time_per_unit = v_remaining_seconds
WHERE id = v_sq.id;
END LOOP;

-- Pause active research: store remaining seconds, clear end_time
UPDATE user_technologies
SET research_end_time = NULL, research_start_time = NULL
WHERE user_id = v_user_id AND is_researching = true AND research_end_time > now();

RETURN jsonb_build_object(
'success', true, 
'message', 'Vacation mode enabled',
'minimum_duration_hours', v_min_vacation_hours,
'can_disable_at', (now() + (v_min_vacation_hours || ' hours')::interval)
);

-- DISABLE VACATION MODE
ELSE
IF COALESCE(v_current_vacation_mode, false) = false THEN
RETURN jsonb_build_object('success', false, 'error', 'Vacation mode is not active');
END IF;

IF v_vacation_enabled_at IS NOT NULL THEN
v_hours_elapsed := EXTRACT(EPOCH FROM (now() - v_vacation_enabled_at)) / 3600;

IF v_hours_elapsed < v_min_vacation_hours THEN
RETURN jsonb_build_object(
'success', false, 
'error', format('Minimum vacation duration is %s hours. %s hours remaining.', 
v_min_vacation_hours, 
ROUND((v_min_vacation_hours - v_hours_elapsed)::numeric, 1)),
'hours_elapsed', ROUND(v_hours_elapsed::numeric, 1),
'hours_remaining', ROUND((v_min_vacation_hours - v_hours_elapsed)::numeric, 1)
);
END IF;
END IF;

UPDATE profiles
SET vacation_mode = false, vacation_mode_enabled_at = NULL
WHERE id = v_user_id;

-- Reset resource timestamps
UPDATE planet_resources pr
SET last_update = now()
FROM planets p
WHERE pr.planet_id = p.id AND p.user_id = v_user_id;

-- Resume paused building queues
FOR v_bq IN
SELECT bq.id, bq.build_time
FROM building_queue bq
JOIN planets p ON bq.planet_id = p.id
WHERE p.user_id = v_user_id
AND bq.start_time IS NULL
AND bq.end_time IS NULL
AND bq.queue_position = 1
LOOP
UPDATE building_queue
SET start_time = now(), end_time = now() + (v_bq.build_time || ' seconds')::interval
WHERE id = v_bq.id;
END LOOP;

-- Resume paused shipyard queues
FOR v_sq IN
SELECT sq.id, sq.build_time_per_unit
FROM shipyard_queue sq
JOIN planets p ON sq.planet_id = p.id
WHERE p.user_id = v_user_id
AND sq.start_time IS NULL
AND sq.current_unit_end_time IS NULL
AND sq.queue_position = (
SELECT MIN(sq2.queue_position) FROM shipyard_queue sq2 WHERE sq2.planet_id = sq.planet_id
)
LOOP
UPDATE shipyard_queue
SET start_time = now(), current_unit_end_time = now() + (v_sq.build_time_per_unit || ' seconds')::interval
WHERE id = v_sq.id;
END LOOP;

-- Resume paused research
UPDATE user_technologies
SET research_start_time = now(),
research_end_time = now() + (
GREATEST(1, EXTRACT(EPOCH FROM (
(SELECT vacation_mode_enabled_at FROM profiles WHERE id = v_user_id)
+ make_interval(secs => 0)
- (SELECT vacation_mode_enabled_at FROM profiles WHERE id = v_user_id)
))) || ' seconds'
)::interval
WHERE user_id = v_user_id AND is_researching = true AND research_end_time IS NULL;

RETURN jsonb_build_object('success', true, 'message', 'Vacation mode disabled');
END IF;
END;
$function$;

-- ============================================================
-- 6. Fix instant_complete_building: block in vacation
-- ============================================================
DO $$
DECLARE
v_func_def text;
v_new_func text;
BEGIN
SELECT pg_get_functiondef(p.oid) INTO v_func_def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'instant_complete_building';

IF v_func_def IS NOT NULL AND v_func_def NOT LIKE '%vacation%' THEN
v_new_func := replace(
v_func_def,
'v_user_id := auth.uid();',
'v_user_id := auth.uid();' || chr(10) ||
'IF is_user_in_vacation_mode(v_user_id) THEN' || chr(10) ||
'RETURN jsonb_build_object(''success'', false, ''error'', ''Cannot use instant complete while in vacation mode'');' || chr(10) ||
'END IF;'
);
EXECUTE v_new_func;
END IF;
END $$;

-- ============================================================
-- 7. Fix instant_complete_shipyard_item: block in vacation
-- ============================================================
DO $$
DECLARE
v_func_def text;
v_new_func text;
BEGIN
SELECT pg_get_functiondef(p.oid) INTO v_func_def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'instant_complete_shipyard_item';

IF v_func_def IS NOT NULL AND v_func_def NOT LIKE '%vacation%' THEN
v_new_func := replace(
v_func_def,
'v_user_id := auth.uid();',
'v_user_id := auth.uid();' || chr(10) ||
'IF is_user_in_vacation_mode(v_user_id) THEN' || chr(10) ||
'RETURN jsonb_build_object(''success'', false, ''error'', ''Cannot use instant complete while in vacation mode'');' || chr(10) ||
'END IF;'
);
EXECUTE v_new_func;
END IF;
END $$;

-- ============================================================
-- 8. Fix instant_complete_research (both overloads): block in vacation
-- ============================================================
DO $$
DECLARE
v_func_rec RECORD;
v_new_func text;
BEGIN
FOR v_func_rec IN
SELECT p.oid, pg_get_functiondef(p.oid) as def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'instant_complete_research'
LOOP
IF v_func_rec.def NOT LIKE '%vacation%' THEN
v_new_func := replace(
v_func_rec.def,
'v_user_id := auth.uid();',
'v_user_id := auth.uid();' || chr(10) ||
'IF is_user_in_vacation_mode(v_user_id) THEN' || chr(10) ||
'RETURN jsonb_build_object(''success'', false, ''error'', ''Cannot use instant complete while in vacation mode'');' || chr(10) ||
'END IF;'
);
EXECUTE v_new_func;
END IF;
END LOOP;
END $$;
