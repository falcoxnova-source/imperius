/*
  # Fix process_fleet_arrival: transport/deploy to moon

  BUG: The previous migration (20260310100000) fixed validate_fleet_mission
       and secure_send_fleet correctly, but the FIX 3 replace() for 
       process_fleet_arrival silently failed due to indentation mismatch.
       
       As a result, when a fleet transports to a moon, the query finds
       the PLANET (not the moon) because both share coordinates and
       there's no planet_type filter. Resources end up on the planet.

  FIX: Use regexp_replace (whitespace-insensitive) to add:
       AND p.planet_type = COALESCE(fleet_record.target_type, 'planet')
       to both the transport and deploy branches.
*/

DO $$
DECLARE
  v_src text;
  v_orig text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival'
  AND pronargs = 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'process_fleet_arrival not found!';
  END IF;

  -- Check if already patched
  IF position('planet_type = COALESCE(fleet_record.target_type' IN v_src) > 0 THEN
    RAISE NOTICE 'Already patched, skipping';
    RETURN;
  END IF;

  v_orig := v_src;

  -- FIX transport branch: regexp handles any whitespace/indentation
  v_src := regexp_replace(v_src,
    E'WHEN ''transport'' THEN\\s+SELECT p\\.\\* INTO target_planet\\s+FROM planets p\\s+WHERE p\\.galaxy = fleet_record\\.target_galaxy\\s+AND p\\.solar_system = fleet_record\\.target_system\\s+AND p\\.position = fleet_record\\.target_position;',
    E'WHEN ''transport'' THEN\nSELECT p.* INTO target_planet\nFROM planets p\nWHERE p.galaxy = fleet_record.target_galaxy\nAND p.solar_system = fleet_record.target_system\nAND p.position = fleet_record.target_position\nAND p.planet_type = COALESCE(fleet_record.target_type, ''planet'');'
  );

  IF v_src = v_orig THEN
    RAISE EXCEPTION 'transport branch regex did NOT match! prosrc snippet: %', substring(v_src from position('transport' IN v_src) for 300);
  END IF;

  v_orig := v_src;

  -- FIX deploy branch: regexp handles any whitespace/indentation
  v_src := regexp_replace(v_src,
    E'WHEN ''deploy'' THEN\\s+SELECT p\\.\\* INTO target_planet\\s+FROM planets p\\s+WHERE p\\.galaxy = fleet_record\\.target_galaxy\\s+AND p\\.solar_system = fleet_record\\.target_system\\s+AND p\\.position = fleet_record\\.target_position\\s+AND p\\.user_id = fleet_record\\.user_id;',
    E'WHEN ''deploy'' THEN\nSELECT p.* INTO target_planet\nFROM planets p\nWHERE p.galaxy = fleet_record.target_galaxy\nAND p.solar_system = fleet_record.target_system\nAND p.position = fleet_record.target_position\nAND p.user_id = fleet_record.user_id\nAND p.planet_type = COALESCE(fleet_record.target_type, ''planet'');'
  );

  IF v_src = v_orig THEN
    RAISE EXCEPTION 'deploy branch regex did NOT match! prosrc snippet: %', substring(v_src from position('deploy' IN v_src) for 300);
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'SUCCESS: transport and deploy branches now filter by fleet_record.target_type';
END $$;
