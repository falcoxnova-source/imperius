-- =============================================================================
-- ESPIONAGE SYSTEM IMPROVEMENTS
-- =============================================================================
-- 1.1 Probe destruction: 3% chance per probe sent. If destroyed, report is 
--     still sent (OGame rule) but probes don't return home.
-- 1.2 Multi-probe boost: Every 5 probes = +1 effective spy level.
--     Galaxy page sends configurable probe count (handled in frontend).
--     process_fleet_arrival now extracts actual probe count from fleet_ships.
-- 1.3 Probe-only attacks: ALREADY BLOCKED (secure_send_fleet validation).
--     No changes needed.
-- =============================================================================

-- ============================================================
-- STEP 1: Update generate_espionage_report
-- Changes:
--   - Visibility: each 5 probes = +1 effective spy level (was: (probes-1)*0.5)
--   - Destruction chance: 3% per probe (was: just notification, no destruction)
--   - Returns destruction result so caller knows if probes survived
-- ============================================================

-- Drop old version and create new with destruction result
-- Must DROP because return type changed from void to jsonb
DROP FUNCTION IF EXISTS generate_espionage_report(uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS generate_espionage_report(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION generate_espionage_report(
  p_attacker_id uuid, 
  p_target_planet_id uuid, 
  p_target_user_id uuid,
  p_probe_count integer DEFAULT 1
)
RETURNS jsonb  -- Changed from void to jsonb to return destruction result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  target_resources RECORD;
  target_buildings JSONB;
  target_ships JSONB;
  target_defenses JSONB;
  target_techs JSONB;
  target_planet RECORD;
  report_data JSONB;
  v_attacker_spy_level integer;
  v_defender_counter_spy_level integer;
  v_tech_difference numeric;
  v_effective_tech_diff numeric;
  v_detection_chance numeric;
  v_detected boolean := false;
  v_visibility_level integer;
  v_probe_bonus numeric;
  v_allied_ships JSONB;
  v_allied_fleet RECORD;
  v_ally_username text;
  v_ally_ships JSONB;
  -- New: destruction
  v_destruction_chance numeric;
  v_probes_destroyed boolean := false;
BEGIN
  SELECT * INTO target_planet FROM planets WHERE id = p_target_planet_id;

  SELECT COALESCE(ut.level, 0) INTO v_attacker_spy_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_attacker_id AND tt.code = 'espionage_tech';
  v_attacker_spy_level := COALESCE(v_attacker_spy_level, 0);

  SELECT COALESCE(ut.level, 0) INTO v_defender_counter_spy_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_target_user_id AND tt.code = 'espionage_tech';
  v_defender_counter_spy_level := COALESCE(v_defender_counter_spy_level, 0);

  v_tech_difference := v_attacker_spy_level - v_defender_counter_spy_level;
  
  -- NEW FORMULA: Each 5 probes = +1 effective spy level
  -- User request: "cada 5 sondas el nivel de espionaje aumenta en 1"
  -- 1 probe = +0, 5 probes = +1, 10 probes = +2, 15 probes = +3, etc.
  v_probe_bonus := FLOOR(COALESCE(p_probe_count, 1)::numeric / 5.0);
  v_effective_tech_diff := v_tech_difference + v_probe_bonus;

  IF v_effective_tech_diff >= 4 THEN
    v_visibility_level := 5;  -- Technologies
  ELSIF v_effective_tech_diff >= 2 THEN
    v_visibility_level := 4;  -- Buildings
  ELSIF v_effective_tech_diff >= 0 THEN
    v_visibility_level := 3;  -- Defenses
  ELSIF v_effective_tech_diff >= -2 THEN
    v_visibility_level := 2;  -- Ships
  ELSE
    v_visibility_level := 1;  -- Resources only
  END IF;

  -- Resources (always visible)
  SELECT metal, crystal, deuterium, energy_used, energy_max
  INTO target_resources
  FROM planet_resources WHERE planet_id = p_target_planet_id;

  -- Ships (visibility level >= 2): planet owner's ships
  IF v_visibility_level >= 2 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'name', st.name,
      'quantity', ps.quantity
    ))
    INTO target_ships
    FROM planet_ships ps
    JOIN ship_types st ON ps.ship_type_id = st.id
    WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0;

    -- Allied stationed fleets (deployed via Alliance Depot)
    v_allied_ships := '[]'::jsonb;
    
    FOR v_allied_fleet IN
      SELECT f.id as fleet_id, f.user_id as ally_user_id
      FROM fleets f
      WHERE f.is_completed = false
        AND f.is_returning = false
        AND f.mission_type = 'hold'
        AND f.target_galaxy = target_planet.galaxy
        AND f.target_system = target_planet.solar_system
        AND f.target_position = target_planet.position
        AND f.user_id != p_target_user_id
    LOOP
      SELECT username INTO v_ally_username 
      FROM profiles WHERE id = v_allied_fleet.ally_user_id;
      
      SELECT jsonb_agg(jsonb_build_object(
        'name', st.name,
        'quantity', fs.quantity,
        'owner', v_ally_username
      ))
      INTO v_ally_ships
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = v_allied_fleet.fleet_id AND fs.quantity > 0;

      IF v_ally_ships IS NOT NULL THEN
        v_allied_ships := v_allied_ships || v_ally_ships;
      END IF;
    END LOOP;
  ELSE
    target_ships := NULL;
    v_allied_ships := NULL;
  END IF;

  -- Defenses (visibility level >= 3)
  IF v_visibility_level >= 3 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'name', dt.name,
      'quantity', pd.quantity
    ))
    INTO target_defenses
    FROM planet_defenses pd
    JOIN defense_types dt ON pd.defense_type_id = dt.id
    WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0;
  ELSE
    target_defenses := NULL;
  END IF;

  -- Buildings (visibility level >= 4)
  IF v_visibility_level >= 4 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'name', bt.name,
      'level', pb.level
    ))
    INTO target_buildings
    FROM planet_buildings pb
    JOIN building_types bt ON pb.building_type_id = bt.id
    WHERE pb.planet_id = p_target_planet_id AND pb.level > 0;
  ELSE
    target_buildings := NULL;
  END IF;

  -- Technologies (visibility level >= 5)
  IF v_visibility_level >= 5 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'name', tt.name,
      'level', ut.level
    ))
    INTO target_techs
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_target_user_id AND ut.level > 0;
  ELSE
    target_techs := NULL;
  END IF;

  -- Detection chance (defender notified)
  v_detection_chance := GREATEST(0, LEAST(100, 
    30 + (v_defender_counter_spy_level - v_attacker_spy_level) * 8 + (COALESCE(p_probe_count, 1) * 3)
  ));
  v_detected := random() * 100 < v_detection_chance;

  -- NEW: Destruction chance = 3% per probe, capped at 100%
  -- "la probabilidad de destruir 5 sondas sería del 15% (3% * 5)"
  v_destruction_chance := LEAST(100, COALESCE(p_probe_count, 1) * 3);
  v_probes_destroyed := random() * 100 < v_destruction_chance;

  -- Build report JSON (report is ALWAYS sent, even if probes are destroyed - OGame rule)
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
    'technologies', COALESCE(target_techs, '[]'::jsonb),
    'allied_fleets', COALESCE(v_allied_ships, '[]'::jsonb),
    'visibility_level', v_visibility_level,
    'tech_difference', v_tech_difference,
    'probe_count', COALESCE(p_probe_count, 1),
    'spy_detected', v_detected,
    'probes_destroyed', v_probes_destroyed,
    'destruction_chance', v_destruction_chance
  );

  -- Send espionage report to attacker
  INSERT INTO messages (
    sender_id,
    recipient_id,
    subject,
    body,
    message_type
  ) VALUES (
    NULL,
    p_attacker_id,
    CASE WHEN v_probes_destroyed 
      THEN '⚠️ Reporte de Espionaje - ' || target_planet.name || ' (Sondas destruidas)'
      ELSE 'Reporte de Espionaje - ' || target_planet.name
    END,
    report_data::text,
    'espionage'
  );

  -- If detected, notify defender
  IF v_detected THEN
    INSERT INTO messages (
      sender_id,
      recipient_id,
      subject,
      body,
      message_type
    ) VALUES (
      NULL,
      p_target_user_id,
      'Actividad de Espionaje Detectada',
      format('Tus sistemas de contraespionaje detectaron actividad de espionaje en tu planeta %s [%s:%s:%s]. Un jugador enemigo envió %s sonda(s) para obtener información sobre tus instalaciones.%s',
        target_planet.name, target_planet.galaxy, target_planet.solar_system, target_planet.position,
        COALESCE(p_probe_count, 1),
        CASE WHEN v_probes_destroyed THEN ' Las sondas enemigas fueron destruidas.' ELSE '' END
      ),
      'espionage'
    );
  END IF;

  -- Return destruction result for the caller (process_fleet_arrival)
  RETURN jsonb_build_object(
    'probes_destroyed', v_probes_destroyed,
    'detected', v_detected
  );
