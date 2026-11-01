CREATE OR REPLACE FUNCTION public.fleet_calc_fuel(p_fleet_ships jsonb, p_distance integer, p_speed_percent integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ship record;
  v_ship_type record;
  v_total_fuel bigint := 0;
  v_ship_fuel numeric;
  v_distance_factor numeric;
  v_speed_factor numeric;
BEGIN
  v_distance_factor := p_distance::numeric / 35000;
  v_speed_factor := (p_speed_percent::numeric / 100) + 1;
  
  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
  LOOP
    IF v_ship.quantity > 0 THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_ship.ship_type_id;
      
      IF v_ship_type IS NOT NULL THEN
        v_ship_fuel := v_ship_type.fuel_consumption * v_ship.quantity * v_distance_factor * v_speed_factor;
        v_total_fuel := v_total_fuel + CEIL(v_ship_fuel);
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_total_fuel;
END;
$function$

