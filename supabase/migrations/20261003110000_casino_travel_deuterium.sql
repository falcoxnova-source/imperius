-- [CASINO2] El viaje de la Nave Heroe al Casino cuesta deuterio.
-- Formula = la misma que ya usa la Nave Heroe en start_hero_expedition:
--   CEIL((minutos * (nivel^2 * 10 + puntos_totales * 3) + 100) * 0.25)
-- con minutos = tiempo de ida + vuelta. Se cobra al salir, del planeta principal.
-- No se reembolsa al regresar (igual que las expediciones).

CREATE OR REPLACE FUNCTION public._hero_casino_deuterium_cost(p_user_id uuid, p_flight_seconds integer)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(1, CEIL((
           CEIL(GREATEST(p_flight_seconds, 1) * 2 / 60.0)
           * (POWER(COALESCE(s.level, 1), 2) * 10
              + (COALESCE(s.attack_points, 0) + COALESCE(s.defense_points, 0)
                 + COALESCE(s.shield_points, 0) + COALESCE(s.speed_points, 0)) * 3)
           + 100) * 0.25))::bigint
  FROM (SELECT 1) one
  LEFT JOIN public.user_hero_ships s ON s.user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public._hero_casino_deuterium_cost(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Estado: anade estimated_deuterium_cost
CREATE OR REPLACE FUNCTION public.get_casino_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_access boolean;
  v_state text;
  v_trip record;
  v_ship record;
  v_main record;
  v_secs integer;
  v_on_expedition boolean := false;
  v_location jsonb := jsonb_build_object('galaxy', 3, 'system', 250, 'position', 17, 'name', 'Casino Galactico');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_access := public._hero_has_access(v_uid);

  IF NOT v_access THEN
    RETURN jsonb_build_object(
      'hero_access', false, 'location', v_location, 'state', 'unavailable',
      'can_enter', false, 'server_time', now());
  END IF;

  DELETE FROM public.hero_casino_trips
  WHERE user_id = v_uid AND returns_at IS NOT NULL AND returns_at <= now();

  v_state := public._hero_casino_state(v_uid);
  SELECT * INTO v_trip FROM public.hero_casino_trips WHERE user_id = v_uid;
  SELECT level, hp, hp_max, speed_points, repair_until INTO v_ship
  FROM public.user_hero_ships WHERE user_id = v_uid;
  SELECT EXISTS (SELECT 1 FROM public.hero_ship_active_expedition
                 WHERE user_id = v_uid AND claimed = false) INTO v_on_expedition;
  SELECT galaxy, solar_system, position INTO v_main
  FROM public.planets
  WHERE user_id = v_uid AND is_main_planet = true AND NOT is_destroyed
  LIMIT 1;

  IF v_main.galaxy IS NOT NULL THEN
    v_secs := public._hero_casino_flight_seconds(v_uid, v_main.galaxy, v_main.solar_system, v_main.position);
  END IF;

  RETURN jsonb_build_object(
    'hero_access', true,
    'location', v_location,
    'state', v_state,
    'can_enter', v_state = 'docked',
    'server_time', now(),
    'has_hero_ship', v_ship.level IS NOT NULL,
    'hero', CASE WHEN v_ship.level IS NULL THEN NULL ELSE jsonb_build_object(
      'level', v_ship.level, 'hp', v_ship.hp, 'hp_max', v_ship.hp_max,
      'speed_points', COALESCE(v_ship.speed_points, 0),
      'in_repair', v_ship.repair_until IS NOT NULL AND v_ship.repair_until > now()) END,
    'on_expedition', v_on_expedition,
    'origin', CASE WHEN v_main.galaxy IS NULL THEN NULL ELSE jsonb_build_object(
      'galaxy', v_main.galaxy, 'system', v_main.solar_system, 'position', v_main.position) END,
    'estimated_flight_seconds', v_secs,
    'estimated_deuterium_cost', CASE WHEN v_secs IS NULL THEN NULL
      ELSE public._hero_casino_deuterium_cost(v_uid, v_secs) END,
    'trip', CASE WHEN v_trip.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'departed_at', v_trip.departed_at, 'arrives_at', v_trip.arrives_at,
      'returns_at', v_trip.returns_at, 'flight_seconds', v_trip.flight_seconds) END
  );
END;
$$;

-- Viaje: cobra el deuterio del planeta principal
CREATE OR REPLACE FUNCTION public.hero_casino_travel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ship record;
  v_main record;
  v_secs integer;
  v_arrives timestamptz;
  v_cost bigint;
  v_deut numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public._hero_has_access(v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Nave Heroe aun no esta disponible para tu cuenta');
  END IF;

  IF COALESCE((SELECT vacation_mode FROM public.profiles WHERE id = v_uid), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes viajar en modo vacaciones');
  END IF;

  PERFORM public.create_hero_ship(v_uid);
  SELECT * INTO v_ship FROM public.user_hero_ships WHERE user_id = v_uid FOR UPDATE;

  IF COALESCE(v_ship.hp, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta danada. Reparala antes de viajar');
  END IF;

  IF v_ship.repair_until IS NOT NULL AND v_ship.repair_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta en reparacion');
  END IF;

  IF EXISTS (SELECT 1 FROM public.hero_ship_active_expedition WHERE user_id = v_uid AND claimed = false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta en una expedicion');
  END IF;

  DELETE FROM public.hero_casino_trips
  WHERE user_id = v_uid AND returns_at IS NOT NULL AND returns_at <= now();

  IF EXISTS (SELECT 1 FROM public.hero_casino_trips WHERE user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe ya esta en camino, en el Casino o regresando');
  END IF;

  SELECT id, galaxy, solar_system, position INTO v_main
  FROM public.planets
  WHERE user_id = v_uid AND is_main_planet = true AND NOT is_destroyed
  LIMIT 1;
  IF v_main.galaxy IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes un planeta principal');
  END IF;

  v_secs := public._hero_casino_flight_seconds(v_uid, v_main.galaxy, v_main.solar_system, v_main.position);
  v_cost := public._hero_casino_deuterium_cost(v_uid, v_secs);

  SELECT deuterium INTO v_deut FROM public.planet_resources WHERE planet_id = v_main.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos del planeta no encontrados');
  END IF;
  IF COALESCE(v_deut, 0) < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Deuterio insuficiente en tu planeta principal. Necesitas: ' || v_cost || ', tienes: ' || FLOOR(COALESCE(v_deut, 0)));
  END IF;

  UPDATE public.planet_resources SET deuterium = deuterium - v_cost WHERE planet_id = v_main.id;

  v_arrives := now() + make_interval(secs => v_secs);

  INSERT INTO public.hero_casino_trips (user_id, origin_galaxy, origin_system, origin_position,
                                        departed_at, arrives_at, flight_seconds)
  VALUES (v_uid, v_main.galaxy, v_main.solar_system, v_main.position, now(), v_arrives, v_secs);

  RETURN jsonb_build_object('success', true, 'arrives_at', v_arrives, 'flight_seconds', v_secs,
                            'deuterium_cost', v_cost);
END;
$$;

REVOKE ALL ON FUNCTION public.get_casino_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hero_casino_travel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_casino_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hero_casino_travel() TO authenticated;
