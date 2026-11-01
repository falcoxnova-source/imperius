-- [CASINO1] Casino Galactico (3:250:17) + acceso a la Nave Heroe.
-- * El Casino es una ubicacion virtual (no es fila de "planets"; planets.position
--   tiene CHECK 1..15, asi que nadie puede colonizarla).
-- * Solo la Nave Heroe puede viajar alli (RPC hero_casino_travel). secure_send_fleet
--   rechaza cualquier flota normal hacia esa coordenada.
-- * La Nave Heroe de momento solo esta habilitada para la lista blanca
--   (hero_access_allowlist) o si game_settings.hero_ship_public = 'true'.
-- * Para "entrar" al Casino la Nave Heroe debe estar estacionada (docked).
-- * Sin cron ni realtime: los estados se derivan de timestamps (evaluacion perezosa).

-- 1) Lista blanca (sin acceso directo desde el cliente)
CREATE TABLE IF NOT EXISTS public.hero_access_allowlist (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hero_access_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hero_access_allowlist FROM PUBLIC, anon, authenticated;

INSERT INTO public.hero_access_allowlist (user_id, note)
SELECT u.id, lower(u.email)
FROM auth.users u
WHERE lower(u.email) IN ('kingpipolol@gmail.com', 'jennierfs@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

-- 2) Ajustes
INSERT INTO public.game_settings (key, value, description)
SELECT 'hero_ship_public', 'false', '[CASINO1] true = Nave Heroe y viaje al Casino para todos los jugadores'
WHERE NOT EXISTS (SELECT 1 FROM public.game_settings WHERE key = 'hero_ship_public');

INSERT INTO public.game_settings (key, value, description)
SELECT 'hero_casino_base_speed', '10000', '[CASINO1] Velocidad base de la Nave Heroe para viajar al Casino (+1% por punto de velocidad)'
WHERE NOT EXISTS (SELECT 1 FROM public.game_settings WHERE key = 'hero_casino_base_speed');

-- 3) Viajes de la Nave Heroe al Casino (1 fila por jugador mientras no este en el hangar)
CREATE TABLE IF NOT EXISTS public.hero_casino_trips (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  origin_galaxy integer NOT NULL,
  origin_system integer NOT NULL,
  origin_position integer NOT NULL,
  departed_at timestamptz NOT NULL DEFAULT now(),
  arrives_at timestamptz NOT NULL,
  flight_seconds integer NOT NULL CHECK (flight_seconds > 0),
  returns_at timestamptz
);
ALTER TABLE public.hero_casino_trips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hero_casino_trips FROM PUBLIC, anon, authenticated;

-- 4) Helpers internos (sin EXECUTE para clientes)
CREATE OR REPLACE FUNCTION public._casino_is_location(p_galaxy integer, p_system integer, p_position integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_galaxy = 3 AND p_system = 250 AND p_position = 17;
$$;

CREATE OR REPLACE FUNCTION public._hero_has_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.hero_access_allowlist WHERE user_id = p_user_id)
    OR COALESCE((SELECT lower(btrim(value)) FROM public.game_settings WHERE key = 'hero_ship_public'), 'false') = 'true'
  );
$$;

CREATE OR REPLACE FUNCTION public._hero_casino_state(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
             WHEN t.returns_at IS NOT NULL AND t.returns_at <= now() THEN 'hangar'
             WHEN t.returns_at IS NOT NULL THEN 'returning'
             WHEN t.arrives_at > now() THEN 'traveling'
             ELSE 'docked'
           END
    FROM public.hero_casino_trips t
    WHERE t.user_id = p_user_id
  ), 'hangar');
$$;

