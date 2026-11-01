/*
  # VIP Plus Time Bonuses
  
  Adds -10% time reduction for VIP (Plus) users on:
  1. Building construction time (secure_add_to_building_queue)
  2. Shipyard construction time (secure_add_to_shipyard_queue)
  3. Research time (secure_start_research)
  4. Fleet flight time (secure_send_fleet + join_acs_with_fleet)
  
  Uses the existing is_user_plus() helper function.
  All patches use replace() on prosrc for minimal invasiveness.
  Idempotent: if VIP bonus is already present, replace() is a no-op.
*/

-- ==========================================================================
-- 1. secure_add_to_building_queue: -10% construction time for VIP
-- ==========================================================================
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'secure_add_to_building_queue'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'secure_add_to_building_queue not found, skipping';
    RETURN;
  END IF;

  -- Check idempotency: skip if already patched
  IF v_src LIKE '%VIP Plus: -10% construction time%' THEN
    RAISE NOTICE 'secure_add_to_building_queue already has VIP bonus, skipping';
    RETURN;
  END IF;

  -- Inject VIP bonus right after the build_time calculation line.
  -- Anchor: the build_time formula is unique in this function.
  v_src := replace(v_src,
    'v_build_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed));',
    'v_build_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed));

-- VIP Plus: -10% construction time
IF is_user_plus(auth.uid()) THEN
  v_build_time := GREATEST(1, FLOOR(v_build_time * 0.90));
END IF;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION secure_add_to_building_queue(p_planet_id uuid, p_building_type_id integer) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = ''public'' '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'vip_time_bonuses: added -10%% construction time to secure_add_to_building_queue';
END $$;


-- ==========================================================================
-- 2. secure_add_to_shipyard_queue: -10% shipyard build time for VIP
-- ==========================================================================
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'secure_add_to_shipyard_queue'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'secure_add_to_shipyard_queue not found, skipping';
    RETURN;
  END IF;

  -- Check idempotency
  IF v_src LIKE '%VIP Plus: -10% shipyard construction time%' THEN
    RAISE NOTICE 'secure_add_to_shipyard_queue already has VIP bonus, skipping';
    RETURN;
  END IF;

  -- Inject VIP bonus after the IF/ELSE build time block.
  -- The actual prosrc uses multi-line FLOOR() from migration 20260227010736.
  v_src := replace(v_src,
    '      / v_game_speed
    ));
  END IF;',
    '      / v_game_speed
    ));
  END IF;

  -- VIP Plus: -10% shipyard construction time
  IF is_user_plus(auth.uid()) THEN
    v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * 0.90));
  END IF;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION secure_add_to_shipyard_queue(p_planet_id uuid, p_item_type text, p_type_id integer, p_quantity integer) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = ''public'' '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'vip_time_bonuses: added -10%% shipyard time to secure_add_to_shipyard_queue';
END $$;


-- ==========================================================================
-- 3. secure_start_research: -10% research time for VIP (stacks with Technocrat)
-- ==========================================================================
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'secure_start_research'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'secure_start_research not found, skipping';
    RETURN;
  END IF;

  -- Check idempotency
  IF v_src LIKE '%VIP Plus: -10% research time%' THEN
    RAISE NOTICE 'secure_start_research already has VIP bonus, skipping';
    RETURN;
  END IF;

  -- Inject VIP bonus right after the Technocrat bonus block.
  -- This stacks multiplicatively: Technocrat -25% then VIP -10% = ~32.5% total reduction.
  v_src := replace(v_src,
    'IF v_has_technocrat THEN
v_research_time := GREATEST(1, FLOOR(v_research_time * 0.75));
END IF;',
    'IF v_has_technocrat THEN
v_research_time := GREATEST(1, FLOOR(v_research_time * 0.75));
END IF;

-- VIP Plus: -10% research time (stacks with Technocrat)
IF is_user_plus(auth.uid()) THEN
  v_research_time := GREATEST(1, FLOOR(v_research_time * 0.90));
END IF;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION secure_start_research(p_planet_id uuid, p_tech_type_id integer) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public SET statement_timeout = ''60s'' SET lock_timeout = ''30s'' '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'vip_time_bonuses: added -10%% research time to secure_start_research';
END $$;


-- ==========================================================================
-- 4. secure_send_fleet: -10% flight time for VIP
-- ==========================================================================
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'secure_send_fleet'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'secure_send_fleet not found, skipping';
    RETURN;
  END IF;

  -- Check idempotency
  IF v_src LIKE '%VIP Plus: -10% flight time%' THEN
    RAISE NOTICE 'secure_send_fleet already has VIP bonus, skipping';
    RETURN;
  END IF;

  -- Inject VIP bonus right after the fleet_calc_flight_time call with admiral bonus.
  -- The -10% applies AFTER the admiral speed bonus, stacking multiplicatively.
  v_src := replace(v_src,
    'v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent, v_admiral_speed_bonus);',
    'v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent, v_admiral_speed_bonus);

  -- VIP Plus: -10% flight time (stacks with Admiral)
  IF is_user_plus(v_user_id) THEN
    v_flight_time := GREATEST(10, FLOOR(v_flight_time * 0.90));
  END IF;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION secure_send_fleet('
    '  p_origin_planet_id uuid,'
    '  p_target_galaxy int,'
    '  p_target_system int,'
    '  p_target_position int,'
    '  p_mission_type text,'
    '  p_fleet_ships jsonb,'
    '  p_cargo_metal bigint DEFAULT 0,'
    '  p_cargo_crystal bigint DEFAULT 0,'
    '  p_cargo_deuterium bigint DEFAULT 0,'
    '  p_speed_percent int DEFAULT 100,'
    '  p_target_type text DEFAULT ''planet'''
    ') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'vip_time_bonuses: added -10%% flight time to secure_send_fleet';
END $$;


-- ==========================================================================
-- 5. join_acs_with_fleet: -10% flight time for VIP
-- ==========================================================================
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'join_acs_with_fleet'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'join_acs_with_fleet not found, skipping';
    RETURN;
  END IF;

  -- Check idempotency
  IF v_src LIKE '%VIP Plus: -10% flight time%' THEN
    RAISE NOTICE 'join_acs_with_fleet already has VIP bonus, skipping';
    RETURN;
  END IF;

  -- The admiral migration patched this function to pass admiral bonus inline.
  -- Current call: fleet_calc_flight_time(..., CASE WHEN v_has_admiral THEN 0.2 ELSE 0 END)
  v_src := replace(v_src,
    'v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent, CASE WHEN v_has_admiral THEN 0.2 ELSE 0 END);',
    'v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, p_speed_percent, CASE WHEN v_has_admiral THEN 0.2 ELSE 0 END);

  -- VIP Plus: -10% flight time (stacks with Admiral)
  IF is_user_plus(v_user_id) THEN
    v_flight_time := GREATEST(10, FLOOR(v_flight_time * 0.90));
  END IF;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION join_acs_with_fleet('
    '  p_acs_id uuid,'
    '  p_origin_planet_id uuid,'
    '  p_fleet_ships jsonb,'
    '  p_speed_percent int DEFAULT 100'
    ') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'vip_time_bonuses: added -10%% flight time to join_acs_with_fleet';
END $$;
