/*
  # Fix Security Issues - RLS and Function Search Paths

  1. Security Fixes
    - Enable RLS on requirement tables (building_requirements, technology_requirements, ship_requirements, defense_requirements)
    - Add read-only policies for authenticated users on requirement tables
    - Fix mutable search_path on all public functions by setting search_path = ''

  2. Tables with RLS enabled
    - building_requirements (read-only for authenticated)
    - technology_requirements (read-only for authenticated)
    - ship_requirements (read-only for authenticated)
    - defense_requirements (read-only for authenticated)

  3. Functions with fixed search_path
    - All 23 functions listed in the security warnings now have immutable search_path
*/

-- =====================================================
-- PART 1: Enable RLS on requirement tables
-- =====================================================

ALTER TABLE IF EXISTS building_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS technology_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ship_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS defense_requirements ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 2: Create RLS policies for requirement tables
-- These are reference data tables - read-only for authenticated users
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read building requirements' AND tablename = 'building_requirements') THEN
    CREATE POLICY "Authenticated users can read building requirements"
      ON building_requirements FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read technology requirements' AND tablename = 'technology_requirements') THEN
    CREATE POLICY "Authenticated users can read technology requirements"
      ON technology_requirements FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read ship requirements' AND tablename = 'ship_requirements') THEN
    CREATE POLICY "Authenticated users can read ship requirements"
      ON ship_requirements FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read defense requirements' AND tablename = 'defense_requirements') THEN
    CREATE POLICY "Authenticated users can read defense requirements"
      ON defense_requirements FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- =====================================================
-- PART 3: Fix function search_path security issues
-- Setting search_path = '' prevents search_path injection attacks
-- =====================================================