END;
$function$;

-- ============================================================
-- STEP 2: Patch process_fleet_arrival espionage branch
-- Replace the 3-arg call with proper probe counting + destruction
-- ============================================================

DO $$
DECLARE
  v_full_src text;
  v_new_src text;
  v_old_espionage text;
  v_new_espionage text;
BEGIN
  -- Get current function source
  SELECT prosrc INTO v_full_src FROM pg_proc 
  WHERE proname = 'process_fleet_arrival'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY oid DESC LIMIT 1;

  IF v_full_src IS NULL THEN
    RAISE EXCEPTION 'process_fleet_arrival not found';
  END IF;

  -- Check if already patched (idempotent)
  IF v_full_src LIKE '%v_esp_probe_count%' THEN
    RAISE NOTICE 'process_fleet_arrival already patched with espionage probe counting, skipping';
    RETURN;
  END IF;

  -- The old espionage block to replace (exact match)
  v_old_espionage := 
'WHEN ''espionage'' THEN
SELECT p.* INTO target_planet
FROM planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position
AND p.planet_type = COALESCE(fleet_record.target_type, ''planet'');

IF FOUND AND target_planet.user_id IS NOT NULL THEN
PERFORM generate_espionage_report(fleet_record.user_id, target_planet.id, target_planet.user_id);
END IF;
UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;';

  -- The new espionage block with probe counting + destruction
  v_new_espionage := 
