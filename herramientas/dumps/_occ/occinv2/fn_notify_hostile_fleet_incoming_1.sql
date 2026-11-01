CREATE OR REPLACE FUNCTION public.notify_hostile_fleet_incoming()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_planet RECORD;
  attacker_profile RECORD;
  attacker_planet RECORD;
  mission_text TEXT;
  time_remaining INTERVAL;
BEGIN
  -- Only notify for hostile missions (attack, espionage, destroy)
  IF NEW.mission_type NOT IN ('attack', 'espionage', 'destroy') THEN
    RETURN NEW;
  END IF;
  
  -- Find the target planet and its owner
  SELECT p.*, pr.username as owner_name
  INTO target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = NEW.target_galaxy
    AND p.solar_system = NEW.target_system
    AND p.position = NEW.target_position
    AND p.planet_type = COALESCE(NEW.target_type, 'planet');
  
  -- Only notify if target belongs to another player
  IF NOT FOUND OR target_planet.user_id IS NULL OR target_planet.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;
  
  -- Get attacker info
  SELECT username INTO attacker_profile FROM profiles WHERE id = NEW.user_id;
  SELECT galaxy, solar_system, position INTO attacker_planet FROM planets WHERE id = NEW.origin_planet_id;
  
  -- Set mission text based on type
  CASE NEW.mission_type
    WHEN 'attack' THEN mission_text := 'atacando';
    WHEN 'espionage' THEN mission_text := 'espiando';
    WHEN 'destroy' THEN mission_text := 'destruyendo';
    ELSE mission_text := 'enviando flota a';
  END CASE;
  
  -- Calculate time remaining
  time_remaining := NEW.arrival_time - NOW();
  
  -- Send notification message to defender
  INSERT INTO messages (
    sender_id,
    recipient_id,
    subject,
    body,
    message_type
  ) VALUES (
    NULL,
    target_planet.user_id,
    'Flota hostil detectada!',
    format('El jugador %s [%s:%s:%s] te esta %s en %s [%s:%s:%s]. Tiempo estimado de llegada: %s',
      COALESCE(attacker_profile.username, 'Desconocido'),
      COALESCE(attacker_planet.galaxy, 0),
      COALESCE(attacker_planet.solar_system, 0),
      COALESCE(attacker_planet.position, 0),
      mission_text,
      target_planet.name,
      NEW.target_galaxy,
      NEW.target_system,
      NEW.target_position,
      CASE 
        WHEN time_remaining < interval '1 minute' THEN 'menos de 1 minuto'
        WHEN time_remaining < interval '1 hour' THEN floor(extract(epoch from time_remaining) / 60) || ' minutos'
        ELSE floor(extract(epoch from time_remaining) / 3600) || ' horas ' || 
             floor(mod(extract(epoch from time_remaining), 3600) / 60) || ' minutos'
      END
    ),
    'fleet_warning'
  );
  
  RETURN NEW;
END;
$function$

