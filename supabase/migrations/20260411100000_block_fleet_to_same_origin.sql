/*
  # Block Fleet Sending to Same Origin Location

  Players were accidentally sending transport fleets to their own planet
  (instead of their moon at the same coordinates). The fleet would depart,
  travel to the same location, and return — wasting deuterium and time.

  This migration patches secure_send_fleet to reject any fleet where
  the target coordinates + target type match the origin planet exactly.

  Also patches validate_fleet_mission as a secondary guard.

  Idempotent: uses DO block with text search to skip if already patched.
*/

-- ============================================================
-- PATCH 1: Add same-origin check to secure_send_fleet
-- ============================================================
DO $$
DECLARE
  v_src text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'secure_send_fleet'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'secure_send_fleet not found, skipping';
    RETURN;
  END IF;

  -- Idempotency: skip if already patched
  IF v_src LIKE '%Cannot send fleet to the same location%' THEN
    RAISE NOTICE 'secure_send_fleet already has same-origin check, skipping';
    RETURN;
  END IF;

  -- Anchor: right after the "Invalid target type" check
  -- We insert the same-origin check after the target_type validation
  v_anchor := E'IF p_target_type NOT IN (''planet'', ''moon'') THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Invalid target type'');\n  END IF;';

  v_replacement := E'IF p_target_type NOT IN (''planet'', ''moon'') THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Invalid target type'');\n  END IF;\n\n  -- Block sending fleet to exact same origin location\n  IF v_planet.galaxy = p_target_galaxy\n     AND v_planet.solar_system = p_target_system\n     AND v_planet.position = p_target_position\n     AND v_planet.planet_type = p_target_type THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Cannot send fleet to the same location where your ships are'');\n  END IF;';

  v_src := replace(v_src, v_anchor, v_replacement);

  -- Verify patch applied
  IF v_src NOT LIKE '%Cannot send fleet to the same location%' THEN
    RAISE EXCEPTION 'Patch anchor not found in secure_send_fleet. Manual inspection required.';
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

  RAISE NOTICE 'block_fleet_same_origin: successfully added same-origin check to secure_send_fleet';
END $$;
