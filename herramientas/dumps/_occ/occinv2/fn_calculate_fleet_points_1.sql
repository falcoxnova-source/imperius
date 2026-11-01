CREATE OR REPLACE FUNCTION public.calculate_fleet_points(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_planet_ships_cost bigint := 0;
  v_fleet_ships_cost bigint := 0;
  v_stronghold_cost bigint := 0;
BEGIN
  -- Ships stationed on planets
  SELECT COALESCE(SUM(
    (st.metal_cost + st.crystal_cost + st.deuterium_cost)::bigint * ps.quantity
  ), 0) INTO v_planet_ships_cost
  FROM planet_ships ps
  JOIN planets p ON ps.planet_id = p.id
  JOIN ship_types st ON ps.ship_type_id = st.id
  WHERE p.user_id = p_user_id AND ps.quantity > 0;

  -- Ships currently in flight (not completed fleets)
  SELECT COALESCE(SUM(
    (st.metal_cost + st.crystal_cost + st.deuterium_cost)::bigint * fs.quantity
  ), 0) INTO v_fleet_ships_cost
  FROM fleet_ships fs
  JOIN fleets f ON fs.fleet_id = f.id
  JOIN ship_types st ON fs.ship_type_id = st.id
  WHERE f.user_id = p_user_id
    AND f.is_completed = false
    AND fs.quantity > 0;

  -- [FLEETPTS1] Ships garrisoned in Alliance Fortresses and Treasure Planets
  SELECT COALESCE(SUM(
    (st.metal_cost + st.crystal_cost + st.deuterium_cost)::bigint * s.quantity
  ), 0) INTO v_stronghold_cost
  FROM (
    SELECT ship_type_id, quantity FROM fortress_ships WHERE user_id = p_user_id AND quantity > 0
    UNION ALL
    SELECT ship_type_id, quantity FROM treasure_planet_ships WHERE user_id = p_user_id AND quantity > 0
  ) s
  JOIN ship_types st ON s.ship_type_id = st.id;

  RETURN floor((v_planet_ships_cost + v_fleet_ships_cost + v_stronghold_cost) / 1000)::integer;
END;
$function$

