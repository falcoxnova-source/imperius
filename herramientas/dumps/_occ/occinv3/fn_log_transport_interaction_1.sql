CREATE OR REPLACE FUNCTION public.log_transport_interaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_planet RECORD;
  v_target_user_id uuid;
BEGIN
  IF NEW.is_completed = true AND OLD.is_completed = false 
     AND NEW.mission_type = 'transport' 
     AND NEW.is_returning = false THEN
    
    SELECT p.user_id INTO v_target_user_id
    FROM planets p
    WHERE p.galaxy = NEW.target_galaxy
      AND p.solar_system = NEW.target_system
      AND p.position = NEW.target_position
      AND p.planet_type = COALESCE(NEW.target_type, 'planet')
    LIMIT 1;
    
    IF v_target_user_id IS NOT NULL AND v_target_user_id != NEW.user_id THEN
      INSERT INTO account_interaction_log (
        from_user_id,
        to_user_id,
        interaction_type,
        metal_amount,
        crystal_amount,
        deuterium_amount
      ) VALUES (
        NEW.user_id,
        v_target_user_id,
        'transport',
        COALESCE(NEW.cargo_metal, 0),
        COALESCE(NEW.cargo_crystal, 0),
        COALESCE(NEW.cargo_deuterium, 0)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$

