CREATE OR REPLACE FUNCTION public.fleet_calc_slowest_speed(p_fleet_ships jsonb, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ship record;
  v_ship_type record;
  v_tech_combustion int := 0;
  v_tech_impulse int := 0;
  v_tech_hyperspace int := 0;
  v_speed int;
  v_slowest int := 999999999;
BEGIN
  SELECT COALESCE(
    (SELECT level FROM user_technologies ut 
     JOIN technology_types tt ON ut.technology_type_id = tt.id 
     WHERE ut.user_id = p_user_id AND tt.code = 'combustion_drive'), 0
  ) INTO v_tech_combustion;
  
  SELECT COALESCE(
    (SELECT level FROM user_technologies ut 
     JOIN technology_types tt ON ut.technology_type_id = tt.id 
     WHERE ut.user_id = p_user_id AND tt.code = 'impulse_drive'), 0
  ) INTO v_tech_impulse;
  
  SELECT COALESCE(
    (SELECT level FROM user_technologies ut 
     JOIN technology_types tt ON ut.technology_type_id = tt.id 
     WHERE ut.user_id = p_user_id AND tt.code = 'hyperspace_drive'), 0
  ) INTO v_tech_hyperspace;

  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
  LOOP
    IF v_ship.quantity > 0 THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_ship.ship_type_id;
      
      IF v_ship_type.base_speed > 0 THEN
        v_speed := fleet_calc_ship_speed(
          v_ship_type.code,
          v_ship_type.base_speed,
          v_tech_combustion,
          v_tech_impulse,
          v_tech_hyperspace
        );
        
        IF v_speed < v_slowest THEN
          v_slowest := v_speed;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  IF v_slowest = 999999999 THEN
    RETURN 0;
  END IF;
  
  RETURN v_slowest;
END;
$function$

