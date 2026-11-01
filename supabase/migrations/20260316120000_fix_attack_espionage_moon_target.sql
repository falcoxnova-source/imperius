/*
  # Fix process_fleet_arrival: attack & espionage on moons

  BUG: The attack and espionage branches in process_fleet_arrival hardcode
       `p.planet_type = 'planet'`, so any fleet sent to attack or spy on a
       moon resolves against the planet at the same coordinates instead.

       The transport and deploy branches were already fixed in migration
       20260310120000, but attack and espionage were left untouched.

  FIX: Use regexp_replace (whitespace-insensitive) to change
       `p.planet_type = 'planet'`  →  `p.planet_type = COALESCE(fleet_record.target_type, 'planet')`
       in both the attack and espionage branches.

  OGame reference:
       - Attacking a moon fights the moon's defenses/ships and loots
         the moon's resources, NOT the parent planet's.
       - Espionage on a moon reports the moon's buildings, ships,
         defenses and resources.
*/

DO $$
DECLARE
  v_src  text;
  v_prev text;
  v_patched_attack   boolean := false;
  v_patched_espionage boolean := false;
BEGIN
  -- ─── Fetch live function body ───────────────────────────────────────
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival'
    AND pronargs = 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'process_fleet_arrival not found!';
  END IF;

  -- ─── Idempotency check ─────────────────────────────────────────────
  --   If both attack and espionage already use COALESCE, nothing to do.
  --   We count occurrences of the hardcoded pattern that still remain.
  --   The transport/deploy branches were already patched, so any remaining
  --   `planet_type = ''planet''' that is NOT inside a COALESCE belongs to
  --   attack, espionage or colonize. Colonize is correct (stays 'planet').

  -- ─── FIX 1: attack branch ──────────────────────────────────────────
  v_prev := v_src;

  v_src := regexp_replace(
    v_src,
    E'WHEN ''attack'' THEN'
      || E'\\s+SELECT p\\.\\* INTO target_planet'
      || E'\\s+FROM planets p'
      || E'\\s+WHERE p\\.galaxy = fleet_record\\.target_galaxy'
      || E'\\s+AND p\\.solar_system = fleet_record\\.target_system'
      || E'\\s+AND p\\.position = fleet_record\\.target_position'
      || E'\\s+AND p\\.planet_type = ''planet'';',
    E'WHEN ''attack'' THEN\n'
      || E'SELECT p.* INTO target_planet\n'
      || E'FROM planets p\n'
      || E'WHERE p.galaxy = fleet_record.target_galaxy\n'
      || E'AND p.solar_system = fleet_record.target_system\n'
      || E'AND p.position = fleet_record.target_position\n'
      || E'AND p.planet_type = COALESCE(fleet_record.target_type, ''planet'');'
  );

  IF v_src != v_prev THEN
    v_patched_attack := true;
    RAISE NOTICE 'PATCHED attack branch → COALESCE(fleet_record.target_type, ''planet'')';
  ELSE
    -- Check if already patched (using position instead of regex)
    IF position('COALESCE(fleet_record.target_type' IN
         substring(v_src from position(E'WHEN ''attack'' THEN' IN v_src) for 300)) > 0 THEN
      RAISE NOTICE 'attack branch already patched, skipping';
      v_patched_attack := true;
    ELSE
      RAISE EXCEPTION 'attack branch regex did NOT match! Snippet: %',
        substring(v_src from position(E'WHEN ''attack'' THEN' IN v_src) for 400);
    END IF;
  END IF;

  -- ─── FIX 2: espionage branch ───────────────────────────────────────
  v_prev := v_src;

  v_src := regexp_replace(
    v_src,
    E'WHEN ''espionage'' THEN'
      || E'\\s+SELECT p\\.\\* INTO target_planet'
      || E'\\s+FROM planets p'
      || E'\\s+WHERE p\\.galaxy = fleet_record\\.target_galaxy'
      || E'\\s+AND p\\.solar_system = fleet_record\\.target_system'
      || E'\\s+AND p\\.position = fleet_record\\.target_position'
      || E'\\s+AND p\\.planet_type = ''planet'';',
    E'WHEN ''espionage'' THEN\n'
      || E'SELECT p.* INTO target_planet\n'
      || E'FROM planets p\n'
      || E'WHERE p.galaxy = fleet_record.target_galaxy\n'
      || E'AND p.solar_system = fleet_record.target_system\n'
      || E'AND p.position = fleet_record.target_position\n'
      || E'AND p.planet_type = COALESCE(fleet_record.target_type, ''planet'');'
  );

  IF v_src != v_prev THEN
    v_patched_espionage := true;
    RAISE NOTICE 'PATCHED espionage branch → COALESCE(fleet_record.target_type, ''planet'')';
  ELSE
    IF position('COALESCE(fleet_record.target_type' IN
         substring(v_src from position(E'WHEN ''espionage'' THEN' IN v_src) for 300)) > 0 THEN
      RAISE NOTICE 'espionage branch already patched, skipping';
      v_patched_espionage := true;
    ELSE
      RAISE EXCEPTION 'espionage branch regex did NOT match! Snippet: %',
        substring(v_src from position(E'WHEN ''espionage'' THEN' IN v_src) for 400);
    END IF;
  END IF;

  -- ─── Recreate function only if something changed ───────────────────
  IF v_patched_attack OR v_patched_espionage THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) '
      || 'RETURNS void LANGUAGE plpgsql SECURITY DEFINER '
      || 'SET search_path = public AS $fn$ %s $fn$',
      v_src
    );
    RAISE NOTICE 'SUCCESS: attack and espionage branches now resolve moon targets correctly';
  ELSE
    RAISE NOTICE 'No changes needed – both branches already patched';
  END IF;
END $$;