-- Fix check_noob_protection
CREATE OR REPLACE FUNCTION check_noob_protection(p_attacker_id uuid, p_defender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_attacker_points integer;
v_defender_points integer;
v_noob_limit integer;
v_attacker_vacation boolean;
v_defender_vacation boolean;
BEGIN
SELECT points_total, vacation_mode INTO v_attacker_points, v_attacker_vacation
FROM public.profiles WHERE id = p_attacker_id;

SELECT points_total, vacation_mode INTO v_defender_points, v_defender_vacation
FROM public.profiles WHERE id = p_defender_id;

SELECT value::integer INTO v_noob_limit
FROM public.game_settings WHERE key = 'newbie_protection_points';

IF v_noob_limit IS NULL THEN
v_noob_limit := 5000;
END IF;

IF v_attacker_vacation THEN
RETURN jsonb_build_object(
'can_attack', false,
'reason', 'No puedes atacar en modo vacaciones'
);
END IF;

IF v_defender_vacation THEN
RETURN jsonb_build_object(
'can_attack', false,
'reason', 'El jugador esta en modo vacaciones'
);
END IF;

IF v_defender_points <= v_noob_limit AND v_attacker_points > v_noob_limit THEN
RETURN jsonb_build_object(
'can_attack', false,
'reason', 'El jugador esta bajo proteccion de novatos'
);
END IF;

IF v_attacker_points > v_defender_points * 5 AND v_defender_points > 0 THEN
RETURN jsonb_build_object(
'can_attack', false,
'reason', 'El jugador es demasiado debil (ratio 5:1)'
);
END IF;

IF v_defender_points > v_attacker_points * 5 AND v_defender_points > v_noob_limit THEN
RETURN jsonb_build_object(
'can_attack', false,
'reason', 'El jugador es demasiado fuerte (ratio 1:5)'
);
END IF;

RETURN jsonb_build_object('can_attack', true, 'reason', null);
END;
$$;

-- Fix calculate_irn_lab_level
CREATE OR REPLACE FUNCTION calculate_irn_lab_level(p_user_id uuid, p_current_planet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_irn_level integer;
v_current_lab_level integer;
v_other_labs integer[];
v_bonus_levels integer := 0;
v_lab_level integer;
v_count integer := 0;
BEGIN
SELECT COALESCE(ut.level, 0) INTO v_irn_level
FROM public.user_technologies ut
JOIN public.technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = p_user_id AND tt.code = 'intergalactic_research_network';

SELECT COALESCE(pb.level, 0) INTO v_current_lab_level
FROM public.planet_buildings pb
JOIN public.building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_current_planet_id AND bt.code = 'research_lab';

IF v_irn_level = 0 THEN
RETURN v_current_lab_level;
END IF;

SELECT ARRAY_AGG(pb.level ORDER BY pb.level DESC) INTO v_other_labs
FROM public.planet_buildings pb
JOIN public.building_types bt ON pb.building_type_id = bt.id
JOIN public.planets p ON pb.planet_id = p.id
WHERE p.user_id = p_user_id
AND pb.planet_id != p_current_planet_id
AND bt.code = 'research_lab'
AND pb.level > 0;

IF v_other_labs IS NULL OR array_length(v_other_labs, 1) IS NULL THEN
RETURN v_current_lab_level;
END IF;

FOREACH v_lab_level IN ARRAY v_other_labs LOOP
IF v_count < v_irn_level THEN
v_bonus_levels := v_bonus_levels + v_lab_level;
v_count := v_count + 1;
END IF;
END LOOP;

RETURN v_current_lab_level + v_bonus_levels;
END;
$$;

-- Fix create_moon_from_battle
CREATE OR REPLACE FUNCTION create_moon_from_battle(p_planet_id uuid, p_debris_metal numeric, p_debris_crystal numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_total_debris numeric;
v_moon_chance integer;
v_random_roll integer;
v_moon_diameter integer;
v_moon_fields integer;
v_planet record;
v_existing_moon uuid;
v_new_moon_id uuid;
BEGIN
SELECT id INTO v_existing_moon
FROM public.planets
WHERE galaxy = (SELECT galaxy FROM public.planets WHERE id = p_planet_id)
AND solar_system = (SELECT solar_system FROM public.planets WHERE id = p_planet_id)
AND position = (SELECT position FROM public.planets WHERE id = p_planet_id)
AND planet_type = 'moon';

IF v_existing_moon IS NOT NULL THEN
RETURN NULL;
END IF;

v_total_debris := COALESCE(p_debris_metal, 0) + COALESCE(p_debris_crystal, 0);
v_moon_chance := LEAST(20, GREATEST(0, FLOOR(v_total_debris / 100000)::integer));

IF v_moon_chance < 1 THEN
RETURN NULL;
END IF;

v_random_roll := FLOOR(RANDOM() * 100)::integer + 1;

IF v_random_roll > v_moon_chance THEN
RETURN NULL;
END IF;

SELECT * INTO v_planet FROM public.planets WHERE id = p_planet_id;

v_moon_diameter := 8000 + (v_moon_chance * 100) + FLOOR(RANDOM() * 1000)::integer;
v_moon_fields := FLOOR(POWER(v_moon_diameter / 1000.0, 2) * 0.5)::integer;

INSERT INTO public.planets (
user_id, name, galaxy, solar_system, position,
planet_type, diameter, fields_max, temp_min, temp_max
) VALUES (
v_planet.user_id,
'Luna',
v_planet.galaxy,
v_planet.solar_system,
v_planet.position,
'moon',
v_moon_diameter,
v_moon_fields,
-40,
-20
) RETURNING id INTO v_new_moon_id;

INSERT INTO public.planet_resources (planet_id, metal, crystal, deuterium)
VALUES (v_new_moon_id, 0, 0, 0);

INSERT INTO public.messages (recipient_id, subject, body, message_type)
VALUES (
v_planet.user_id,
'Nueva Luna Creada',
'Los escombros de la batalla han formado una luna en las coordenadas [' ||
v_planet.galaxy || ':' || v_planet.solar_system || ':' || v_planet.position ||
']. Diametro: ' || v_moon_diameter || ' km. Campos: ' || v_moon_fields,
'system'
);

RETURN v_new_moon_id;
END;
$$;

-- Fix calculate_planet_max_fields
CREATE OR REPLACE FUNCTION calculate_planet_max_fields(p_planet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_planet record;
v_terraformer_level integer;
v_base_fields integer;
v_position_bonus integer;
BEGIN
SELECT * INTO v_planet FROM public.planets WHERE id = p_planet_id;

IF v_planet.planet_type = 'moon' THEN
RETURN v_planet.fields_max;
END IF;

SELECT COALESCE(pb.level, 0) INTO v_terraformer_level
FROM public.planet_buildings pb
JOIN public.building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_planet_id AND bt.code = 'terraformer';

v_base_fields := FLOOR(POWER(v_planet.diameter / 1000.0, 2))::integer;

v_position_bonus := CASE v_planet.position
WHEN 1 THEN -30
WHEN 2 THEN -20
WHEN 3 THEN -10
WHEN 10 THEN 5
WHEN 11 THEN 10
WHEN 12 THEN 15
WHEN 13 THEN 20
WHEN 14 THEN 15
WHEN 15 THEN 10
ELSE 0
END;

RETURN GREATEST(40, v_base_fields + v_position_bonus + (v_terraformer_level * 5));
END;
$$;

-- Fix update_planet_fields_on_terraformer
CREATE OR REPLACE FUNCTION update_planet_fields_on_terraformer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_building_code text;
v_new_max_fields integer;
BEGIN
SELECT code INTO v_building_code
FROM public.building_types WHERE id = NEW.building_type_id;

IF v_building_code = 'terraformer' THEN
v_new_max_fields := public.calculate_planet_max_fields(NEW.planet_id);

UPDATE public.planets
SET fields_max = v_new_max_fields
WHERE id = NEW.planet_id;
END IF;

RETURN NEW;
END;
$$;

-- Fix check_bashing_limit
CREATE OR REPLACE FUNCTION check_bashing_limit(p_attacker_id uuid, p_defender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_attack_count integer;
v_bashing_enabled boolean;
BEGIN
SELECT (value = 'true') INTO v_bashing_enabled
FROM public.game_settings WHERE key = 'bashing_protection';

IF NOT COALESCE(v_bashing_enabled, false) THEN
RETURN jsonb_build_object('allowed', true);
END IF;

SELECT COUNT(*) INTO v_attack_count
FROM public.attack_log
WHERE attacker_id = p_attacker_id
AND defender_id = p_defender_id
AND attack_time > NOW() - INTERVAL '24 hours';

IF v_attack_count >= 6 THEN
RETURN jsonb_build_object(
'allowed', false,
'reason', 'Has alcanzado el limite de 6 ataques en 24 horas a este jugador'
);
END IF;

RETURN jsonb_build_object('allowed', true);
END;
$$;

-- Fix validate_fleet_mission
CREATE OR REPLACE FUNCTION validate_fleet_mission(
p_user_id uuid,
p_mission_type text,
p_target_galaxy integer,
p_target_system integer,
p_target_position integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_target_planet record;
v_protection_check jsonb;
v_bashing_check jsonb;
v_max_colonies integer;
v_current_colonies integer;
v_astrophysics_level integer;
BEGIN
SELECT p.*, pr.id as owner_id INTO v_target_planet
FROM public.planets p
LEFT JOIN public.profiles pr ON p.user_id = pr.id
WHERE p.galaxy = p_target_galaxy
AND p.solar_system = p_target_system
AND p.position = p_target_position
AND p.planet_type = 'planet'
AND NOT p.is_destroyed;

IF p_mission_type = 'colonize' THEN
IF v_target_planet IS NOT NULL THEN
RETURN jsonb_build_object('valid', false, 'reason', 'La posicion ya esta ocupada');
END IF;

SELECT COUNT(*) INTO v_current_colonies
FROM public.planets WHERE user_id = p_user_id AND NOT is_destroyed;

SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
FROM public.user_technologies ut
JOIN public.technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

IF v_current_colonies >= v_max_colonies THEN
RETURN jsonb_build_object(
'valid', false, 
'reason', format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica.', v_max_colonies)
);
END IF;

RETURN jsonb_build_object('valid', true);
END IF;

IF p_mission_type = 'expedition' THEN
IF p_target_position != 16 THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
END IF;
RETURN jsonb_build_object('valid', true);
END IF;

IF p_mission_type IN ('attack', 'espionage', 'destroy') THEN
IF v_target_planet IS NULL THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
END IF;

IF v_target_planet.user_id = p_user_id THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tus propios planetas');
END IF;

v_protection_check := public.check_noob_protection(p_user_id, v_target_planet.user_id);
IF NOT (v_protection_check->>'can_attack')::boolean THEN
RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
END IF;

IF p_mission_type = 'attack' THEN
v_bashing_check := public.check_bashing_limit(p_user_id, v_target_planet.user_id);
IF NOT (v_bashing_check->>'allowed')::boolean THEN
RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
END IF;
END IF;
END IF;

IF p_mission_type IN ('transport', 'deploy') THEN
IF v_target_planet IS NULL THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
END IF;

IF p_mission_type = 'deploy' AND v_target_planet.user_id != p_user_id THEN
RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes estacionar en tus propios planetas');
END IF;
END IF;

IF p_mission_type = 'recycle' THEN
IF NOT EXISTS (
SELECT 1 FROM public.debris_fields
WHERE galaxy = p_target_galaxy
AND solar_system = p_target_system
AND position = p_target_position
AND (metal > 0 OR crystal > 0)
) THEN
RETURN jsonb_build_object('valid', false, 'reason', 'No hay campo de escombros en esas coordenadas');
END IF;
END IF;

RETURN jsonb_build_object('valid', true);
END;
$$;

-- Fix launch_missiles
CREATE OR REPLACE FUNCTION launch_missiles(
p_origin_planet_id uuid,
p_target_galaxy integer,
p_target_system integer,
p_target_position integer,
p_missile_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_origin_planet record;
v_target_planet record;
v_available_missiles integer;
v_abm_count integer;
v_effective_missiles integer;
v_destroyed_defenses jsonb := '[]'::jsonb;
BEGIN
SELECT p.*, pd.interplanetary_missiles INTO v_origin_planet
FROM public.planets p
LEFT JOIN public.planet_defenses pd ON p.id = pd.planet_id
WHERE p.id = p_origin_planet_id;

v_available_missiles := COALESCE(v_origin_planet.interplanetary_missiles, 0);

IF v_available_missiles < p_missile_count THEN
RETURN jsonb_build_object(
'success', false,
'reason', format('Solo tienes %s misiles interplanetarios', v_available_missiles)
);
END IF;

SELECT p.* INTO v_target_planet
FROM public.planets p
WHERE p.galaxy = p_target_galaxy
AND p.solar_system = p_target_system
AND p.position = p_target_position
AND NOT p.is_destroyed;

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'reason', 'Planeta objetivo no encontrado');
END IF;

IF ABS(v_origin_planet.solar_system - v_target_planet.solar_system) > 5 THEN
RETURN jsonb_build_object('success', false, 'reason', 'El objetivo esta fuera de alcance (max 5 sistemas)');
END IF;

SELECT COALESCE(anti_ballistic_missiles, 0) INTO v_abm_count
FROM public.planet_defenses WHERE planet_id = v_target_planet.id;

v_effective_missiles := GREATEST(0, p_missile_count - COALESCE(v_abm_count, 0));

UPDATE public.planet_defenses
SET 
interplanetary_missiles = interplanetary_missiles - p_missile_count
WHERE planet_id = p_origin_planet_id;

IF v_abm_count > 0 THEN
UPDATE public.planet_defenses
SET anti_ballistic_missiles = GREATEST(0, anti_ballistic_missiles - p_missile_count)
WHERE planet_id = v_target_planet.id;
END IF;

INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
v_target_planet.user_id,
'Ataque de Misiles!',
format('Tu planeta %s ha sido atacado con %s misiles interplanetarios. %s fueron interceptados por tus ABM.',
v_target_planet.name, p_missile_count, LEAST(v_abm_count, p_missile_count)),
'battle'
);

RETURN jsonb_build_object(
'success', true,
'missiles_launched', p_missile_count,
'missiles_intercepted', LEAST(v_abm_count, p_missile_count),
'missiles_effective', v_effective_missiles
);
END;
$$;

-- Fix phalanx_scan
CREATE OR REPLACE FUNCTION phalanx_scan(
p_moon_id uuid,
p_target_galaxy integer,
p_target_system integer,
p_target_position integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_moon record;
v_phalanx_level integer;
v_phalanx_range integer;
v_system_distance integer;
v_target_planet record;
v_fleets jsonb;
v_deuterium_cost integer;
BEGIN
SELECT p.*, pb.level as phalanx_level
INTO v_moon
FROM public.planets p
LEFT JOIN public.planet_buildings pb ON p.id = pb.planet_id
LEFT JOIN public.building_types bt ON pb.building_type_id = bt.id AND bt.code = 'sensor_phalanx'
WHERE p.id = p_moon_id AND p.planet_type = 'moon';

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'reason', 'Luna no encontrada');
END IF;

v_phalanx_level := COALESCE(v_moon.phalanx_level, 0);

IF v_phalanx_level = 0 THEN
RETURN jsonb_build_object('success', false, 'reason', 'No tienes Sensor Phalanx');
END IF;

IF v_moon.galaxy != p_target_galaxy THEN
RETURN jsonb_build_object('success', false, 'reason', 'Solo puedes escanear en tu misma galaxia');
END IF;

v_phalanx_range := POWER(v_phalanx_level, 2) - 1;
v_system_distance := ABS(v_moon.solar_system - p_target_system);

IF v_system_distance > v_phalanx_range THEN
RETURN jsonb_build_object(
'success', false, 
'reason', format('Fuera de alcance. Rango maximo: %s sistemas', v_phalanx_range)
);
END IF;

SELECT * INTO v_target_planet
FROM public.planets
WHERE galaxy = p_target_galaxy
AND solar_system = p_target_system
AND position = p_target_position
AND planet_type = 'planet'
AND user_id IS NOT NULL
AND user_id != v_moon.user_id;

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'reason', 'No hay planeta enemigo en esas coordenadas');
END IF;

v_deuterium_cost := 5000;

UPDATE public.planet_resources
SET deuterium = deuterium - v_deuterium_cost
WHERE planet_id = (SELECT id FROM public.planets WHERE user_id = v_moon.user_id AND is_main_planet = true)
AND deuterium >= v_deuterium_cost;

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'reason', 'Deuterio insuficiente (5000 requerido)');
END IF;

SELECT jsonb_agg(
jsonb_build_object(
'id', f.id,
'mission', f.mission_type,
'origin', format('[%s:%s:%s]', 
(SELECT galaxy FROM public.planets WHERE id = f.origin_planet_id),
(SELECT solar_system FROM public.planets WHERE id = f.origin_planet_id),
(SELECT position FROM public.planets WHERE id = f.origin_planet_id)
),
'arrival_time', f.arrival_time,
'is_returning', f.is_returning,
'ships', (
SELECT jsonb_agg(jsonb_build_object('type', st.name, 'quantity', fs.quantity))
FROM public.fleet_ships fs
JOIN public.ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = f.id
)
)
)
INTO v_fleets
FROM public.fleets f
WHERE (
(f.target_galaxy = p_target_galaxy AND f.target_system = p_target_system AND f.target_position = p_target_position AND NOT f.is_returning)
OR 
(f.origin_planet_id = v_target_planet.id AND f.is_returning)
)
AND f.is_completed = false;

RETURN jsonb_build_object(
'success', true,
'planet_name', v_target_planet.name,
'player', (SELECT username FROM public.profiles WHERE id = v_target_planet.user_id),
'fleets', COALESCE(v_fleets, '[]'::jsonb),
'deuterium_used', v_deuterium_cost
);
END;
$$;

-- Fix use_jump_gate
CREATE OR REPLACE FUNCTION use_jump_gate(
p_origin_moon_id uuid,
p_target_moon_id uuid,
p_ships jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_origin_moon record;
v_target_moon record;
v_origin_gate_level integer;
v_target_gate_level integer;
v_cooldown_hours integer;
v_ship record;
v_ship_type_id integer;
v_ship_quantity integer;
v_available_quantity integer;
BEGIN
SELECT p.*, pb.level as gate_level
INTO v_origin_moon
FROM public.planets p
LEFT JOIN public.planet_buildings pb ON p.id = pb.planet_id
LEFT JOIN public.building_types bt ON pb.building_type_id = bt.id AND bt.code = 'jump_gate'
WHERE p.id = p_origin_moon_id AND p.planet_type = 'moon';

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'reason', 'Luna de origen no encontrada');
END IF;

SELECT p.*, pb.level as gate_level
INTO v_target_moon
FROM public.planets p
LEFT JOIN public.planet_buildings pb ON p.id = pb.planet_id
LEFT JOIN public.building_types bt ON pb.building_type_id = bt.id AND bt.code = 'jump_gate'
WHERE p.id = p_target_moon_id AND p.planet_type = 'moon' AND p.user_id = v_origin_moon.user_id;

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'reason', 'Luna de destino no encontrada o no te pertenece');
END IF;

v_origin_gate_level := COALESCE(v_origin_moon.gate_level, 0);
v_target_gate_level := COALESCE(v_target_moon.gate_level, 0);

IF v_origin_gate_level = 0 OR v_target_gate_level = 0 THEN
RETURN jsonb_build_object('success', false, 'reason', 'Ambas lunas necesitan Portal de Salto');
END IF;

IF v_origin_moon.jump_gate_cooldown IS NOT NULL AND v_origin_moon.jump_gate_cooldown > NOW() THEN
RETURN jsonb_build_object(
'success', false, 
'reason', 'Portal en enfriamiento',
'cooldown_ends', v_origin_moon.jump_gate_cooldown
);
END IF;

FOR v_ship IN SELECT * FROM jsonb_array_elements(p_ships)
LOOP
v_ship_type_id := (v_ship.value->>'ship_type_id')::integer;
v_ship_quantity := (v_ship.value->>'quantity')::integer;

SELECT COALESCE(quantity, 0) INTO v_available_quantity
FROM public.planet_ships
WHERE planet_id = p_origin_moon_id AND ship_type_id = v_ship_type_id;

IF v_available_quantity < v_ship_quantity THEN
RETURN jsonb_build_object('success', false, 'reason', 'Naves insuficientes');
END IF;

UPDATE public.planet_ships
SET quantity = quantity - v_ship_quantity
WHERE planet_id = p_origin_moon_id AND ship_type_id = v_ship_type_id;

INSERT INTO public.planet_ships (planet_id, ship_type_id, quantity)
VALUES (p_target_moon_id, v_ship_type_id, v_ship_quantity)
ON CONFLICT (planet_id, ship_type_id)
DO UPDATE SET quantity = public.planet_ships.quantity + EXCLUDED.quantity;
END LOOP;

v_cooldown_hours := GREATEST(1, 60 / v_origin_gate_level);

UPDATE public.planets
SET jump_gate_cooldown = NOW() + (v_cooldown_hours || ' hours')::interval
WHERE id = p_origin_moon_id;

RETURN jsonb_build_object(
'success', true,
'message', 'Flota teletransportada exitosamente',
'cooldown_hours', v_cooldown_hours
);
END;
$$;

-- Fix simulate_combat
CREATE OR REPLACE FUNCTION simulate_combat(
p_attacker_fleet jsonb,
p_defender_fleet jsonb,
p_defender_defenses jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_round integer := 0;
v_max_rounds integer := 6;
v_attacker_units jsonb;
v_defender_units jsonb;
v_attacker_total_power numeric := 0;
v_defender_total_power numeric := 0;
v_rounds_data jsonb := '[]'::jsonb;
v_result text;
v_attacker_losses jsonb;
v_defender_losses jsonb;
v_debris_metal numeric := 0;
v_debris_crystal numeric := 0;
BEGIN
v_attacker_units := p_attacker_fleet;
v_defender_units := p_defender_fleet || p_defender_defenses;

WHILE v_round < v_max_rounds LOOP
v_round := v_round + 1;

SELECT COALESCE(SUM((unit->>'quantity')::integer * (unit->>'weapon_power')::integer), 0)
INTO v_attacker_total_power
FROM jsonb_array_elements(v_attacker_units) AS unit
WHERE (unit->>'quantity')::integer > 0;

SELECT COALESCE(SUM((unit->>'quantity')::integer * (unit->>'weapon_power')::integer), 0)
INTO v_defender_total_power
FROM jsonb_array_elements(v_defender_units) AS unit
WHERE (unit->>'quantity')::integer > 0;

IF v_attacker_total_power <= 0 OR v_defender_total_power <= 0 THEN
EXIT;
END IF;

v_rounds_data := v_rounds_data || jsonb_build_object(
'round', v_round,
'attacker_power', v_attacker_total_power,
'defender_power', v_defender_total_power
);
END LOOP;

SELECT COALESCE(SUM((unit->>'quantity')::integer), 0)
INTO v_attacker_total_power
FROM jsonb_array_elements(v_attacker_units) AS unit;

SELECT COALESCE(SUM((unit->>'quantity')::integer), 0)
INTO v_defender_total_power
FROM jsonb_array_elements(v_defender_units) AS unit;

IF v_attacker_total_power > 0 AND v_defender_total_power <= 0 THEN
v_result := 'attacker_won';
ELSIF v_attacker_total_power <= 0 AND v_defender_total_power > 0 THEN
v_result := 'defender_won';
ELSE
v_result := 'draw';
END IF;

RETURN jsonb_build_object(
'result', v_result,
'rounds', v_round,
'rounds_data', v_rounds_data,
'attacker_remaining', v_attacker_units,
'defender_remaining', v_defender_units,
'debris_metal', v_debris_metal,
'debris_crystal', v_debris_crystal
);
END;
$$;

-- Fix process_moon_destruction
CREATE OR REPLACE FUNCTION process_moon_destruction(p_fleet_id uuid, p_target_moon_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_fleet record;
v_moon record;
v_deathstar_count integer;
v_destruction_chance integer;
v_fleet_loss_chance integer;
v_moon_destroyed boolean := false;
v_fleet_destroyed boolean := false;
v_moon_diameter integer;
BEGIN
SELECT * INTO v_fleet FROM public.fleets WHERE id = p_fleet_id;
SELECT * INTO v_moon FROM public.planets WHERE id = p_target_moon_id AND planet_type = 'moon';

IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'reason', 'Luna no encontrada');
END IF;

SELECT COALESCE(SUM(fs.quantity), 0) INTO v_deathstar_count
FROM public.fleet_ships fs
JOIN public.ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = p_fleet_id AND st.code = 'deathstar';

IF v_deathstar_count = 0 THEN
RETURN jsonb_build_object('success', false, 'reason', 'Necesitas Estrellas de la Muerte');
END IF;

v_moon_diameter := v_moon.diameter;

v_destruction_chance := (100 - SQRT(v_moon_diameter)) * SQRT(v_deathstar_count);
v_destruction_chance := GREATEST(0, LEAST(100, v_destruction_chance));

v_fleet_loss_chance := SQRT(v_moon_diameter) / 2;
v_fleet_loss_chance := GREATEST(0, LEAST(100, v_fleet_loss_chance));

IF random() * 100 < v_destruction_chance THEN
v_moon_destroyed := true;

UPDATE public.planets SET is_destroyed = true WHERE id = p_target_moon_id;

INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
v_moon.user_id,
'Tu luna ha sido destruida!',
format('Tu luna en [%s:%s:%s] ha sido destruida por una flota enemiga.',
v_moon.galaxy, v_moon.solar_system, v_moon.position),
'battle'
);
END IF;

IF random() * 100 < v_fleet_loss_chance THEN
v_fleet_destroyed := true;

DELETE FROM public.fleet_ships WHERE fleet_id = p_fleet_id;
UPDATE public.fleets SET is_completed = true WHERE id = p_fleet_id;

INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
v_fleet.user_id,
'Tu flota fue destruida!',
format('Tu flota fue atrapada en la explosion de la luna en [%s:%s:%s].',
v_moon.galaxy, v_moon.solar_system, v_moon.position),
'battle'
);
END IF;

RETURN jsonb_build_object(
'success', true,
'moon_destroyed', v_moon_destroyed,
'fleet_destroyed', v_fleet_destroyed,
'destruction_chance', v_destruction_chance,
'fleet_loss_chance', v_fleet_loss_chance
);
END;
$$;

-- Fix rebuild_defenses_after_combat
CREATE OR REPLACE FUNCTION rebuild_defenses_after_combat(p_planet_id uuid, p_destroyed_defenses jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_defense record;
v_rebuild_chance numeric := 0.7;
v_rebuilt_count integer := 0;
v_defense_type_id integer;
v_destroyed_quantity integer;
v_rebuilt_quantity integer;
BEGIN
FOR v_defense IN SELECT * FROM jsonb_array_elements(p_destroyed_defenses)
LOOP
v_defense_type_id := (v_defense.value->>'defense_type_id')::integer;
v_destroyed_quantity := (v_defense.value->>'quantity')::integer;

v_rebuilt_quantity := 0;
FOR i IN 1..v_destroyed_quantity LOOP
IF random() < v_rebuild_chance THEN
v_rebuilt_quantity := v_rebuilt_quantity + 1;
END IF;
END LOOP;

IF v_rebuilt_quantity > 0 THEN
UPDATE public.planet_defenses
SET quantity = quantity + v_rebuilt_quantity
WHERE planet_id = p_planet_id AND defense_type_id = v_defense_type_id;

v_rebuilt_count := v_rebuilt_count + v_rebuilt_quantity;
END IF;
END LOOP;

RETURN jsonb_build_object(
'rebuilt_count', v_rebuilt_count,
'rebuild_chance', v_rebuild_chance * 100
);
END;
$$;

-- Fix get_max_expeditions
CREATE OR REPLACE FUNCTION get_max_expeditions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_astrophysics_level integer;
BEGIN
SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
FROM public.user_technologies ut
JOIN public.technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

RETURN FLOOR(SQRT(COALESCE(v_astrophysics_level, 0)));
END;
$$;

-- Fix get_fleet_slots
CREATE OR REPLACE FUNCTION get_fleet_slots(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_computer_level integer;
v_has_admiral boolean;
BEGIN
SELECT COALESCE(ut.level, 0) INTO v_computer_level
FROM public.user_technologies ut
JOIN public.technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = p_user_id AND tt.code = 'computer_tech';

SELECT EXISTS(
SELECT 1 FROM public.user_officers uo
JOIN public.officer_types ot ON uo.officer_type_id = ot.id
WHERE uo.user_id = p_user_id 
AND ot.code = 'admiral' 
AND uo.expires_at > NOW()
) INTO v_has_admiral;

RETURN 1 + COALESCE(v_computer_level, 0) + (CASE WHEN v_has_admiral THEN 2 ELSE 0 END);
END;
$$;

-- Fix recalculate_planet_fields
CREATE OR REPLACE FUNCTION recalculate_planet_fields(p_planet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_building_count integer;
v_terraformer_bonus integer;
BEGIN
SELECT COUNT(*) INTO v_building_count
FROM public.planet_buildings
WHERE planet_id = p_planet_id AND level > 0;

SELECT COALESCE(pb.level * 5, 0) INTO v_terraformer_bonus
FROM public.planet_buildings pb
JOIN public.building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_planet_id AND bt.code = 'terraformer';

UPDATE public.planets
SET fields_used = v_building_count
WHERE id = p_planet_id;
END;
$$;

-- Fix sync_planet_fields_on_building_change
CREATE OR REPLACE FUNCTION sync_planet_fields_on_building_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
PERFORM public.recalculate_planet_fields(NEW.planet_id);
RETURN NEW;
ELSIF TG_OP = 'DELETE' THEN
PERFORM public.recalculate_planet_fields(OLD.planet_id);
RETURN OLD;
END IF;
RETURN NULL;
END;
$$;

-- Fix check_building_queue_limit
CREATE OR REPLACE FUNCTION check_building_queue_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
current_queue_count INTEGER;
max_slots INTEGER;
has_commander BOOLEAN;
BEGIN
SELECT COUNT(*) INTO current_queue_count
FROM public.building_queue
WHERE planet_id = NEW.planet_id;

SELECT EXISTS(
SELECT 1 FROM public.user_officers uo
JOIN public.officer_types ot ON uo.officer_type_id = ot.id
WHERE uo.user_id = (SELECT user_id FROM public.planets WHERE id = NEW.planet_id)
AND ot.code = 'commander'
AND uo.expires_at > NOW()
) INTO has_commander;

IF has_commander THEN
max_slots := 5;
ELSE
max_slots := 3;
END IF;

IF current_queue_count >= max_slots THEN
RAISE EXCEPTION 'Building queue is full (max % slots)', max_slots;
END IF;

RETURN NEW;
END;
$$;

-- Fix check_single_research
CREATE OR REPLACE FUNCTION check_single_research()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
IF NEW.is_researching = true AND (OLD.is_researching IS NULL OR OLD.is_researching = false) THEN
IF EXISTS (
SELECT 1 FROM public.user_technologies
WHERE user_id = NEW.user_id
AND is_researching = true
AND id != NEW.id
) THEN
RAISE EXCEPTION 'User already has a research in progress';
END IF;
END IF;
RETURN NEW;
END;
$$;

-- Fix process_fleet_arrival (large function)
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
fleet_record RECORD;
target_planet RECORD;
ship_record RECORD;
total_cargo_capacity BIGINT;
loot_metal NUMERIC;
loot_crystal NUMERIC;
loot_deuterium NUMERIC;
new_planet_id uuid;
debris_metal NUMERIC;
debris_crystal NUMERIC;
moon_chance INTEGER;
planet_diameter INTEGER;
planet_fields INTEGER;
planet_temp_min INTEGER;
planet_temp_max INTEGER;
BEGIN
SELECT * INTO fleet_record FROM public.fleets WHERE id = p_fleet_id AND is_completed = false;

IF NOT FOUND THEN
RETURN;
END IF;

IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN
RETURN;
END IF;

IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN
RETURN;
END IF;

IF fleet_record.is_returning THEN
FOR ship_record IN
SELECT fs.ship_type_id, fs.quantity
FROM public.fleet_ships fs
WHERE fs.fleet_id = p_fleet_id
LOOP
INSERT INTO public.planet_ships (planet_id, ship_type_id, quantity)
VALUES (fleet_record.origin_planet_id, ship_record.ship_type_id, ship_record.quantity)
ON CONFLICT (planet_id, ship_type_id)
DO UPDATE SET quantity = public.planet_ships.quantity + EXCLUDED.quantity;
END LOOP;

UPDATE public.planet_resources
SET
metal = metal + fleet_record.cargo_metal,
crystal = crystal + fleet_record.cargo_crystal,
deuterium = deuterium + fleet_record.cargo_deuterium
WHERE planet_id = fleet_record.origin_planet_id;

DELETE FROM public.fleet_ships WHERE fleet_id = p_fleet_id;
UPDATE public.fleets SET is_completed = true WHERE id = p_fleet_id;
RETURN;
END IF;

CASE fleet_record.mission_type
WHEN 'espionage' THEN
SELECT p.* INTO target_planet
FROM public.planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position
AND p.planet_type = 'planet';

IF FOUND AND target_planet.user_id IS NOT NULL THEN
PERFORM public.generate_espionage_report(
fleet_record.user_id,
target_planet.id,
target_planet.user_id
);
END IF;

UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;

WHEN 'transport' THEN
SELECT p.* INTO target_planet
FROM public.planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position;

IF FOUND THEN
UPDATE public.planet_resources
SET
metal = metal + fleet_record.cargo_metal,
crystal = crystal + fleet_record.cargo_crystal,
deuterium = deuterium + fleet_record.cargo_deuterium
WHERE planet_id = target_planet.id;

UPDATE public.fleets
SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0, is_returning = true
WHERE id = p_fleet_id;
ELSE
UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;
END IF;

WHEN 'deploy' THEN
SELECT p.* INTO target_planet
FROM public.planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position
AND p.user_id = fleet_record.user_id;

IF FOUND THEN
FOR ship_record IN
SELECT fs.ship_type_id, fs.quantity
FROM public.fleet_ships fs
WHERE fs.fleet_id = p_fleet_id
LOOP
INSERT INTO public.planet_ships (planet_id, ship_type_id, quantity)
VALUES (target_planet.id, ship_record.ship_type_id, ship_record.quantity)
ON CONFLICT (planet_id, ship_type_id)
DO UPDATE SET quantity = public.planet_ships.quantity + EXCLUDED.quantity;
END LOOP;

UPDATE public.planet_resources
SET
metal = metal + fleet_record.cargo_metal,
crystal = crystal + fleet_record.cargo_crystal,
deuterium = deuterium + fleet_record.cargo_deuterium
WHERE planet_id = target_planet.id;

DELETE FROM public.fleet_ships WHERE fleet_id = p_fleet_id;
UPDATE public.fleets SET is_completed = true WHERE id = p_fleet_id;
ELSE
UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;
END IF;

WHEN 'recycle' THEN
DECLARE
debris RECORD;
recycler_capacity BIGINT;
collected_metal NUMERIC;
collected_crystal NUMERIC;
BEGIN
SELECT * INTO debris
FROM public.debris_fields
WHERE galaxy = fleet_record.target_galaxy
AND solar_system = fleet_record.target_system
AND position = fleet_record.target_position;

IF FOUND AND (debris.metal > 0 OR debris.crystal > 0) THEN
SELECT COALESCE(SUM(fs.quantity::bigint * st.cargo_capacity::bigint), 0)
INTO recycler_capacity
FROM public.fleet_ships fs
JOIN public.ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = p_fleet_id AND st.code = 'recycler';

collected_metal := LEAST(debris.metal, recycler_capacity / 2);
collected_crystal := LEAST(debris.crystal, recycler_capacity / 2);

UPDATE public.debris_fields
SET
metal = metal - collected_metal,
crystal = crystal - collected_crystal,
updated_at = NOW()
WHERE id = debris.id;

DELETE FROM public.debris_fields WHERE id = debris.id AND metal <= 0 AND crystal <= 0;

UPDATE public.fleets
SET
cargo_metal = cargo_metal + collected_metal,
cargo_crystal = cargo_crystal + collected_crystal,
is_returning = true
WHERE id = p_fleet_id;
ELSE
UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;
END IF;
END;

WHEN 'expedition' THEN
DECLARE
fleet_size INTEGER;
base_reward NUMERIC;
BEGIN
SELECT COALESCE(SUM(quantity), 0) INTO fleet_size
FROM public.fleet_ships WHERE fleet_id = p_fleet_id;

base_reward := GREATEST(100, fleet_size * 50);

UPDATE public.fleets
SET
cargo_metal = cargo_metal + floor(random() * base_reward * 2)::integer,
cargo_crystal = cargo_crystal + floor(random() * base_reward)::integer,
cargo_deuterium = cargo_deuterium + floor(random() * base_reward * 0.5)::integer,
is_returning = true
WHERE id = p_fleet_id;

INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
fleet_record.user_id,
'Reporte de Expedicion',
'Tu flota ha encontrado recursos abandonados en el espacio profundo.',
'expedition'
);
END;

WHEN 'colonize' THEN
SELECT p.* INTO target_planet
FROM public.planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position;

IF NOT FOUND THEN
DECLARE
colony_ship_type_id INTEGER;
has_colony_ship BOOLEAN;
current_colonies INTEGER;
max_colonies INTEGER;
astrophysics_level INTEGER;
BEGIN
SELECT id INTO colony_ship_type_id FROM public.ship_types WHERE code = 'colony_ship';

SELECT EXISTS(
SELECT 1 FROM public.fleet_ships
WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id AND quantity > 0
) INTO has_colony_ship;

SELECT COUNT(*) INTO current_colonies
FROM public.planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed;

SELECT COALESCE(ut.level, 0) INTO astrophysics_level
FROM public.user_technologies ut
JOIN public.technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = fleet_record.user_id AND tt.code = 'astrophysics';

max_colonies := 1 + FLOOR((COALESCE(astrophysics_level, 0) + 1) / 2);

IF has_colony_ship AND current_colonies < max_colonies THEN
CASE 
WHEN fleet_record.target_position BETWEEN 1 AND 3 THEN
planet_temp_min := 100 + floor(random() * 40)::int;
planet_diameter := 8000 + floor(random() * 3000)::int;
WHEN fleet_record.target_position BETWEEN 4 AND 6 THEN
planet_temp_min := 40 + floor(random() * 30)::int;
planet_diameter := 12000 + floor(random() * 3000)::int;
WHEN fleet_record.target_position BETWEEN 7 AND 9 THEN
planet_temp_min := 0 + floor(random() * 20)::int;
planet_diameter := 14000 + floor(random() * 4000)::int;
WHEN fleet_record.target_position BETWEEN 10 AND 12 THEN
planet_temp_min := -40 + floor(random() * 20)::int;
planet_diameter := 12000 + floor(random() * 3000)::int;
ELSE
planet_temp_min := -80 + floor(random() * 30)::int;
planet_diameter := 8000 + floor(random() * 3000)::int;
END CASE;

planet_temp_max := planet_temp_min + 40;
planet_fields := GREATEST(80, LEAST(250, floor(power(planet_diameter / 1000, 2))::int));

INSERT INTO public.planets (
user_id, name, galaxy, solar_system, position,
planet_type, is_main_planet, diameter, fields_max, temp_min, temp_max, image_id
) VALUES (
fleet_record.user_id,
'Colonia',
fleet_record.target_galaxy,
fleet_record.target_system,
fleet_record.target_position,
'planet',
false,
planet_diameter,
planet_fields,
planet_temp_min,
planet_temp_max,
floor(random() * 10 + 1)::int
) RETURNING id INTO new_planet_id;

INSERT INTO public.planet_resources (
planet_id, metal, crystal, deuterium,
metal_per_hour, crystal_per_hour, deuterium_per_hour,
metal_storage, crystal_storage, deuterium_storage
) VALUES (
new_planet_id, 500, 500, 0, 30, 15, 0, 10000, 10000, 10000
);

UPDATE public.fleet_ships
SET quantity = quantity - 1
WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;

DELETE FROM public.fleet_ships WHERE fleet_id = p_fleet_id AND quantity <= 0;

INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
fleet_record.user_id,
'Colonia Establecida',
format('Se ha establecido una nueva colonia en [%s:%s:%s]. Diametro: %s km, Campos: %s', 
fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
planet_diameter, planet_fields),
'system'
);
ELSIF NOT has_colony_ship THEN
INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
fleet_record.user_id,
'Colonizacion Fallida',
'La flota no tiene una nave colonizadora.',
'system'
);
ELSE
INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
fleet_record.user_id,
'Colonizacion Fallida',
format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica para mas.', max_colonies),
'system'
);
END IF;
END;
ELSE
INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
fleet_record.user_id,
'Colonizacion Fallida',
format('La posicion [%s:%s:%s] ya esta ocupada.', 
fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
'system'
);
END IF;

UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;

WHEN 'attack' THEN
SELECT p.* INTO target_planet
FROM public.planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position;

IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
INSERT INTO public.attack_log (attacker_id, defender_id, target_planet_id)
VALUES (fleet_record.user_id, target_planet.user_id, target_planet.id);

SELECT COALESCE(SUM(fs.quantity::bigint * st.cargo_capacity::bigint), 0)
INTO total_cargo_capacity
FROM public.fleet_ships fs
JOIN public.ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = p_fleet_id;

SELECT 
LEAST(pr.metal * 0.5, total_cargo_capacity / 3),
LEAST(pr.crystal * 0.5, total_cargo_capacity / 3),
LEAST(pr.deuterium * 0.5, total_cargo_capacity / 3)
INTO loot_metal, loot_crystal, loot_deuterium
FROM public.planet_resources pr WHERE pr.planet_id = target_planet.id;

loot_metal := COALESCE(loot_metal, 0);
loot_crystal := COALESCE(loot_crystal, 0);
loot_deuterium := COALESCE(loot_deuterium, 0);

UPDATE public.planet_resources
SET
metal = GREATEST(0, metal - loot_metal),
crystal = GREATEST(0, crystal - loot_crystal),
deuterium = GREATEST(0, deuterium - loot_deuterium)
WHERE planet_id = target_planet.id;

