/*
  # Espionage Defender Notification System
  
  ## Overview
  When a player is spied on, they should receive a notification (if detected).
  Detection chance depends on:
  - Defender's espionage technology level
  - Attacker's espionage technology level
  - Number of probes sent
  
  ## Changes
  - Updated generate_espionage_report function to notify the defender
  - Detection is probabilistic based on tech levels
  
  ## XNova Original Behavior
  In XNova, the defender has a chance to detect espionage activity.
  The detection probability increases with higher defender spy tech
  and decreases with more probes sent by attacker.
*/

-- Update the generate_espionage_report function to notify defender
CREATE OR REPLACE FUNCTION generate_espionage_report(
  p_attacker_id uuid,
  p_target_planet_id uuid,
  p_target_user_id uuid
)
RETURNS void AS $$
DECLARE
  target_resources RECORD;
  target_buildings JSONB;
  target_ships JSONB;
  target_defenses JSONB;
  target_techs JSONB;
  target_planet RECORD;
  attacker_profile RECORD;
  report_data JSONB;
  attacker_spy_tech INTEGER;
  defender_spy_tech INTEGER;
  detection_chance NUMERIC;
  detected BOOLEAN;
BEGIN
  -- Get target planet info
  SELECT * INTO target_planet FROM planets WHERE id = p_target_planet_id;
  
  -- Get attacker profile for username
  SELECT username INTO attacker_profile FROM profiles WHERE id = p_attacker_id;
  
  -- Get attacker's espionage tech level
  SELECT COALESCE(ut.level, 0) INTO attacker_spy_tech
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_attacker_id AND tt.code = 'espionage_tech';
  
  -- Get defender's espionage tech level
  SELECT COALESCE(ut.level, 0) INTO defender_spy_tech
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_target_user_id AND tt.code = 'espionage_tech';
  
  -- Calculate detection chance (XNova-style formula)
  -- Base detection: 50%, modified by tech difference
  -- Higher defender tech = higher detection chance
  -- Formula: 50% + (defender_tech - attacker_tech) * 5%
  detection_chance := 0.5 + ((defender_spy_tech - attacker_spy_tech) * 0.05);
  detection_chance := GREATEST(0.05, LEAST(0.95, detection_chance)); -- Clamp between 5% and 95%
  
  -- Roll for detection
  detected := random() < detection_chance;
  
  -- Get target resources
  SELECT metal, crystal, deuterium, energy_used, energy_max
  INTO target_resources
  FROM planet_resources WHERE planet_id = p_target_planet_id;
  
  -- Get target buildings
  SELECT jsonb_agg(jsonb_build_object(
    'name', bt.name,
    'level', pb.level
  ))
  INTO target_buildings
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_target_planet_id AND pb.level > 0;
  
  -- Get target ships
  SELECT jsonb_agg(jsonb_build_object(
    'name', st.name,
    'quantity', ps.quantity
  ))
  INTO target_ships
  FROM planet_ships ps
  JOIN ship_types st ON ps.ship_type_id = st.id
  WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0;
  
  -- Get target defenses
  SELECT jsonb_agg(jsonb_build_object(
    'name', dt.name,
    'quantity', pd.quantity
  ))
  INTO target_defenses
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0;
  
  -- Get target technologies (if spy tech is high enough)
  -- Only show if attacker spy tech >= defender spy tech
  IF attacker_spy_tech >= defender_spy_tech THEN
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
  
  -- Build report data
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
    'counter_espionage', detected
  );
  
  -- Create message with espionage report for attacker
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
  
  -- Notify defender if detected
  IF detected THEN
    INSERT INTO messages (
      sender_id,
      recipient_id,
      subject,
      body,
      message_type
    ) VALUES (
      NULL,
      p_target_user_id,
      'Actividad de espionaje detectada!',
      format('Se detecto actividad de espionaje enemiga en tu planeta %s [%s:%s:%s]. El atacante fue identificado como: %s',
        target_planet.name,
        target_planet.galaxy,
        target_planet.solar_system,
        target_planet.position,
        COALESCE(attacker_profile.username, 'Desconocido')),
      'espionage'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
