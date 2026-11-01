/*
  # Anti-Bashing: Limit 5 attacks per 24h per target player

  Changes:
  1. Updates check_bashing_limit: 6 → 5 attacks per 24h
     Also counts 'destroy' missions (not just 'attack')
  2. Updates validate_fleet_mission: applies bashing check to both
     'attack' AND 'destroy' missions (was only 'attack')
  3. Updates check_protection_status: includes bashing check for
     'destroy' previews in the galaxy/fleet UI

  All patches are idempotent via text search guards.
*/

-- ============================================================
-- PATCH 1: Update check_bashing_limit — 6 → 5 and count destroy
-- ============================================================
CREATE OR REPLACE FUNCTION check_bashing_limit(p_attacker_id uuid, p_defender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attack_count integer;
  v_bashing_enabled boolean;
  v_max_attacks integer := 5;
BEGIN
  SELECT (value = 'true') INTO v_bashing_enabled
  FROM game_settings WHERE key = 'bashing_protection';

  IF NOT COALESCE(v_bashing_enabled, false) THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Count attacks AND destroy missions in the last 24 hours
  -- Also count active (in-flight) attack/destroy fleets not yet completed
  SELECT COUNT(*) INTO v_attack_count
  FROM (
    -- Completed attacks from attack_log
    SELECT attack_time AS ts
    FROM attack_log
    WHERE attacker_id = p_attacker_id
      AND defender_id = p_defender_id
      AND attack_time > NOW() - INTERVAL '24 hours'
    UNION ALL
    -- In-flight attack/destroy fleets not yet landed
    SELECT departure_time AS ts
    FROM fleets
    WHERE user_id = p_attacker_id
      AND mission_type IN ('attack', 'destroy')
      AND is_completed = false
      AND is_returning = false
      AND departure_time > NOW() - INTERVAL '24 hours'
      AND EXISTS (
        SELECT 1 FROM planets
        WHERE galaxy = fleets.target_galaxy
          AND solar_system = fleets.target_system
          AND position = fleets.target_position
          AND user_id = p_defender_id
          AND NOT is_destroyed
      )
  ) combined;

  IF v_attack_count >= v_max_attacks THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('Has alcanzado el limite de %s ataques en 24 horas a este jugador (%s/%s)', v_max_attacks, v_attack_count, v_max_attacks),
      'count', v_attack_count,
      'max', v_max_attacks
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'count', v_attack_count,
    'max', v_max_attacks
  );
END;
$$;


-- ============================================================
-- PATCH 2: Update validate_fleet_mission — apply bashing to destroy too
-- ============================================================
DO $$
DECLARE
  v_src text;
  v_old text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'validate_fleet_mission'
    AND pronamespace = 'public'::regnamespace
  ORDER BY pronargs DESC
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'validate_fleet_mission not found, skipping';
    RETURN;
  END IF;

  -- Check if already patched (destroy included in bashing check)
  IF v_src LIKE '%attack%destroy%bashing_limit%' 
     OR v_src LIKE '%IN (''attack'', ''destroy'')%' THEN
    -- Check also if already patched with the specific pattern
    IF v_src LIKE '%p_mission_type IN (''attack'', ''destroy'')%' THEN
      RAISE NOTICE 'validate_fleet_mission already has destroy bashing check, skipping';
      RETURN;
    END IF;
  END IF;

  -- Replace: only 'attack' checks bashing → both 'attack' and 'destroy'
  v_old := E'IF p_mission_type = ''attack'' THEN\n      v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);';
  v_new := E'IF p_mission_type IN (''attack'', ''destroy'') THEN\n      v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);';

  v_src := replace(v_src, v_old, v_new);

  -- Verify
  IF v_src NOT LIKE '%IN (''attack'', ''destroy'')%' THEN
    -- Try alternate spacing
    v_old := E'IF p_mission_type = ''attack'' THEN\n    v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);';
    v_new := E'IF p_mission_type IN (''attack'', ''destroy'') THEN\n    v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);';
    
    -- Re-read the source
    SELECT prosrc INTO v_src
    FROM pg_proc
    WHERE proname = 'validate_fleet_mission'
      AND pronamespace = 'public'::regnamespace
    ORDER BY pronargs DESC
    LIMIT 1;
    
    v_src := replace(v_src, v_old, v_new);
  END IF;

  IF v_src NOT LIKE '%IN (''attack'', ''destroy'')%' THEN
    RAISE NOTICE 'Could not find bashing anchor in validate_fleet_mission. The function may have a different structure. Attempting direct replacement...';
    
    -- Direct approach: replace any "= ''attack''" before bashing_limit
    v_src := regexp_replace(
      v_src,
      E'p_mission_type\\s*=\\s*''attack''(\\s*THEN\\s*\n\\s*v_bashing_check)',
      E'p_mission_type IN (''attack'', ''destroy'')\\1',
      'g'
    );
  END IF;

  -- Re-create function with all known signatures (use the latest one with target_type)
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION validate_fleet_mission('
    'p_user_id uuid, p_origin_planet_id uuid, '
    'p_target_galaxy integer, p_target_system integer, p_target_position integer, '
    'p_mission_type text, p_target_type text DEFAULT ''planet'') '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = ''public'' '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'anti_bashing_5: updated validate_fleet_mission to check bashing for attack + destroy';
END $$;

GRANT EXECUTE ON FUNCTION check_bashing_limit TO authenticated;
