CREATE OR REPLACE FUNCTION public._occ_send_garrison_home(p_fleet_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  f public.fleets%ROWTYPE;
  dst public.planets%ROWTYPE;
  v_ships jsonb;
  v_dist integer;
  v_speed integer;
  v_bonus numeric := 0;
  v_time integer;
  v_ret timestamptz;
BEGIN
  -- [OCUPA5]
  SELECT * INTO f FROM public.fleets WHERE id = p_fleet_id FOR UPDATE;
  IF NOT FOUND OR f.is_returning OR f.is_completed THEN
    RETURN NULL;
  END IF;

  SELECT * INTO dst FROM public.planets
  WHERE id = f.origin_planet_id AND user_id = f.user_id AND NOT COALESCE(is_destroyed, false);
  IF NOT FOUND THEN
    SELECT * INTO dst FROM public.planets
    WHERE user_id = f.user_id AND NOT COALESCE(is_destroyed, false)
    ORDER BY COALESCE(is_main_planet, false) DESC, (planet_type = 'planet') DESC, created_at
    LIMIT 1;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('ship_type_id', ship_type_id, 'quantity', quantity))
  INTO v_ships FROM public.fleet_ships WHERE fleet_id = f.id AND quantity > 0;

  IF dst.id IS NOT NULL AND v_ships IS NOT NULL THEN
    v_dist := public.fleet_calc_distance(f.target_galaxy, f.target_system, f.target_position,
                                         dst.galaxy, dst.solar_system, dst.position);
    v_speed := public.fleet_calc_slowest_speed(v_ships, f.user_id);
  END IF;

  IF COALESCE(v_speed, 0) > 0 THEN
    IF public.has_active_officer(f.user_id, 'admiral') THEN
      v_bonus := 0.2;
    END IF;
    v_time := public.fleet_calc_flight_time(v_dist, v_speed, 100, v_bonus);
    v_time := GREATEST(10, FLOOR(v_time / (1.0 + COALESCE(public.get_user_daily_mission_speed_bonus(f.user_id), 0))))::integer;
    IF public.is_user_plus(f.user_id) THEN
      v_time := GREATEST(10, FLOOR(v_time * 0.90))::integer;
    END IF;
    v_ret := now() + make_interval(secs => v_time);
  ELSE
    v_ret := now() + GREATEST(interval '10 seconds', f.arrival_time - f.departure_time);
  END IF;

  UPDATE public.fleets
  SET is_returning = true,
      arrival_time = now(),
      return_time = v_ret,
      origin_planet_id = COALESCE(dst.id, origin_planet_id)
  WHERE id = f.id;

  RETURN v_ret;
END
$function$

