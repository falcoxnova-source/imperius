-- ==========================================================================
-- Fix: secure_send_fleet overload conflict caused by migration
-- 20260523_daily_missions_fix_speed_bonus.sql which recreated the function
-- WITHOUT the p_override_user_id parameter, creating two overloads.
-- ==========================================================================

-- 1. Drop the incorrect 11-parameter overload (without p_override_user_id)
DROP FUNCTION IF EXISTS secure_send_fleet(uuid, int, int, int, text, jsonb, bigint, bigint, bigint, int, text);

-- 2. Patch the remaining function (with p_override_user_id) to add speed bonus
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

  IF v_src LIKE '%daily mission speed bonus%' THEN
    RAISE NOTICE 'secure_send_fleet already has daily speed bonus, skipping';
    RETURN;
  END IF;

  v_src := replace(v_src,
    'IF is_user_plus(v_user_id) THEN
    v_flight_time := GREATEST(10, FLOOR(v_flight_time * 0.90));
  END IF;',
    'IF is_user_plus(v_user_id) THEN
    v_flight_time := GREATEST(10, FLOOR(v_flight_time * 0.90));
  END IF;

  -- Daily mission speed bonus (stacks with Admiral and VIP)
  IF get_user_daily_mission_speed_bonus(v_user_id) > 0 THEN
    v_flight_time := GREATEST(10, FLOOR(v_flight_time / (1 + get_user_daily_mission_speed_bonus(v_user_id))));
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
    '  p_target_type text DEFAULT ''planet'','
    '  p_override_user_id uuid DEFAULT NULL'
    ') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'secure_send_fleet fixed: restored p_override_user_id + daily mission speed bonus';
END $$;
