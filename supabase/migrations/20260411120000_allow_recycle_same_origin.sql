/*
  # Allow Recycling at Same Origin Coordinates

  The previous migration (20260411100000_block_fleet_to_same_origin) blocked
  ALL fleet missions to the same origin location. This accidentally prevented
  players from recycling debris fields at their own planet coordinates.

  This patch modifies the same-origin check to allow 'recycle' missions while
  still blocking transport, deploy, and other missions to the same location.

  Idempotent: uses DO block with text search to skip if already patched.
*/

-- ============================================================
-- PATCH: Allow recycle missions to same origin in secure_send_fleet
-- ============================================================
DO $$
DECLARE
  v_src text;
  v_old_check text;
  v_new_check text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'secure_send_fleet'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'secure_send_fleet not found, skipping';
    RETURN;
  END IF;

  -- Check prerequisite: the same-origin block must exist
  IF v_src NOT LIKE '%Cannot send fleet to the same location%' THEN
    RAISE NOTICE 'Same-origin check not found in secure_send_fleet, skipping';
    RETURN;
  END IF;

  -- Idempotency: skip if recycle exception already present
  IF v_src LIKE '%p_mission_type != ''recycle''%' OR v_src LIKE '%p_mission_type <> ''recycle''%' THEN
    RAISE NOTICE 'Recycle exception already present in secure_send_fleet, skipping';
    RETURN;
  END IF;

  -- Old check: blocks ALL missions to same origin
  v_old_check := '-- Block sending fleet to exact same origin location
  IF v_planet.galaxy = p_target_galaxy
     AND v_planet.solar_system = p_target_system
     AND v_planet.position = p_target_position
     AND v_planet.planet_type = p_target_type THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''Cannot send fleet to the same location where your ships are'');
  END IF;';

  -- New check: allows 'recycle' missions to same origin
  v_new_check := '-- Block sending fleet to exact same origin location (except recycle)
  IF v_planet.galaxy = p_target_galaxy
     AND v_planet.solar_system = p_target_system
     AND v_planet.position = p_target_position
     AND v_planet.planet_type = p_target_type
     AND p_mission_type != ''recycle'' THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''Cannot send fleet to the same location where your ships are'');
  END IF;';

  v_src := replace(v_src, v_old_check, v_new_check);

  -- Verify the patch was applied
  IF v_src NOT LIKE '%p_mission_type != ''recycle''%' THEN
    RAISE EXCEPTION 'Patch failed: could not find exact same-origin check block in secure_send_fleet. Manual inspection required.';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION secure_send_fleet('
    'p_origin_planet_id uuid, p_target_galaxy int, p_target_system int, p_target_position int, '
    'p_mission_type text, p_fleet_ships jsonb, p_cargo_metal bigint DEFAULT 0, p_cargo_crystal bigint DEFAULT 0, '
    'p_cargo_deuterium bigint DEFAULT 0, p_speed_percent int DEFAULT 100, p_target_type text DEFAULT ''planet'') '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = ''public'' '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'allow_recycle_same_origin: successfully patched secure_send_fleet to allow recycle at same coordinates';
END $$;
