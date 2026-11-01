-- [OCUPA5] Nave de Ocupacion: precio 10 USD en TUNG, no se consume al ocupar (queda en la guarnicion),
-- se destruye si el dueno recupera el planeta, y al abandonar regresa con la flota segun su velocidad real.

-- Helper interno: envia la guarnicion a casa con tiempo de vuelo real (velocidad de la nave mas lenta).
CREATE OR REPLACE FUNCTION public._occ_send_garrison_home(p_fleet_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public._occ_send_garrison_home(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._occ_send_garrison_home(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._occ_send_garrison_home(uuid) FROM authenticated;

-- Abandonar: la guarnicion (incluida la Nave de Ocupacion) vuelve con tiempo de vuelo real.
CREATE OR REPLACE FUNCTION public.occupation_abandon(p_occupation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  o public.occupations%ROWTYPE;
  v_ret timestamptz;
BEGIN
  -- [OCUPA5]
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  SELECT * INTO o FROM public.occupations
  WHERE id = p_occupation_id AND occupier_id = v_uid AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ocupación no encontrada');
  END IF;

  -- Las unidades ya terminadas se suman a la guarnicion antes de partir
  PERFORM public._occ_process_builds(o.id);

  v_ret := public._occ_send_garrison_home(o.garrison_fleet_id);

  -- Si la guarnicion ya no existia, cerrar igualmente
  PERFORM public._occ_end(o.id, 'abandoned');

  RETURN jsonb_build_object('success', true, 'return_time', v_ret,
    'message', 'Has abandonado la ocupación. Tu guarnición y la Nave de Ocupación regresan a casa según su velocidad de vuelo.');
END
$fn$;

DO $do$
DECLARE
  v_def text;
  v_new text;
  v_oid oid;
BEGIN
  -- 1) _occ_try_start: la Nave de Ocupacion ya no se consume
  v_oid := 'public._occ_try_start(uuid,uuid,numeric,numeric,numeric)'::regprocedure;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA5]' in v_def) = 0 THEN
    v_new := replace(v_def,
      $a$  -- Se consume 1 Nave de Ocupacion$a$,
      $b$  -- [OCUPA5] La Nave de Ocupacion ya no se consume: se queda en la guarnicion$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor comment try_start'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      $a$    UPDATE public.fleet_ships SET quantity = quantity - 1 WHERE fleet_id = p_fleet_id AND ship_type_id = v_ship_id;$a$,
      $b$    NULL;$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor update try_start'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      $a$    DELETE FROM public.fleet_ships WHERE fleet_id = p_fleet_id AND ship_type_id = v_ship_id;$a$,
      $b$    NULL;$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor delete try_start'; END IF;
    EXECUTE v_new;
  END IF;

  -- 2) _occ_end: al recuperar, la Nave de Ocupacion de la guarnicion se destruye
  v_oid := 'public._occ_end(uuid,text)'::regprocedure;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA5]' in v_def) = 0 THEN
    v_new := replace(v_def,
      $a$  PERFORM public._occ_process_builds(o.id);$a$,
      $b$  PERFORM public._occ_process_builds(o.id);
  IF p_reason = 'recovered' THEN -- [OCUPA5]
    DELETE FROM public.fleet_ships
    WHERE fleet_id = o.garrison_fleet_id
      AND ship_type_id IN (SELECT id FROM public.ship_types WHERE code = 'occupation_ship');
  END IF;$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor builds _occ_end'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      $a$su planeta %s %s. Tu ocupación ha terminado.'$a$,
      $b$su planeta %s %s. Tu ocupación ha terminado y tu Nave de Ocupación ha sido destruida.'$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor msg _occ_end'; END IF;
    EXECUTE v_new;
  END IF;

  -- 3) occupation_transport: la Nave de Ocupacion no puede salir de la guarnicion
  v_oid := 'public.occupation_transport(uuid,jsonb,bigint,bigint,bigint,uuid,integer)'::regprocedure;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA5]' in v_def) = 0 THEN
    v_new := replace(v_def,
      $a$  IF v_sent = 0 THEN$a$,
      $b$  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_ships) AS x(ship_type_id integer, quantity integer)
             JOIN public.ship_types st ON st.id = x.ship_type_id
             WHERE st.code = 'occupation_ship' AND COALESCE(x.quantity, 0) > 0) THEN -- [OCUPA5]
    RETURN jsonb_build_object('success', false, 'error', 'La Nave de Ocupación debe quedarse en el planeta ocupado. Para retirarla usa "Abandonar ocupación".');
  END IF;
  IF v_sent = 0 THEN$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor transport'; END IF;
    EXECUTE v_new;
  END IF;

  -- 4) Precio 10 USD
  v_oid := 'public.purchase_occupation_ship(uuid,integer)'::regprocedure;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA5]' in v_def) = 0 THEN
    v_new := replace(v_def,
      $a$  v_cost := CEIL(25.0 * v_qty / v_price);$a$,
      $b$  v_cost := CEIL(10.0 * v_qty / v_price); -- [OCUPA5]$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor cost purchase'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      $a$  VALUES (v_uid, p_planet_id, v_qty, 25, v_price,$a$,
      $b$  VALUES (v_uid, p_planet_id, v_qty, 10, v_price,$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor insert purchase'; END IF;
    EXECUTE v_new;
  END IF;

  v_oid := 'public.get_occupation_ship_info()'::regprocedure;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA5]' in v_def) = 0 THEN
    v_new := replace(v_def,
      $a$    'unit_price_usd', 25,$a$,
      $b$    'unit_price_usd', 10, -- [OCUPA5]$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor price info'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      $a$CEIL(25.0 / v_price)$a$,
      $b$CEIL(10.0 / v_price)$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor tung info'; END IF;
    EXECUTE v_new;
  END IF;
END
$do$;