UPDATE public.fleets
SET
cargo_metal = cargo_metal + loot_metal,
cargo_crystal = cargo_crystal + loot_crystal,
cargo_deuterium = cargo_deuterium + loot_deuterium,
is_returning = true
WHERE id = p_fleet_id;

debris_metal := floor((loot_metal + loot_crystal) * 0.3);
debris_crystal := floor((loot_metal + loot_crystal) * 0.15);

IF debris_metal > 0 OR debris_crystal > 0 THEN
INSERT INTO public.debris_fields (galaxy, solar_system, position, metal, crystal)
VALUES (
fleet_record.target_galaxy,
fleet_record.target_system,
fleet_record.target_position,
debris_metal,
debris_crystal
)
ON CONFLICT (galaxy, solar_system, position)
DO UPDATE SET
metal = public.debris_fields.metal + EXCLUDED.metal,
crystal = public.debris_fields.crystal + EXCLUDED.crystal,
updated_at = NOW();

moon_chance := LEAST(20, GREATEST(0, FLOOR((debris_metal + debris_crystal) / 100000)::integer));
IF moon_chance > 0 AND random() * 100 < moon_chance THEN
PERFORM public.create_moon_from_battle(target_planet.id, debris_metal, debris_crystal);
END IF;
END IF;

INSERT INTO public.battle_reports (
attacker_id, defender_id, planet_id, coordinates, result, rounds,
loot_metal, loot_crystal, loot_deuterium, debris_metal, debris_crystal,
report_data
) VALUES (
fleet_record.user_id,
target_planet.user_id,
target_planet.id,
format('[%s:%s:%s]', fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
'attacker_won',
1,
loot_metal,
loot_crystal,
loot_deuterium,
debris_metal,
debris_crystal,
jsonb_build_object(
'attacker_fleet', (
SELECT jsonb_agg(jsonb_build_object('ship_type_id', ship_type_id, 'quantity', quantity))
FROM public.fleet_ships WHERE fleet_id = p_fleet_id
)
)
);

INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
fleet_record.user_id,
'Reporte de Combate',
format('Has atacado %s en [%s:%s:%s]. Botin: %s Metal, %s Cristal, %s Deuterio.',
target_planet.name, 
fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
floor(loot_metal), floor(loot_crystal), floor(loot_deuterium)),
'battle'
);

INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
VALUES (
NULL,
target_planet.user_id,
'Tu planeta fue atacado!',
format('Tu planeta %s en [%s:%s:%s] fue atacado. Perdiste: %s Metal, %s Cristal, %s Deuterio.',
target_planet.name,
fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
floor(loot_metal), floor(loot_crystal), floor(loot_deuterium)),
'battle'
);
ELSE
UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;
END IF;

ELSE
UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;
END CASE;

EXCEPTION
WHEN OTHERS THEN
UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;
RAISE NOTICE 'Error processing fleet %: %', p_fleet_id, SQLERRM;
END;
$$;

-- Fix process_user_fleets
CREATE OR REPLACE FUNCTION process_user_fleets(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
fleet_record RECORD;
BEGIN
FOR fleet_record IN
SELECT id FROM public.fleets
WHERE user_id = p_user_id
AND is_completed = false
AND (
(is_returning = false AND arrival_time <= NOW())
OR (is_returning = true AND return_time <= NOW())
)
LOOP
PERFORM public.process_fleet_arrival(fleet_record.id);
END LOOP;
END;
$$;

-- Fix complete_research
CREATE OR REPLACE FUNCTION complete_research(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
research_record RECORD;
BEGIN
FOR research_record IN
SELECT id, level
FROM public.user_technologies
WHERE user_id = p_user_id
AND is_researching = true
AND research_end_time <= NOW()
LOOP
UPDATE public.user_technologies
SET
level = level + 1,
is_researching = false,
research_end_time = NULL,
research_planet_id = NULL
WHERE id = research_record.id;
END LOOP;
END;
$$;

-- Fix generate_espionage_report
CREATE OR REPLACE FUNCTION generate_espionage_report(
p_attacker_id uuid,
p_target_planet_id uuid,
p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
target_resources RECORD;
target_buildings JSONB;
target_ships JSONB;
target_defenses JSONB;
target_techs JSONB;
target_planet RECORD;
report_data JSONB;
BEGIN
SELECT * INTO target_planet FROM public.planets WHERE id = p_target_planet_id;

SELECT metal, crystal, deuterium, energy_used, energy_max
INTO target_resources
FROM public.planet_resources WHERE planet_id = p_target_planet_id;

SELECT jsonb_agg(jsonb_build_object(
'name', bt.name,
'level', pb.level
))
INTO target_buildings
FROM public.planet_buildings pb
JOIN public.building_types bt ON pb.building_type_id = bt.id
WHERE pb.planet_id = p_target_planet_id AND pb.level > 0;

SELECT jsonb_agg(jsonb_build_object(
'name', st.name,
'quantity', ps.quantity
))
INTO target_ships
FROM public.planet_ships ps
JOIN public.ship_types st ON ps.ship_type_id = st.id
WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0;

SELECT jsonb_agg(jsonb_build_object(
'name', dt.name,
'quantity', pd.quantity
))
INTO target_defenses
FROM public.planet_defenses pd
JOIN public.defense_types dt ON pd.defense_type_id = dt.id
WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0;

SELECT jsonb_agg(jsonb_build_object(
'name', tt.name,
'level', ut.level
))
INTO target_techs
FROM public.user_technologies ut
JOIN public.technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = p_target_user_id AND ut.level > 0;

report_data := jsonb_build_object(
'planet_name', target_planet.name,
'coordinates', format('[%s:%s:%s]', target_planet.galaxy, target_planet.solar_system, target_planet.position),
'resources', jsonb_build_object(
'metal', COALESCE(target_resources.metal, 0),
'crystal', COALESCE(target_resources.crystal, 0),
'deuterium', COALESCE(target_resources.deuterium, 0)
),
'buildings', COALESCE(target_buildings, '[]'::jsonb),
'ships', COALESCE(target_ships, '[]'::jsonb),
'defenses', COALESCE(target_defenses, '[]'::jsonb),
'technologies', COALESCE(target_techs, '[]'::jsonb)
);

INSERT INTO public.messages (
sender_id,
recipient_id,
subject,
body,
message_type
) VALUES (
NULL,
p_attacker_id,
'Reporte de Espionaje - ' || target_planet.name,
report_data::text,
'espionage'
);
END;
$$;