'WHEN ''espionage'' THEN
SELECT p.* INTO target_planet
FROM planets p
WHERE p.galaxy = fleet_record.target_galaxy
AND p.solar_system = fleet_record.target_system
AND p.position = fleet_record.target_position
AND p.planet_type = COALESCE(fleet_record.target_type, ''planet'');

IF FOUND AND target_planet.user_id IS NOT NULL THEN
  -- Extract actual probe count from fleet_ships
  DECLARE
    v_esp_probe_count integer := 1;
    v_esp_probe_type_id integer;
    v_esp_result jsonb;
  BEGIN
    SELECT id INTO v_esp_probe_type_id FROM ship_types WHERE code = ''espionage_probe'';
    IF v_esp_probe_type_id IS NOT NULL THEN
      SELECT COALESCE(quantity, 1) INTO v_esp_probe_count
      FROM fleet_ships
      WHERE fleet_id = p_fleet_id AND ship_type_id = v_esp_probe_type_id;
      v_esp_probe_count := GREATEST(1, COALESCE(v_esp_probe_count, 1));
    END IF;

    -- Generate report (always sent, even if probes destroyed - OGame rule)
    -- Returns {probes_destroyed: bool, detected: bool}
    v_esp_result := generate_espionage_report(
      fleet_record.user_id, target_planet.id, target_planet.user_id, v_esp_probe_count
    );

    -- If probes destroyed: mark fleet completed (they don''t return)
    IF (v_esp_result->>''probes_destroyed'')::boolean THEN
      DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
      UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;
  END;
ELSE
  -- No target planet found, just return
  UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
END IF;';

  -- Apply replacement
  v_new_src := replace(v_full_src, v_old_espionage, v_new_espionage);

  -- Verify replacement worked
  IF v_new_src = v_full_src THEN
    RAISE EXCEPTION 'Could not find espionage block in process_fleet_arrival. The function may have been modified.';
  END IF;

  -- Recreate the function
  EXECUTE '
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$' || v_new_src || '$fn$;';

  RAISE NOTICE 'process_fleet_arrival patched: espionage now counts probes and handles destruction';
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_espionage_report(uuid, uuid, uuid, integer) TO authenticated;
