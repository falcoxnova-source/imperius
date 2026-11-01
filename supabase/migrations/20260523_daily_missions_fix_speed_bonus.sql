-- ==========================================================================
-- 1. Create get_user_daily_mission_speed_bonus() (mirror de production_bonus)
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_user_daily_mission_speed_bonus(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus numeric := 0;
BEGIN
  SELECT COALESCE(SUM(bonus_value), 0) INTO v_bonus
  FROM user_active_bonuses
  WHERE user_id = p_user_id
    AND bonus_type = 'speed_bonus'
    AND expires_at > now();
  RETURN v_bonus / 100.0;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_daily_mission_speed_bonus(uuid) TO authenticated;

-- ==========================================================================
-- 2. secure_send_fleet: aplicar speed_bonus de misiones diarias
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
    '  p_target_type text DEFAULT ''planet'''
    ') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'secure_send_fleet: daily mission speed bonus applied';
END $$;

-- ==========================================================================
-- 3. join_acs_with_fleet: aplicar speed_bonus de misiones diarias
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

  IF v_src LIKE '%daily mission speed bonus%' THEN
    RAISE NOTICE 'join_acs_with_fleet already has daily speed bonus, skipping';
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

  RAISE NOTICE 'join_acs_with_fleet: daily mission speed bonus applied';
END $$;
