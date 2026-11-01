/*
  # Fix: Exclude moons from colony count (Astrophysics limit)

  BUG: validate_fleet_mission and process_fleet_arrival count ALL entries
       in the planets table (WHERE NOT is_destroyed) when checking the
       Astrophysics colony limit. Since moons are stored in the same table
       with planet_type = 'moon', they inflate the count and block players
       from colonizing even when they have free slots.

  FIX (pg_proc text replacement — safe, surgical, idempotent):
    1. validate_fleet_mission  → add AND planet_type = 'planet'
    2. process_fleet_arrival   → add AND planet_type = 'planet'
*/

-- ============================================================
-- FIX 1: validate_fleet_mission (pg_proc text replacement)
-- ============================================================
DO $$
DECLARE
  v_src  text;
  v_prev text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'validate_fleet_mission'
    AND pronargs = 7;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'validate_fleet_mission (7 args) not found!';
  END IF;

  -- Idempotency
  IF position('user_id = p_user_id AND NOT is_destroyed AND planet_type' IN v_src) > 0 THEN
    RAISE NOTICE 'validate_fleet_mission already patched, skipping';
    RETURN;
  END IF;

  v_prev := v_src;

  v_src := replace(
    v_src,
    'FROM planets WHERE user_id = p_user_id AND NOT is_destroyed;',
    'FROM planets WHERE user_id = p_user_id AND NOT is_destroyed AND planet_type = ''planet'';'
  );

  IF v_src = v_prev THEN
    RAISE EXCEPTION 'Colony count pattern not found in validate_fleet_mission!';
  END IF;

  -- Drop + recreate to preserve DEFAULT on p_target_type
  DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, uuid, integer, integer, integer, text, text);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION validate_fleet_mission('
    || 'p_user_id uuid, p_origin_planet_id uuid, '
    || 'p_target_galaxy integer, p_target_system integer, p_target_position integer, '
    || 'p_mission_type text, p_target_type text DEFAULT ''planet'') '
    || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    || 'SET search_path = public AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'SUCCESS: validate_fleet_mission colony count now excludes moons';
END $$;


-- ============================================================
-- FIX 2: process_fleet_arrival (pg_proc text replacement)
-- ============================================================
DO $$
DECLARE
  v_src  text;
  v_prev text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival'
    AND pronargs = 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'process_fleet_arrival not found!';
  END IF;

  -- Idempotency
  IF position('user_id = fleet_record.user_id AND NOT is_destroyed AND planet_type' IN v_src) > 0 THEN
    RAISE NOTICE 'process_fleet_arrival already patched, skipping';
    RETURN;
  END IF;

  v_prev := v_src;

  v_src := replace(
    v_src,
    'FROM planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed;',
    'FROM planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed AND planet_type = ''planet'';'
  );

  IF v_src = v_prev THEN
    RAISE EXCEPTION 'Colony count pattern not found in process_fleet_arrival!';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) '
    || 'RETURNS void LANGUAGE plpgsql SECURITY DEFINER '
    || 'SET search_path = public AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'SUCCESS: process_fleet_arrival colony count now excludes moons';
END $$;
