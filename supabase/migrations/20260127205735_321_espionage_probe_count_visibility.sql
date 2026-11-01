/*
  # Improve Espionage Report Visibility System

  ## Problem
  The espionage report visibility only considers tech difference, not probe count.
  In original OGame, more probes = more information revealed.

  ## Solution
  Add probe count as a factor in visibility calculation:
  - Each probe beyond the first adds +0.5 to effective tech level
  - This allows players with lower tech to still get info by sending more probes
  - But they also risk more probes being detected/destroyed

  ## Changes
  - Modified generate_espionage_report to accept probe count parameter
  - Visibility now considers: tech_difference + (probe_count - 1) * 0.5
*/

CREATE OR REPLACE FUNCTION generate_espionage_report(
  p_attacker_id uuid, 
  p_target_planet_id uuid, 
  p_target_user_id uuid,
  p_probe_count integer DEFAULT 1
)
RETURNS void
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
  
  v_probe_bonus := GREATEST(0, (COALESCE(p_probe_count, 1) - 1)) * 0.5;
  v_effective_tech_diff := v_tech_difference + v_probe_bonus;

  IF v_effective_tech_diff >= 4 THEN
    v_visibility_level := 5;
  ELSIF v_effective_tech_diff >= 2 THEN
    v_visibility_level := 4;
  ELSIF v_effective_tech_diff >= 0 THEN
    v_visibility_level := 3;
  ELSIF v_effective_tech_diff >= -2 THEN
    v_visibility_level := 2;
  ELSE
    v_visibility_level := 1;
  END IF;

  SELECT metal, crystal, deuterium, energy_used, energy_max
  INTO target_resources
  FROM planet_resources WHERE planet_id = p_target_planet_id;

  IF v_visibility_level >= 2 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'name', st.name,
      'quantity', ps.quantity
    ))
    INTO target_ships
    FROM planet_ships ps
    JOIN ship_types st ON ps.ship_type_id = st.id
    WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0;
  ELSE
    target_ships := NULL;
  END IF;

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

  v_detection_chance := GREATEST(0, LEAST(100, 
    30 + (v_defender_counter_spy_level - v_attacker_spy_level) * 8 + (COALESCE(p_probe_count, 1) * 3)
  ));
  v_detected := random() * 100 < v_detection_chance;

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
    'visibility_level', v_visibility_level,
    'tech_difference', v_tech_difference,
    'probe_count', COALESCE(p_probe_count, 1),
    'spy_detected', v_detected
  );

  INSERT INTO messages (
    sender_id,
    recipient_id,
    subject,
    body,
    message_type
  ) VALUES (
    NULL,
    p_attacker_id,
    'Reporte de Espionaje - ' || target_planet.name,
    report_data::text,
    'espionage'
  );

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
      format('Tus sistemas de contraespionaje detectaron actividad de espionaje en tu planeta %s [%s:%s:%s]. Un jugador enemigo intento obtener informacion sobre tus instalaciones.',
        target_planet.name, target_planet.galaxy, target_planet.solar_system, target_planet.position),
      'espionage'
    );
  END IF;
END;
$function$;