-- Para los futuros juegos del Casino: unica puerta de entrada.
CREATE OR REPLACE FUNCTION public._casino_can_enter(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public._hero_has_access(p_user_id) AND public._hero_casino_state(p_user_id) = 'docked';
$$;

CREATE OR REPLACE FUNCTION public._hero_casino_flight_seconds(p_user_id uuid, p_galaxy integer, p_system integer, p_position integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base integer;
  v_speed_points integer;
  v_speed integer;
BEGIN
  SELECT NULLIF(regexp_replace(value, '[^0-9]', '', 'g'), '')::integer INTO v_base
  FROM public.game_settings WHERE key = 'hero_casino_base_speed';
  v_base := GREATEST(COALESCE(v_base, 10000), 1);

  SELECT GREATEST(COALESCE(speed_points, 0), 0) INTO v_speed_points
  FROM public.user_hero_ships WHERE user_id = p_user_id;

  v_speed := GREATEST(1, ROUND(v_base * (100 + COALESCE(v_speed_points, 0)) / 100.0))::integer;

  RETURN GREATEST(1, public.fleet_calc_flight_time(
    public.fleet_calc_distance(p_galaxy, p_system, p_position, 3, 250, 17),
    v_speed, 100, 0::numeric));
END;
$$;

REVOKE ALL ON FUNCTION public._casino_is_location(integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._hero_has_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._hero_casino_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._casino_can_enter(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._hero_casino_flight_seconds(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;

-- 5) RPC: estado del Casino para el jugador actual
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

  -- Limpieza perezosa: la nave ya regreso al hangar
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
    'estimated_flight_seconds', CASE WHEN v_main.galaxy IS NULL THEN NULL ELSE
      public._hero_casino_flight_seconds(v_uid, v_main.galaxy, v_main.solar_system, v_main.position) END,
    'trip', CASE WHEN v_trip.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'departed_at', v_trip.departed_at, 'arrives_at', v_trip.arrives_at,
      'returns_at', v_trip.returns_at, 'flight_seconds', v_trip.flight_seconds) END
  );
END;
$$;

-- 6) RPC: enviar la Nave Heroe al Casino (unico destino permitido)
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

  SELECT galaxy, solar_system, position INTO v_main
  FROM public.planets
  WHERE user_id = v_uid AND is_main_planet = true AND NOT is_destroyed
  LIMIT 1;
  IF v_main.galaxy IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes un planeta principal');
  END IF;

  v_secs := public._hero_casino_flight_seconds(v_uid, v_main.galaxy, v_main.solar_system, v_main.position);
  v_arrives := now() + make_interval(secs => v_secs);

  INSERT INTO public.hero_casino_trips (user_id, origin_galaxy, origin_system, origin_position,
                                        departed_at, arrives_at, flight_seconds)
  VALUES (v_uid, v_main.galaxy, v_main.solar_system, v_main.position, now(), v_arrives, v_secs);

  RETURN jsonb_build_object('success', true, 'arrives_at', v_arrives, 'flight_seconds', v_secs);
END;
$$;

-- 7) RPC: hacer regresar la Nave Heroe al hangar
CREATE OR REPLACE FUNCTION public.hero_casino_recall()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trip record;
  v_returns timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_trip FROM public.hero_casino_trips WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe ya esta en el hangar');
  END IF;

  IF v_trip.returns_at IS NOT NULL THEN
    IF v_trip.returns_at <= now() THEN
      DELETE FROM public.hero_casino_trips WHERE user_id = v_uid;
      RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe ya esta en el hangar');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe ya esta regresando');
  END IF;

  IF now() < v_trip.arrives_at THEN
    -- Aun en vuelo: regresa en el mismo tiempo que lleva volando
    v_returns := now() + GREATEST(now() - v_trip.departed_at, interval '1 second');
  ELSE
    v_returns := now() + make_interval(secs => v_trip.flight_seconds);
  END IF;

  UPDATE public.hero_casino_trips SET returns_at = v_returns WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true, 'returns_at', v_returns);
END;
$$;

REVOKE ALL ON FUNCTION public.get_casino_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hero_casino_travel() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hero_casino_recall() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_casino_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hero_casino_travel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hero_casino_recall() TO authenticated;

-- 8) Parche: ninguna flota normal puede ir al Casino
DO $do$
DECLARE
  v_src text;
  v_anchor text := E'  IF p_mission_type != ''expedition'' AND p_target_position = 16 THEN\n';
  v_add text := E'  -- [CASINO1] El Casino Galactico solo admite la Nave Heroe (hero_casino_travel)\n'
             || E'  IF public._casino_is_location(p_target_galaxy, p_target_system, p_target_position) THEN\n'
             || E'    RETURN jsonb_build_object(''success'', false, ''error'', ''Solo la Nave Heroe puede viajar al Casino Galactico'');\n'
             || E'  END IF;\n\n';
  v_cnt integer;
BEGIN
  v_src := replace(pg_get_functiondef('public.secure_send_fleet(uuid,integer,integer,integer,text,jsonb,bigint,bigint,bigint,integer,text,uuid)'::regprocedure), chr(13), '');
  IF position('[CASINO1]' IN v_src) > 0 THEN
    RAISE NOTICE 'secure_send_fleet ya parcheado';
    RETURN;
  END IF;
  v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'secure_send_fleet: ancla encontrada % veces', v_cnt;
  END IF;
  EXECUTE replace(v_src, v_anchor, v_add || v_anchor);
END;
$do$;

-- 9) Parche: la Nave Heroe no sale de expedicion mientras este fuera por el Casino
DO $do$
DECLARE
  v_src text;
  v_anchor text := E'  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;\n';
  v_add text := E'  -- [CASINO1] Bloqueo mientras la Nave Heroe va, esta o vuelve del Casino\n'
             || E'  IF public._hero_casino_state(p_user_id) <> ''hangar'' THEN\n'
             || E'    RETURN jsonb_build_object(''success'', false, ''error'', ''Tu Nave Heroe esta en el Casino Galactico o viajando. Haz que regrese al hangar primero.'');\n'
             || E'  END IF;\n';
  v_cnt integer;
BEGIN
  v_src := replace(pg_get_functiondef('public.start_hero_expedition(uuid,uuid)'::regprocedure), chr(13), '');
  IF position('[CASINO1]' IN v_src) > 0 THEN
    RAISE NOTICE 'start_hero_expedition ya parcheado';
    RETURN;
  END IF;
  v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'start_hero_expedition: ancla encontrada % veces', v_cnt;
  END IF;
  EXECUTE replace(v_src, v_anchor, v_anchor || v_add);
END;
$do$;

NOTIFY pgrst, 'reload schema';
