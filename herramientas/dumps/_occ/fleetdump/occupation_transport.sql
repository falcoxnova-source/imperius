CREATE OR REPLACE FUNCTION public.occupation_transport(p_occupation_id uuid, p_ships jsonb, p_metal bigint, p_crystal bigint, p_deuterium bigint, p_target_planet_id uuid, p_speed_percent integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  o public.occupations%ROWTYPE;
  src public.planets%ROWTYPE;
  dst public.planets%ROWTYPE;
  g public.fleets%ROWTYPE;
  v_ship record;
  v_have integer;
  v_sent bigint := 0;
  v_total bigint := 0;
  v_cap bigint := 0;
  v_m bigint := GREATEST(COALESCE(p_metal, 0), 0);
  v_c bigint := GREATEST(COALESCE(p_crystal, 0), 0);
  v_d bigint := GREATEST(COALESCE(p_deuterium, 0), 0);
  v_dist integer;
  v_speed integer;
  v_bonus numeric := 0;
  v_time integer;
  v_fuel bigint;
  v_res record;
  v_fleet_id uuid;
  v_arrival timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  IF p_speed_percent IS NULL OR p_speed_percent < 10 OR p_speed_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La velocidad debe estar entre 10 y 100');
  END IF;
  IF p_ships IS NULL OR jsonb_typeof(p_ships) <> 'array' OR jsonb_array_length(p_ships) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selecciona las naves a enviar');
  END IF;

  SELECT * INTO o FROM public.occupations
  WHERE id = p_occupation_id AND occupier_id = v_uid AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ocupación no encontrada');
  END IF;

  SELECT * INTO dst FROM public.planets
  WHERE id = p_target_planet_id AND user_id = v_uid AND NOT COALESCE(is_destroyed, false);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Destino no válido: debe ser uno de tus planetas o lunas');
  END IF;
  IF public._occ_active(dst.id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El destino está ocupado por otro jugador');
  END IF;
  IF public._colony_listed_since(dst.id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El destino está en venta en el mercado');
  END IF;

  SELECT * INTO g FROM public.fleets WHERE id = o.garrison_fleet_id FOR UPDATE;
  IF NOT FOUND OR g.is_completed OR g.is_returning THEN
    RETURN jsonb_build_object('success', false, 'error', 'La guarnición no está disponible');
  END IF;

  PERFORM public._occ_process_builds(o.id);
  PERFORM public.calculate_and_sync_resources_internal(o.planet_id, o.owner_id);
  SELECT * INTO src FROM public.planets WHERE id = o.planet_id;

  FOR v_ship IN SELECT x.ship_type_id, SUM(x.quantity)::bigint AS quantity
                FROM jsonb_to_recordset(p_ships) AS x(ship_type_id integer, quantity integer)
                WHERE COALESCE(x.quantity, 0) > 0
                GROUP BY x.ship_type_id
  LOOP
    SELECT fs.quantity INTO v_have FROM public.fleet_ships fs
    WHERE fs.fleet_id = g.id AND fs.ship_type_id = v_ship.ship_type_id;
    IF COALESCE(v_have, 0) < v_ship.quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'No tienes suficientes naves en la guarnición');
    END IF;
    v_sent := v_sent + v_ship.quantity;
    v_cap := v_cap + v_ship.quantity * COALESCE((SELECT cargo_capacity FROM public.ship_types WHERE id = v_ship.ship_type_id), 0);
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_ships) AS x(ship_type_id integer, quantity integer)
             JOIN public.ship_types st ON st.id = x.ship_type_id
             WHERE st.code = 'occupation_ship' AND COALESCE(x.quantity, 0) > 0) THEN -- [OCUPA5]
    RETURN jsonb_build_object('success', false, 'error', 'La Nave de Ocupación debe quedarse en el planeta ocupado. Para retirarla usa "Abandonar ocupación".');
  END IF;
  IF v_sent = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selecciona las naves a enviar');
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_total FROM public.fleet_ships WHERE fleet_id = g.id AND quantity > 0;
  IF v_total - v_sent < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes dejar al menos una nave como guarnición. Para retirar todo usa "Abandonar ocupación".');
  END IF;

  IF v_m + v_c + v_d > v_cap THEN
    RETURN jsonb_build_object('success', false, 'error', 'La carga supera la capacidad de las naves seleccionadas');
  END IF;

  v_dist := public.fleet_calc_distance(src.galaxy, src.solar_system, src.position, dst.galaxy, dst.solar_system, dst.position);
  v_speed := public.fleet_calc_slowest_speed(
    (SELECT jsonb_agg(jsonb_build_object('ship_type_id', x.ship_type_id, 'quantity', x.quantity))
     FROM jsonb_to_recordset(p_ships) AS x(ship_type_id integer, quantity integer) WHERE COALESCE(x.quantity, 0) > 0), v_uid);
  IF COALESCE(v_speed, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ninguna nave seleccionada puede volar');
  END IF;
  IF public.has_active_officer(v_uid, 'admiral') THEN
    v_bonus := 0.2;
  END IF;
  v_time := public.fleet_calc_flight_time(v_dist, v_speed, p_speed_percent, v_bonus);
  v_time := GREATEST(10, FLOOR(v_time / (1.0 + COALESCE(public.get_user_daily_mission_speed_bonus(v_uid), 0))))::integer;
  IF public.is_user_plus(v_uid) THEN
    v_time := GREATEST(10, FLOOR(v_time * 0.90))::integer;
  END IF;
  v_fuel := public.fleet_calc_fuel(
    (SELECT jsonb_agg(jsonb_build_object('ship_type_id', x.ship_type_id, 'quantity', x.quantity))
     FROM jsonb_to_recordset(p_ships) AS x(ship_type_id integer, quantity integer) WHERE COALESCE(x.quantity, 0) > 0),
    v_dist, p_speed_percent);

  SELECT metal, crystal, deuterium INTO v_res FROM public.planet_resources WHERE planet_id = o.planet_id FOR UPDATE;
  IF COALESCE(v_res.deuterium, 0) < v_fuel + v_d THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente en el planeta ocupado para combustible y carga');
  END IF;
  IF COALESCE(v_res.metal, 0) < v_m OR COALESCE(v_res.crystal, 0) < v_c THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos insuficientes en el planeta ocupado');
  END IF;

  v_arrival := now() + make_interval(secs => v_time);

  -- Despliegue hacia un planeta propio: al llegar descarga naves y recursos y termina.
  INSERT INTO public.fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type,
    mission_type, cargo_metal, cargo_crystal, cargo_deuterium, departure_time, arrival_time, return_time)
  VALUES (v_uid, dst.id, dst.galaxy, dst.solar_system, dst.position, dst.planet_type,
    'deploy', v_m, v_c, v_d, now(), v_arrival, v_arrival + make_interval(secs => v_time))
  RETURNING id INTO v_fleet_id;

  FOR v_ship IN SELECT x.ship_type_id, SUM(x.quantity)::integer AS quantity
                FROM jsonb_to_recordset(p_ships) AS x(ship_type_id integer, quantity integer)
                WHERE COALESCE(x.quantity, 0) > 0
                GROUP BY x.ship_type_id
  LOOP
    INSERT INTO public.fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_fleet_id, v_ship.ship_type_id, v_ship.quantity);
    UPDATE public.fleet_ships SET quantity = quantity - v_ship.quantity
    WHERE fleet_id = g.id AND ship_type_id = v_ship.ship_type_id AND quantity > v_ship.quantity;
    IF NOT FOUND THEN
      DELETE FROM public.fleet_ships WHERE fleet_id = g.id AND ship_type_id = v_ship.ship_type_id;
    END IF;
  END LOOP;

  UPDATE public.planet_resources
  SET metal = metal - v_m, crystal = crystal - v_c, deuterium = deuterium - (v_fuel + v_d)
  WHERE planet_id = o.planet_id;

  RETURN jsonb_build_object('success', true, 'fleet_id', v_fleet_id, 'arrival_time', v_arrival,
    'flight_time', v_time, 'fuel_consumption', v_fuel,
    'message', format('Flota enviada a %s [%s:%s:%s].', dst.name, dst.galaxy, dst.solar_system, dst.position));
END
$function$

