-- =====================================================================
-- [OCUPA1] Nave de Ocupacion - ocupacion de colonias
-- =====================================================================
SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.occupations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id         uuid NOT NULL REFERENCES public.planets(id) ON DELETE CASCADE,
  owner_id          uuid NOT NULL,
  occupier_id       uuid NOT NULL,
  garrison_fleet_id uuid,
  origin_planet_id  uuid,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  end_reason        text,
  prev_autopilot    boolean,
  frozen_building   jsonb NOT NULL DEFAULT '[]'::jsonb,
  frozen_shipyard   jsonb NOT NULL DEFAULT '[]'::jsonb,
  frozen_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS occupations_active_planet_uq ON public.occupations(planet_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS occupations_occupier_idx ON public.occupations(occupier_id, status);
CREATE INDEX IF NOT EXISTS occupations_owner_idx ON public.occupations(owner_id, status);
CREATE INDEX IF NOT EXISTS occupations_garrison_idx ON public.occupations(garrison_fleet_id) WHERE status = 'active';
ALTER TABLE public.occupations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.occupations FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.occupation_ship_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  planet_id       uuid,
  quantity        integer NOT NULL,
  unit_price_usd  numeric NOT NULL,
  tung_price_usd  numeric NOT NULL,
  cost_tung       numeric NOT NULL,
  jackpot_share   numeric NOT NULL DEFAULT 0,
  referrer_id     uuid,
  referrer_share  numeric NOT NULL DEFAULT 0,
  admin_share     numeric NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS occupation_ship_purchases_user_idx ON public.occupation_ship_purchases(user_id, created_at DESC);
ALTER TABLE public.occupation_ship_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.occupation_ship_purchases FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.occupation_build_queue (
  id               bigserial PRIMARY KEY,
  occupation_id    uuid NOT NULL REFERENCES public.occupations(id) ON DELETE CASCADE,
  planet_id        uuid NOT NULL,
  item_type        text NOT NULL CHECK (item_type IN ('ship','defense')),
  ship_type_id     integer,
  defense_type_id  integer,
  quantity         integer NOT NULL CHECK (quantity > 0),
  quantity_done    integer NOT NULL DEFAULT 0,
  unit_time        integer NOT NULL CHECK (unit_time > 0),
  metal_cost       numeric NOT NULL DEFAULT 0,
  crystal_cost     numeric NOT NULL DEFAULT 0,
  deuterium_cost   numeric NOT NULL DEFAULT 0,
  start_time       timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS occupation_build_queue_occ_idx ON public.occupation_build_queue(occupation_id, status, id);
ALTER TABLE public.occupation_build_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.occupation_build_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.occupation_build_queue_id_seq FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Tipo de nave (mismas stats que la Nave Colonizadora)
-- ---------------------------------------------------------------------
INSERT INTO public.ship_types (code, name, description, category, metal_cost, crystal_cost, deuterium_cost,
  build_time_seconds, structural_integrity, shield_power, weapon_power, cargo_capacity, base_speed,
  fuel_consumption, rapid_fire, image_url)
SELECT 'occupation_ship', 'Nave de Ocupación',
  'Nave especial para ocupar colonias enemigas. Solo se adquiere con TUNG en el Mercado del sistema. Viaja en una misión de Ataque: si ganas la batalla y sobrevive junto a otra nave, el planeta queda ocupado y tu flota se convierte en su guarnición.',
  'special', 10000, 20000, 10000, 14400, 21000, 85, 75, 7500, 2500, 1000,
  '{"espionage_probe": 5, "solar_satellite": 5}'::jsonb, '/Imagenes/Naves/Nave de Ocupación.webp'
WHERE NOT EXISTS (SELECT 1 FROM public.ship_types WHERE code = 'occupation_ship');

-- ---------------------------------------------------------------------
-- 3. Helpers internos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._occ_active(p_planet_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT o.id FROM public.occupations o WHERE o.planet_id = p_planet_id AND o.status = 'active' LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION public._occ_guard(p_planet_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF p_planet_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.occupations o WHERE o.planet_id = p_planet_id AND o.status = 'active') THEN
    RAISE EXCEPTION 'Este planeta está ocupado por otro jugador. Recupéralo atacando a la guarnición enemiga.' USING ERRCODE = 'P0001';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public._occ_is_recovery_fleet(p_fleet_id uuid, p_planet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.occupations o
    JOIN public.fleets f ON f.id = p_fleet_id
    WHERE o.planet_id = p_planet_id AND o.status = 'active' AND f.user_id = o.owner_id)
$fn$;

CREATE OR REPLACE FUNCTION public._occ_is_recovery_acs(p_acs_id uuid, p_planet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.occupations o
    JOIN public.acs_fleets a ON a.id = p_acs_id
    WHERE o.planet_id = p_planet_id AND o.status = 'active' AND a.creator_id = o.owner_id)
$fn$;

-- Acredita las unidades terminadas de la cola del ocupante
CREATE OR REPLACE FUNCTION public._occ_process_builds(p_occupation_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  o record;
  q record;
  v_done integer;
  v_delta integer;
  v_total integer := 0;
BEGIN
  FOR o IN
    SELECT * FROM public.occupations
    WHERE status = 'active' AND (p_occupation_id IS NULL OR id = p_occupation_id)
  LOOP
    FOR q IN
      SELECT * FROM public.occupation_build_queue
      WHERE occupation_id = o.id AND status = 'pending' AND start_time <= now()
      ORDER BY id
      FOR UPDATE
    LOOP
      v_done := LEAST(q.quantity, FLOOR(EXTRACT(EPOCH FROM (now() - q.start_time)) / q.unit_time)::integer);
      v_delta := v_done - q.quantity_done;
      IF v_delta > 0 THEN
        IF q.item_type = 'ship' THEN
          IF o.garrison_fleet_id IS NULL THEN
            CONTINUE;
          END IF;
          INSERT INTO public.fleet_ships (fleet_id, ship_type_id, quantity)
          VALUES (o.garrison_fleet_id, q.ship_type_id, v_delta)
          ON CONFLICT (fleet_id, ship_type_id) DO UPDATE SET quantity = public.fleet_ships.quantity + EXCLUDED.quantity;
        ELSE
          INSERT INTO public.planet_defenses (planet_id, defense_type_id, quantity)
          VALUES (o.planet_id, q.defense_type_id, v_delta)
          ON CONFLICT (planet_id, defense_type_id) DO UPDATE SET quantity = public.planet_defenses.quantity + EXCLUDED.quantity;
        END IF;
        v_total := v_total + v_delta;
      END IF;
      UPDATE public.occupation_build_queue
      SET quantity_done = GREATEST(quantity_done, v_done),
          status = CASE WHEN GREATEST(quantity_done, v_done) >= quantity THEN 'done' ELSE 'pending' END
      WHERE id = q.id;
    END LOOP;
  END LOOP;
  RETURN v_total;
END
$fn$;

-- Termina una ocupacion: restaura colas, autopiloto y avisa a ambos
CREATE OR REPLACE FUNCTION public._occ_end(p_occupation_id uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  o public.occupations%ROWTYPE;
  v_planet record;
  v_shift interval;
  r jsonb;
  v_m numeric := 0;
  v_c numeric := 0;
  v_d numeric := 0;
  v_restored integer := 0;
  v_failed integer := 0;
  v_coords text;
  v_owner_name text;
  v_occ_name text;
  v_subj_owner text;
  v_body_owner text;
  v_subj_occ text;
  v_body_occ text;
  v_rem numeric;
BEGIN
  SELECT * INTO o FROM public.occupations WHERE id = p_occupation_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'active' THEN
    RETURN false;
  END IF;

  PERFORM public._occ_process_builds(o.id);

  UPDATE public.occupations
  SET status = 'ended', ended_at = now(), end_reason = p_reason
  WHERE id = o.id;

  -- Reembolso de lo que el ocupante no llego a construir (queda en el planeta)
  SELECT COALESCE(SUM((quantity - quantity_done) * metal_cost), 0),
         COALESCE(SUM((quantity - quantity_done) * crystal_cost), 0),
         COALESCE(SUM((quantity - quantity_done) * deuterium_cost), 0)
  INTO v_m, v_c, v_d
  FROM public.occupation_build_queue
  WHERE occupation_id = o.id AND status = 'pending';

  UPDATE public.occupation_build_queue SET status = 'cancelled'
  WHERE occupation_id = o.id AND status = 'pending';

  IF v_m + v_c + v_d > 0 THEN
    UPDATE public.planet_resources
    SET metal = metal + v_m, crystal = crystal + v_c, deuterium = deuterium + v_d
    WHERE planet_id = o.planet_id;
  END IF;

  SELECT * INTO v_planet FROM public.planets WHERE id = o.planet_id;

  -- Restaurar colas congeladas (tiempos desplazados por la duracion de la ocupacion)
  IF FOUND AND NOT COALESCE(v_planet.is_destroyed, false) AND v_planet.user_id = o.owner_id THEN
    v_shift := now() - o.frozen_at;
    PERFORM set_config('occ.restoring', '1', true);

    FOR r IN SELECT value FROM jsonb_array_elements(o.frozen_building) LOOP
      BEGIN
        INSERT INTO public.building_queue
        SELECT * FROM jsonb_populate_record(NULL::public.building_queue,
          r || jsonb_build_object(
            'start_time', CASE WHEN r->>'start_time' IS NULL THEN NULL ELSE ((r->>'start_time')::timestamptz + v_shift) END,
            'end_time',   CASE WHEN r->>'end_time'   IS NULL THEN NULL ELSE ((r->>'end_time')::timestamptz + v_shift) END));
        v_restored := v_restored + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.planet_resources
        SET metal = metal + COALESCE((r->>'metal_cost')::numeric, 0),
            crystal = crystal + COALESCE((r->>'crystal_cost')::numeric, 0),
            deuterium = deuterium + COALESCE((r->>'deuterium_cost')::numeric, 0)
        WHERE planet_id = o.planet_id;
        v_failed := v_failed + 1;
      END;
    END LOOP;

    FOR r IN SELECT value FROM jsonb_array_elements(o.frozen_shipyard) LOOP
      BEGIN
        INSERT INTO public.shipyard_queue
        SELECT * FROM jsonb_populate_record(NULL::public.shipyard_queue,
          r || jsonb_build_object(
            'start_time', CASE WHEN r->>'start_time' IS NULL THEN NULL ELSE ((r->>'start_time')::timestamptz + v_shift) END,
            'current_unit_end_time', CASE WHEN r->>'current_unit_end_time' IS NULL THEN NULL ELSE ((r->>'current_unit_end_time')::timestamptz + v_shift) END));
        v_restored := v_restored + 1;
      EXCEPTION WHEN OTHERS THEN
        v_rem := GREATEST(0, COALESCE((r->>'quantity')::numeric, 0) - COALESCE((r->>'quantity_completed')::numeric, 0))
                 / GREATEST(COALESCE((r->>'quantity')::numeric, 1), 1);
        UPDATE public.planet_resources
        SET metal = metal + FLOOR(COALESCE((r->>'metal_cost')::numeric, 0) * v_rem),
            crystal = crystal + FLOOR(COALESCE((r->>'crystal_cost')::numeric, 0) * v_rem),
            deuterium = deuterium + FLOOR(COALESCE((r->>'deuterium_cost')::numeric, 0) * v_rem)
        WHERE planet_id = o.planet_id;
        v_failed := v_failed + 1;
      END;
    END LOOP;

    PERFORM set_config('occ.restoring', '0', true);

    IF o.prev_autopilot IS NOT NULL THEN
      UPDATE public.planets SET autopilot_enabled = o.prev_autopilot WHERE id = o.planet_id;
    END IF;
  END IF;

  -- Mensajes
  v_coords := COALESCE('[' || v_planet.galaxy || ':' || v_planet.solar_system || ':' || v_planet.position || ']', '');
  SELECT username INTO v_owner_name FROM public.profiles WHERE id = o.owner_id;
  SELECT username INTO v_occ_name FROM public.profiles WHERE id = o.occupier_id;

  IF p_reason = 'recovered' THEN
    v_subj_owner := '¡Planeta recuperado!';
    v_body_owner := format('Has derrotado a la guarnición de %s y recuperado tu planeta %s %s. Tus colas de construcción y hangar se han reanudado.', COALESCE(v_occ_name, 'el ocupante'), COALESCE(v_planet.name, ''), v_coords);
    v_subj_occ := 'Ocupación perdida';
    v_body_occ := format('%s ha recuperado su planeta %s %s. Tu ocupación ha terminado.', COALESCE(v_owner_name, 'El dueño'), COALESCE(v_planet.name, ''), v_coords);
  ELSIF p_reason = 'abandoned' THEN
    v_subj_owner := 'El ocupante se ha retirado';
    v_body_owner := format('%s ha abandonado la ocupación de tu planeta %s %s. Vuelves a tener el control y tus colas se han reanudado.', COALESCE(v_occ_name, 'El ocupante'), COALESCE(v_planet.name, ''), v_coords);
    v_subj_occ := 'Ocupación abandonada';
    v_body_occ := format('Has abandonado la ocupación de %s %s. Tu guarnición regresa a casa.', COALESCE(v_planet.name, ''), v_coords);
  ELSIF p_reason = 'liberated' THEN
    v_subj_owner := '¡Planeta liberado!';
    v_body_owner := format('La guarnición de %s en tu planeta %s %s ha sido destruida. Vuelves a tener el control y tus colas se han reanudado.', COALESCE(v_occ_name, 'el ocupante'), COALESCE(v_planet.name, ''), v_coords);
    v_subj_occ := 'Guarnición destruida';
    v_body_occ := format('Tu guarnición en %s %s ha sido destruida. La ocupación ha terminado.', COALESCE(v_planet.name, ''), v_coords);
  ELSE
    v_subj_owner := 'Ocupación finalizada';
    v_body_owner := format('La ocupación de tu planeta %s %s ha finalizado.', COALESCE(v_planet.name, ''), v_coords);
    v_subj_occ := 'Ocupación finalizada';
    v_body_occ := format('Tu ocupación de %s %s ha finalizado.', COALESCE(v_planet.name, ''), v_coords);
  END IF;

  IF v_failed > 0 THEN
    v_body_owner := v_body_owner || format(' (%s elemento(s) de cola no se pudieron restaurar y sus recursos fueron devueltos al planeta.)', v_failed);
  END IF;

  INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (NULL, o.owner_id, v_subj_owner, v_body_owner, 'system');
  INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (NULL, o.occupier_id, v_subj_occ, v_body_occ, 'system');

  RETURN true;
END
$fn$;

CREATE OR REPLACE FUNCTION public._occ_end_for_planet(p_planet_id uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.occupations WHERE planet_id = p_planet_id AND status = 'active';
  IF v_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN public._occ_end(v_id, p_reason);
END
$fn$;

CREATE OR REPLACE FUNCTION public._occ_prepare_acs(p_acs_id uuid, p_planet_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.occupations WHERE planet_id = p_planet_id AND status = 'active';
  IF v_id IS NULL THEN
    RETURN false;
  END IF;
  PERFORM public._occ_process_builds(v_id);
  RETURN public._occ_is_recovery_acs(p_acs_id, p_planet_id);
END
$fn$;

-- Inicio de ocupacion tras una victoria en ataque (llamado desde process_fleet_arrival)
CREATE OR REPLACE FUNCTION public._occ_try_start(p_fleet_id uuid, p_planet_id uuid,
  p_loot_metal numeric, p_loot_crystal numeric, p_loot_deuterium numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_ship_id integer;
  f public.fleets%ROWTYPE;
  p public.planets%ROWTYPE;
  v_occ_qty bigint;
  v_others bigint;
  v_fail text;
  v_coords text;
  v_fb jsonb;
  v_fs jsonb;
  v_main uuid;
  v_redirected integer := 0;
  v_occ_name text;
  v_note text := '';
BEGIN
  SELECT id INTO v_ship_id FROM public.ship_types WHERE code = 'occupation_ship';
  IF v_ship_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO f FROM public.fleets WHERE id = p_fleet_id;
  IF NOT FOUND OR COALESCE(f.is_acs, false) OR f.acs_id IS NOT NULL OR f.mission_type <> 'attack' THEN
    RETURN false;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_occ_qty
  FROM public.fleet_ships WHERE fleet_id = p_fleet_id AND ship_type_id = v_ship_id AND quantity > 0;
  IF v_occ_qty = 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO p FROM public.planets WHERE id = p_planet_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  v_coords := '[' || p.galaxy || ':' || p.solar_system || ':' || p.position || ']';

  SELECT COALESCE(SUM(quantity), 0) INTO v_others
  FROM public.fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0;
  v_others := v_others - 1;

  v_fail := CASE
    WHEN p.planet_type <> 'planet' OR COALESCE(f.target_type, 'planet') <> 'planet'
      THEN 'Solo se pueden ocupar planetas (las lunas no se pueden ocupar).'
    WHEN COALESCE(p.is_main_planet, false)
      THEN 'El planeta principal de un jugador no se puede ocupar. Solo sus colonias.'
    WHEN COALESCE(p.is_destroyed, false) OR p.user_id IS NULL OR p.user_id = f.user_id
      THEN 'El objetivo no es válido para ocupar.'
    WHEN v_others < 1
      THEN 'La Nave de Ocupación necesita al menos otra nave superviviente que quede como guarnición.'
    WHEN EXISTS (SELECT 1 FROM public.occupations WHERE planet_id = p.id AND status = 'active')
      THEN 'Este planeta ya está ocupado.'
    WHEN (SELECT count(*) FROM public.occupations WHERE occupier_id = f.user_id AND status = 'active') >= 3
      THEN 'Ya tienes el máximo de 3 ocupaciones activas.'
    WHEN public._colony_listed_since(p.id) IS NOT NULL
      THEN 'Esta colonia está en venta en el mercado y no se puede ocupar.'
    ELSE NULL
  END;

  IF v_fail IS NOT NULL THEN
    INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (NULL, f.user_id, 'Ocupación fallida',
      format('Tu flota ganó la batalla en %s %s, pero no pudo ocuparlo: %s La flota regresa a casa.', COALESCE(p.name, ''), v_coords, v_fail),
      'system');
    RETURN false;
  END IF;

  -- Se consume 1 Nave de Ocupacion
  IF v_occ_qty > 1 THEN
    UPDATE public.fleet_ships SET quantity = quantity - 1 WHERE fleet_id = p_fleet_id AND ship_type_id = v_ship_id;
  ELSE
    DELETE FROM public.fleet_ships WHERE fleet_id = p_fleet_id AND ship_type_id = v_ship_id;
  END IF;

  -- El botin se queda en el planeta ocupado (el ocupante lo controla)
  UPDATE public.fleets
  SET cargo_metal = GREATEST(0, cargo_metal - COALESCE(p_loot_metal, 0)),
      cargo_crystal = GREATEST(0, cargo_crystal - COALESCE(p_loot_crystal, 0)),
      cargo_deuterium = GREATEST(0, cargo_deuterium - COALESCE(p_loot_deuterium, 0)),
      mission_type = 'deploy',
      is_returning = false,
      is_completed = false
  WHERE id = p_fleet_id;
  UPDATE public.planet_resources
  SET metal = metal + COALESCE(p_loot_metal, 0),
      crystal = crystal + COALESCE(p_loot_crystal, 0),
      deuterium = deuterium + COALESCE(p_loot_deuterium, 0)
  WHERE planet_id = p.id;

  -- Congelar colas del dueno
  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.queue_position, b.created_at), '[]'::jsonb) INTO v_fb
  FROM public.building_queue b WHERE b.planet_id = p.id;
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.item_type, s.queue_position, s.created_at), '[]'::jsonb) INTO v_fs
  FROM public.shipyard_queue s WHERE s.planet_id = p.id;
  DELETE FROM public.building_queue WHERE planet_id = p.id;
  DELETE FROM public.shipyard_queue WHERE planet_id = p.id;

  -- Fuera del bot/autopiloto mientras dure
  UPDATE public.planets SET autopilot_enabled = false WHERE id = p.id;

  -- Ofertas de mercado vinculadas al planeta
  UPDATE public.market_listings SET status = 'cancelled', updated_at = now()
  WHERE planet_id = p.id AND status = 'active';

  -- Transportes / despliegues de terceros en camino: regresan
  UPDATE public.fleets
  SET is_returning = true,
      arrival_time = now(),
      return_time = now() + GREATEST(interval '10 seconds', now() - departure_time)
  WHERE target_galaxy = p.galaxy AND target_system = p.solar_system AND target_position = p.position
    AND COALESCE(target_type, 'planet') = 'planet'
    AND mission_type IN ('transport', 'deploy', 'hold')
    AND NOT is_returning AND NOT is_completed
    AND user_id <> f.user_id
    AND id <> p_fleet_id;

  -- Flotas del dueno con origen en este planeta: vuelven a su planeta principal
  SELECT id INTO v_main FROM public.planets
  WHERE user_id = p.user_id AND is_main_planet AND planet_type = 'planet'
    AND NOT COALESCE(is_destroyed, false) AND id <> p.id
  ORDER BY created_at LIMIT 1;
  IF v_main IS NOT NULL THEN
    UPDATE public.fleets SET origin_planet_id = v_main
    WHERE origin_planet_id = p.id AND user_id = p.user_id AND NOT COALESCE(is_completed, false);
    GET DIAGNOSTICS v_redirected = ROW_COUNT;
    UPDATE public.fortress_ships SET origin_planet_id = v_main WHERE origin_planet_id = p.id AND user_id = p.user_id;
    UPDATE public.treasure_planet_ships SET origin_planet_id = v_main WHERE origin_planet_id = p.id AND user_id = p.user_id;
    IF v_redirected > 0 THEN
      v_note := format(' %s flota(s) tuya(s) que salieron de este planeta regresarán a tu planeta principal.', v_redirected);
    END IF;
  END IF;

  INSERT INTO public.occupations (planet_id, owner_id, occupier_id, garrison_fleet_id, origin_planet_id,
    prev_autopilot, frozen_building, frozen_shipyard, frozen_at)
  VALUES (p.id, p.user_id, f.user_id, p_fleet_id, f.origin_planet_id,
    p.autopilot_enabled, v_fb, v_fs, now());

  SELECT username INTO v_occ_name FROM public.profiles WHERE id = f.user_id;

  INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (NULL, f.user_id, '¡Planeta ocupado!',
    format('Tu Nave de Ocupación ha tomado %s %s. Tu flota se queda como guarnición: mientras sobreviva controlas la producción, el hangar y los recursos del planeta. Gestiónalo desde Flota > Ocupaciones.', COALESCE(p.name, ''), v_coords),
    'system');
  INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (NULL, p.user_id, '¡Tu colonia ha sido ocupada!',
    format('%s ha ocupado tu colonia %s %s. Tus colas de construcción y hangar quedan congeladas hasta que la recuperes. Para recuperarla, ataca la guarnición enemiga (solo o con un ACS creado por ti).%s', COALESCE(v_occ_name, 'Un jugador'), COALESCE(p.name, ''), v_coords, v_note),
    'system');

  RETURN true;
END
$fn$;

-- Recuperacion por el dueno (ataque individual). Devuelve true si proceso la llegada.
CREATE OR REPLACE FUNCTION public._occ_recovery_arrival(p_fleet_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  f public.fleets%ROWTYPE;
  tp public.planets%ROWTYPE;
  o public.occupations%ROWTYPE;
  cr jsonb;
  v_unit jsonb;
  v_dm numeric := 0;
  v_dc numeric := 0;
  v_moon jsonb;
  v_report jsonb;
  v_atk text;
  v_def text;
  v_origin text;
  v_coords text;
  v_res text;
BEGIN
  SELECT * INTO f FROM public.fleets WHERE id = p_fleet_id;
  IF NOT FOUND OR f.mission_type <> 'attack' OR COALESCE(f.target_type, 'planet') <> 'planet'
     OR COALESCE(f.is_acs, false) OR f.acs_id IS NOT NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO tp FROM public.planets
  WHERE galaxy = f.target_galaxy AND solar_system = f.target_system AND position = f.target_position
    AND planet_type = 'planet' AND NOT COALESCE(is_destroyed, false)
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO o FROM public.occupations WHERE planet_id = tp.id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Las unidades terminadas del ocupante defienden
  PERFORM public._occ_process_builds(o.id);

  IF f.user_id <> o.owner_id THEN
    RETURN false;
  END IF;

  cr := public.perform_combat(p_fleet_id, tp.id);
  v_res := cr->>'result';

  -- Atacante (dueno)
  DELETE FROM public.fleet_ships WHERE fleet_id = p_fleet_id;
  FOR v_unit IN SELECT value FROM jsonb_array_elements(COALESCE(cr->'attacker_remaining', '[]'::jsonb)) LOOP
    IF COALESCE((v_unit->>'quantity')::integer, 0) > 0 THEN
      INSERT INTO public.fleet_ships (fleet_id, ship_type_id, quantity)
      VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer)
      ON CONFLICT (fleet_id, ship_type_id) DO UPDATE SET quantity = public.fleet_ships.quantity + EXCLUDED.quantity;
    END IF;
  END LOOP;

  -- Guarnicion (y cualquier flota estacionada que defendio)
  FOR v_unit IN
    SELECT value FROM jsonb_array_elements(COALESCE(cr->'defender_remaining', '[]'::jsonb))
    WHERE NOT COALESCE((value->>'is_defense')::boolean, false)
      AND COALESCE(value->>'source', 'planet') NOT IN ('planet', 'defense')
  LOOP
    IF COALESCE((v_unit->>'quantity')::integer, 0) > 0 THEN
      UPDATE public.fleet_ships SET quantity = (v_unit->>'quantity')::integer
      WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer;
    ELSE
      DELETE FROM public.fleet_ships
      WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer;
    END IF;
  END LOOP;

  IF v_res = 'attacker_won' THEN
    PERFORM public._occ_end(o.id, 'recovered');
  END IF;

  DELETE FROM public.fleet_ships WHERE quantity <= 0 AND fleet_id IN (
    SELECT (u->>'source')::uuid FROM jsonb_array_elements(COALESCE(cr->'defender_remaining', '[]'::jsonb)) u
    WHERE COALESCE(u->>'source', 'planet') NOT IN ('planet', 'defense'));
  UPDATE public.fleets SET is_completed = true
  WHERE mission_type = 'deploy' AND is_completed = false
    AND id IN (SELECT (u->>'source')::uuid FROM jsonb_array_elements(COALESCE(cr->'defender_remaining', '[]'::jsonb)) u
               WHERE COALESCE(u->>'source', 'planet') NOT IN ('planet', 'defense'))
    AND NOT EXISTS (SELECT 1 FROM public.fleet_ships fs WHERE fs.fleet_id = fleets.id AND fs.quantity > 0);

  -- Escombros
  v_dm := COALESCE((cr->>'debris_metal')::numeric, 0);
  v_dc := COALESCE((cr->>'debris_crystal')::numeric, 0);
  IF v_dm > 0 OR v_dc > 0 THEN
    INSERT INTO public.debris_fields (galaxy, solar_system, position, metal, crystal)
    VALUES (f.target_galaxy, f.target_system, f.target_position, v_dm, v_dc)
    ON CONFLICT (galaxy, solar_system, position)
    DO UPDATE SET metal = public.debris_fields.metal + EXCLUDED.metal, crystal = public.debris_fields.crystal + EXCLUDED.crystal, updated_at = now();
    UPDATE public.profiles SET debris_metal_total = debris_metal_total + v_dm, debris_crystal_total = debris_crystal_total + v_dc
    WHERE id = f.user_id;
  END IF;

  BEGIN
    v_moon := public.check_moon_creation(f.target_galaxy, f.target_system, f.target_position, v_dm, v_dc);
  EXCEPTION WHEN OTHERS THEN
    v_moon := NULL;
  END;

  -- Estadisticas
  IF v_res = 'attacker_won' THEN
    UPDATE public.profiles SET battles_won = battles_won + 1,
      units_destroyed = units_destroyed + COALESCE((cr->>'defender_losses_metal')::numeric, 0)::bigint / 1000
    WHERE id = f.user_id;
    UPDATE public.profiles SET battles_lost = battles_lost + 1,
      units_lost = units_lost + COALESCE((cr->>'defender_losses_metal')::numeric, 0)::bigint / 1000
    WHERE id = o.occupier_id;
  ELSIF v_res = 'defender_won' THEN
    UPDATE public.profiles SET battles_lost = battles_lost + 1 WHERE id = f.user_id;
    UPDATE public.profiles SET battles_won = battles_won + 1 WHERE id = o.occupier_id;
  ELSE
    UPDATE public.profiles SET battles_draw = battles_draw + 1 WHERE id IN (f.user_id, o.occupier_id);
  END IF;

  v_coords := f.target_galaxy || ':' || f.target_system || ':' || f.target_position;

  INSERT INTO public.battle_reports (attacker_id, defender_id, planet_id, coordinates, result, rounds, debris_metal, debris_crystal,
    loot_metal, loot_crystal, loot_deuterium, report_data, battle_type, galaxy, solar_system, position, created_at)
  VALUES (f.user_id, o.occupier_id, tp.id, v_coords, v_res, COALESCE((cr->>'rounds')::integer, 0), v_dm, v_dc,
    0, 0, 0, cr, 'attack', f.target_galaxy, f.target_system, f.target_position, now());

  v_atk := COALESCE((SELECT username FROM public.profiles WHERE id = f.user_id), 'Desconocido');
  v_def := COALESCE((SELECT username FROM public.profiles WHERE id = o.occupier_id), 'Desconocido');
  v_origin := COALESCE((SELECT op.galaxy || ':' || op.solar_system || ':' || op.position FROM public.planets op WHERE op.id = f.origin_planet_id), '?:?:?');

  v_report := jsonb_build_object(
    'version', 2,
    'battle_type', 'attack',
    'attacker', v_atk,
    'defender', v_def,
    'planet_name', tp.name,
    'target_type', 'planet',
    'attacker_origin', v_origin,
    'coordinates', v_coords,
    'result', v_res,
    'rounds', COALESCE((cr->>'rounds')::integer, 0),
    'rounds_data', COALESCE(cr->'rounds_data', '[]'::jsonb),
    'attacker_ships', public.battle_units_diff(cr->'initial_attacker', cr->'attacker_remaining', 'ships'),
    'defender_ships', public.battle_units_diff(cr->'initial_defender', cr->'defender_remaining', 'ships'),
    'defender_defenses', public.battle_units_diff(cr->'initial_defender', cr->'defender_remaining', 'defenses'),
    'attacker_losses', jsonb_build_object('metal', FLOOR(COALESCE((cr->>'attacker_losses_metal')::numeric, 0)), 'crystal', FLOOR(COALESCE((cr->>'attacker_losses_crystal')::numeric, 0))),
    'defender_losses', jsonb_build_object('metal', FLOOR(COALESCE((cr->>'defender_losses_metal')::numeric, 0)), 'crystal', FLOOR(COALESCE((cr->>'defender_losses_crystal')::numeric, 0))),
    'debris', jsonb_build_object('metal', FLOOR(v_dm), 'crystal', FLOOR(v_dc)),
    'loot', jsonb_build_object('metal', 0, 'crystal', 0, 'deuterium', 0),
    'moon', COALESCE(v_moon, jsonb_build_object('moon_created', false, 'moon_chance', 0)),
    'building_damage', NULL,
    'occupation_recovery', true
  );

  INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (NULL, f.user_id,
    format('Recuperación de %s - %s', tp.name, CASE v_res WHEN 'attacker_won' THEN 'Victoria' WHEN 'defender_won' THEN 'Derrota' ELSE 'Empate' END),
    (v_report || jsonb_build_object('perspective', 'attacker'))::text, 'battle');
  INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (NULL, o.occupier_id,
    format('Tu guarnición en %s fue atacada - %s', tp.name, CASE v_res WHEN 'attacker_won' THEN 'Derrota' WHEN 'defender_won' THEN 'Victoria' ELSE 'Empate' END),
    (v_report || jsonb_build_object('perspective', 'defender'))::text, 'battle');

  IF EXISTS (SELECT 1 FROM public.fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN
    UPDATE public.fleets SET is_returning = true WHERE id = p_fleet_id;
  ELSE
    UPDATE public.fleets SET is_completed = true WHERE id = p_fleet_id;
  END IF;

  RETURN true;
END
$fn$;

-- Cron: autocuracion + acreditacion de unidades
CREATE OR REPLACE FUNCTION public._occ_cron_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT o.id, o.garrison_fleet_id,
      CASE
        WHEN p.id IS NULL OR COALESCE(p.is_destroyed, false) OR p.user_id IS DISTINCT FROM o.owner_id THEN 'planet_lost'
        WHEN f.id IS NULL THEN 'liberated'
        WHEN f.is_returning AND NOT f.is_completed THEN 'abandoned'
        ELSE 'liberated'
      END AS reason
    FROM public.occupations o
    LEFT JOIN public.planets p ON p.id = o.planet_id
    LEFT JOIN public.fleets f ON f.id = o.garrison_fleet_id
    WHERE o.status = 'active'
      AND (p.id IS NULL OR COALESCE(p.is_destroyed, false) OR p.user_id IS DISTINCT FROM o.owner_id
           OR f.id IS NULL OR f.is_completed OR f.is_returning OR f.mission_type <> 'deploy'
           OR NOT EXISTS (SELECT 1 FROM public.fleet_ships fs WHERE fs.fleet_id = f.id AND fs.quantity > 0))
  LOOP
    BEGIN
      PERFORM public._occ_end(r.id, r.reason);
      IF r.reason = 'planet_lost' THEN
        UPDATE public.fleets
        SET is_returning = true, arrival_time = now(),
            return_time = now() + GREATEST(interval '10 seconds', arrival_time - departure_time)
        WHERE id = r.garrison_fleet_id AND NOT is_returning AND NOT is_completed;
      END IF;
      UPDATE public.fleets SET is_completed = true
      WHERE id = r.garrison_fleet_id AND NOT is_completed AND NOT is_returning
        AND NOT EXISTS (SELECT 1 FROM public.fleet_ships fs WHERE fs.fleet_id = fleets.id AND fs.quantity > 0);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[OCUPA1] cron end % failed: %', r.id, SQLERRM;
    END;
  END LOOP;

  FOR r IN SELECT id FROM public.occupations WHERE status = 'active' LOOP
    BEGIN
      PERFORM public._occ_process_builds(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[OCUPA1] cron builds % failed: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- ---------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------
-- Fin de la guarnicion => fin de la ocupacion
CREATE OR REPLACE FUNCTION public._occ_trg_garrison_end()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_fid uuid;
  v_reason text;
  v_occ uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_fid := OLD.id;
    v_reason := 'liberated';
  ELSE
    v_fid := NEW.id;
    v_reason := CASE WHEN NEW.is_returning AND NOT NEW.is_completed THEN 'abandoned' ELSE 'liberated' END;
  END IF;
  SELECT id INTO v_occ FROM public.occupations WHERE garrison_fleet_id = v_fid AND status = 'active';
  IF v_occ IS NOT NULL THEN
    BEGIN
      PERFORM public._occ_end(v_occ, v_reason);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[OCUPA1] garrison end % failed: %', v_occ, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS trg_occ_garrison_end_upd ON public.fleets;
CREATE TRIGGER trg_occ_garrison_end_upd
AFTER UPDATE OF is_returning, is_completed ON public.fleets
FOR EACH ROW
WHEN (NEW.mission_type = 'deploy' AND (NEW.is_returning OR NEW.is_completed) AND NOT (OLD.is_returning OR OLD.is_completed))
EXECUTE FUNCTION public._occ_trg_garrison_end();

DROP TRIGGER IF EXISTS trg_occ_garrison_end_del ON public.fleets;
CREATE TRIGGER trg_occ_garrison_end_del
AFTER DELETE ON public.fleets
FOR EACH ROW
WHEN (OLD.mission_type = 'deploy')
EXECUTE FUNCTION public._occ_trg_garrison_end();

-- El dueno no puede lanzar flotas desde su planeta ocupado
CREATE OR REPLACE FUNCTION public._occ_trg_block_fleet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT COALESCE(NEW.is_returning, false) AND NEW.origin_planet_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.occupations o
                 WHERE o.planet_id = NEW.origin_planet_id AND o.status = 'active' AND o.occupier_id <> NEW.user_id) THEN
    RAISE EXCEPTION 'Este planeta está ocupado por otro jugador. Recupéralo atacando a la guarnición enemiga.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_occ_block_fleet ON public.fleets;
CREATE TRIGGER trg_occ_block_fleet
BEFORE INSERT ON public.fleets
FOR EACH ROW EXECUTE FUNCTION public._occ_trg_block_fleet();

-- Colas del dueno bloqueadas; la Nave de Ocupacion nunca se fabrica en hangar
CREATE OR REPLACE FUNCTION public._occ_trg_block_queue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'shipyard_queue' THEN
    IF NEW.ship_type_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.ship_types WHERE id = NEW.ship_type_id AND code = 'occupation_ship') THEN
        RAISE EXCEPTION 'La Nave de Ocupación no se puede fabricar en el hangar. Se adquiere con TUNG.' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  IF auth.uid() IS NOT NULL AND COALESCE(current_setting('occ.restoring', true), '0') <> '1'
     AND NEW.planet_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.occupations o WHERE o.planet_id = NEW.planet_id AND o.status = 'active') THEN
    RAISE EXCEPTION 'Este planeta está ocupado por otro jugador. Recupéralo atacando a la guarnición enemiga.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_occ_block_queue ON public.building_queue;
CREATE TRIGGER trg_occ_block_queue BEFORE INSERT ON public.building_queue
FOR EACH ROW EXECUTE FUNCTION public._occ_trg_block_queue();
DROP TRIGGER IF EXISTS trg_occ_block_queue ON public.shipyard_queue;
CREATE TRIGGER trg_occ_block_queue BEFORE INSERT ON public.shipyard_queue
FOR EACH ROW EXECUTE FUNCTION public._occ_trg_block_queue();
DROP TRIGGER IF EXISTS trg_occ_block_queue ON public.research_queue;
CREATE TRIGGER trg_occ_block_queue BEFORE INSERT ON public.research_queue
FOR EACH ROW EXECUTE FUNCTION public._occ_trg_block_queue();

-- Aviso al ocupante de flotas hostiles hacia su planeta ocupado
CREATE OR REPLACE FUNCTION public._occ_trg_hostile_warning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_occupier uuid;
  v_pname text;
  v_attacker text;
BEGIN
  IF NEW.mission_type IN ('attack', 'espionage', 'destroy') AND NOT COALESCE(NEW.is_returning, false)
     AND COALESCE(NEW.target_type, 'planet') = 'planet' THEN
    BEGIN
      SELECT o.occupier_id, p.name INTO v_occupier, v_pname
      FROM public.planets p
      JOIN public.occupations o ON o.planet_id = p.id AND o.status = 'active'
      WHERE p.galaxy = NEW.target_galaxy AND p.solar_system = NEW.target_system
        AND p.position = NEW.target_position AND p.planet_type = 'planet'
      LIMIT 1;
      IF v_occupier IS NOT NULL AND v_occupier <> NEW.user_id THEN
        SELECT username INTO v_attacker FROM public.profiles WHERE id = NEW.user_id;
        INSERT INTO public.messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (NULL, v_occupier,
          CASE WHEN NEW.mission_type = 'espionage' THEN 'Espionaje hacia tu planeta ocupado' ELSE '¡Flota hostil hacia tu planeta ocupado!' END,
          format('%s ha enviado una misión de %s hacia %s [%s:%s:%s], planeta que tienes ocupado. Llegada: %s.',
            COALESCE(v_attacker, 'Un jugador'),
            CASE NEW.mission_type WHEN 'attack' THEN 'ataque' WHEN 'espionage' THEN 'espionaje' ELSE 'destrucción' END,
            COALESCE(v_pname, 'tu planeta ocupado'), NEW.target_galaxy, NEW.target_system, NEW.target_position,
            to_char(NEW.arrival_time AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC'),
          'fleet_warning');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[OCUPA1] hostile warning failed: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS trg_occ_hostile_warning ON public.fleets;
CREATE TRIGGER trg_occ_hostile_warning
AFTER INSERT ON public.fleets
FOR EACH ROW EXECUTE FUNCTION public._occ_trg_hostile_warning();

-- ---------------------------------------------------------------------
-- 5. RPCs publicas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_occupation_ship_info()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_price numeric;
  v_ship record;
  v_balance numeric;
  v_active integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  v_price := public.get_live_tung_price_usd();
  SELECT * INTO v_ship FROM public.ship_types WHERE code = 'occupation_ship';
  SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM public.profiles WHERE id = v_uid;
  SELECT count(*) INTO v_active FROM public.occupations WHERE occupier_id = v_uid AND status = 'active';
  RETURN jsonb_build_object(
    'success', true,
    'unit_price_usd', 25,
    'tung_price_usd', v_price,
    'unit_cost_tung', CASE WHEN v_price IS NULL OR v_price <= 0 THEN NULL ELSE CEIL(25.0 / v_price) END,
    'balance', COALESCE(v_balance, 0),
    'max_per_purchase', 10,
    'max_active_occupations', 3,
    'active_occupations', v_active,
    'ship', CASE WHEN v_ship.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_ship.id, 'code', v_ship.code, 'name', v_ship.name, 'description', v_ship.description,
      'image_url', v_ship.image_url, 'structural_integrity', v_ship.structural_integrity,
      'shield_power', v_ship.shield_power, 'weapon_power', v_ship.weapon_power,
      'cargo_capacity', v_ship.cargo_capacity, 'base_speed', v_ship.base_speed,
      'fuel_consumption', v_ship.fuel_consumption) END
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.purchase_occupation_ship(p_planet_id uuid, p_quantity integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_qty integer := COALESCE(p_quantity, 1);
  v_planet record;
  v_ship_id integer;
  v_price numeric;
  v_cost numeric;
  v_balance numeric;
  v_jackpot numeric;
  v_company numeric;
  v_referrer uuid;
  v_ref_share numeric := 0;
  v_admin_id uuid;
  v_admin_share numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  IF v_qty < 1 OR v_qty > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad inválida (1 a 10 por compra)');
  END IF;

  SELECT id, name, galaxy, solar_system, position INTO v_planet
  FROM public.planets
  WHERE id = p_planet_id AND user_id = v_uid AND NOT COALESCE(is_destroyed, false);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no válido');
  END IF;
  IF public._occ_active(p_planet_id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este planeta está ocupado por otro jugador');
  END IF;
  IF public._colony_listed_since(p_planet_id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia está en venta en el mercado. Cancela la venta para poder usarla.');
  END IF;

  SELECT id INTO v_ship_id FROM public.ship_types WHERE code = 'occupation_ship';
  IF v_ship_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nave no disponible');
  END IF;

  v_price := public.get_live_tung_price_usd();
  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El precio de TUNG no está disponible en este momento. Inténtalo más tarde.');
  END IF;
  v_cost := CEIL(25.0 * v_qty / v_price);

  SELECT COALESCE(fxu_balance, 0), referred_by INTO v_balance, v_referrer
  FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente', 'required', v_cost, 'balance', v_balance);
  END IF;

  v_jackpot := round(v_cost * 0.5, 8);
  v_company := v_cost - v_jackpot;
  IF v_referrer IS NOT NULL AND v_referrer <> v_uid
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_referrer) THEN
    v_ref_share := round(v_company * 0.20, 8);
  ELSE
    v_referrer := NULL;
  END IF;
  v_admin_share := v_company - v_ref_share;

  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = COALESCE(fxu_balance, 0) - v_cost WHERE id = v_uid;

  PERFORM public.contribute_to_jackpot(v_jackpot, 'occupation_ship', v_uid);

  IF v_ref_share > 0 THEN
    PERFORM public._internal_set_fxu_context();
    UPDATE public.profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_ref_share WHERE id = v_referrer;
    INSERT INTO public.referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer, v_uid, NULL, 'occupation_ship_referral', v_ref_share);
  END IF;

  SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_share > 0 AND v_admin_id IS NOT NULL THEN
    PERFORM public._internal_set_fxu_context();
    UPDATE public.profiles SET fxu_balance = COALESCE(fxu_balance, 0) + v_admin_share WHERE id = v_admin_id;
    PERFORM public.record_admin_revenue('other', v_admin_share, 'Nave de Ocupación', v_uid, NULL);
  END IF;

  INSERT INTO public.planet_ships (planet_id, ship_type_id, quantity)
  VALUES (p_planet_id, v_ship_id, v_qty)
  ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = public.planet_ships.quantity + EXCLUDED.quantity;

  INSERT INTO public.occupation_ship_purchases (user_id, planet_id, quantity, unit_price_usd, tung_price_usd, cost_tung,
    jackpot_share, referrer_id, referrer_share, admin_share)
  VALUES (v_uid, p_planet_id, v_qty, 25, v_price, v_cost, v_jackpot, v_referrer, v_ref_share, v_admin_share);

  RETURN jsonb_build_object(
    'success', true,
    'quantity', v_qty,
    'cost_tung', v_cost,
    'tung_price_usd', v_price,
    'planet_name', v_planet.name,
    'message', format('%s Nave(s) de Ocupación entregada(s) en %s [%s:%s:%s].', v_qty, v_planet.name, v_planet.galaxy, v_planet.solar_system, v_planet.position)
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_occupation_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_occ jsonb;
  v_own jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'occupation_id', o.id,
    'planet_id', o.planet_id,
    'planet_name', p.name,
    'galaxy', p.galaxy, 'solar_system', p.solar_system, 'position', p.position,
    'image_id', p.image_id,
    'owner_name', pr.username,
    'started_at', o.started_at,
    'garrison_ships', (SELECT COALESCE(SUM(fs.quantity), 0) FROM public.fleet_ships fs WHERE fs.fleet_id = o.garrison_fleet_id),
    'pending_builds', (SELECT count(*) FROM public.occupation_build_queue q WHERE q.occupation_id = o.id AND q.status = 'pending')
  ) ORDER BY o.started_at), '[]'::jsonb) INTO v_occ
  FROM public.occupations o
  JOIN public.planets p ON p.id = o.planet_id
  LEFT JOIN public.profiles pr ON pr.id = o.owner_id
  WHERE o.occupier_id = v_uid AND o.status = 'active';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'occupation_id', o.id,
    'planet_id', o.planet_id,
    'planet_name', p.name,
    'galaxy', p.galaxy, 'solar_system', p.solar_system, 'position', p.position,
    'occupier_name', pr.username,
    'started_at', o.started_at
  ) ORDER BY o.started_at), '[]'::jsonb) INTO v_own
  FROM public.occupations o
  JOIN public.planets p ON p.id = o.planet_id
  LEFT JOIN public.profiles pr ON pr.id = o.occupier_id
  WHERE o.owner_id = v_uid AND o.status = 'active';

  RETURN jsonb_build_object('success', true, 'as_occupier', v_occ, 'as_owner', v_own, 'max_active', 3);
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_occupation_detail(p_occupation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  o public.occupations%ROWTYPE;
  p public.planets%ROWTYPE;
  v_res record;
  v_shipyard integer;
  v_nanite integer;
  v_garrison jsonb;
  v_queue jsonb;
  v_ships jsonb;
  v_defs jsonb;
  v_targets jsonb;
  v_owner text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  SELECT * INTO o FROM public.occupations WHERE id = p_occupation_id AND occupier_id = v_uid AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ocupación no encontrada');
  END IF;

  PERFORM public._occ_process_builds(o.id);
  PERFORM public.calculate_and_sync_resources_internal(o.planet_id, o.owner_id);

  SELECT * INTO p FROM public.planets WHERE id = o.planet_id;
  SELECT metal, crystal, deuterium, metal_per_hour, crystal_per_hour, deuterium_per_hour
  INTO v_res FROM public.planet_resources WHERE planet_id = o.planet_id;
  SELECT username INTO v_owner FROM public.profiles WHERE id = o.owner_id;

  SELECT COALESCE(MAX(pb.level), 0) INTO v_shipyard FROM public.planet_buildings pb
  JOIN public.building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = o.planet_id AND bt.code = 'shipyard';
  SELECT COALESCE(MAX(pb.level), 0) INTO v_nanite FROM public.planet_buildings pb
  JOIN public.building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = o.planet_id AND bt.code = 'nanite_factory';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ship_type_id', st.id, 'code', st.code, 'name', st.name, 'image_url', st.image_url,
    'quantity', fs.quantity, 'cargo_capacity', st.cargo_capacity, 'base_speed', st.base_speed
  ) ORDER BY st.id), '[]'::jsonb) INTO v_garrison
  FROM public.fleet_ships fs JOIN public.ship_types st ON st.id = fs.ship_type_id
  WHERE fs.fleet_id = o.garrison_fleet_id AND fs.quantity > 0;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id, 'item_type', q.item_type,
    'type_id', COALESCE(q.ship_type_id, q.defense_type_id),
    'name', COALESCE(st.name, dt.name), 'image_url', COALESCE(st.image_url, dt.image_url),
    'quantity', q.quantity, 'quantity_done', q.quantity_done, 'unit_time', q.unit_time,
    'start_time', q.start_time,
    'end_time', q.start_time + make_interval(secs => q.quantity::double precision * q.unit_time)
  ) ORDER BY q.id), '[]'::jsonb) INTO v_queue
  FROM public.occupation_build_queue q
  LEFT JOIN public.ship_types st ON st.id = q.ship_type_id
  LEFT JOIN public.defense_types dt ON dt.id = q.defense_type_id
  WHERE q.occupation_id = o.id AND q.status = 'pending';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', st.id, 'code', st.code, 'name', st.name, 'image_url', st.image_url,
    'metal_cost', st.metal_cost, 'crystal_cost', st.crystal_cost, 'deuterium_cost', st.deuterium_cost,
    'unit_time', GREATEST(1, FLOOR((st.metal_cost + st.crystal_cost) / (2500.0 * (1 + v_shipyard)) * 3600 / POWER(2, v_nanite) / GREATEST(public.get_game_speed(), 1))),
    'available', COALESCE((public.validate_ship_requirements(o.planet_id, st.id)->>'valid')::boolean, false)
  ) ORDER BY st.id), '[]'::jsonb) INTO v_ships
  FROM public.ship_types st
  WHERE st.code <> 'occupation_ship' AND COALESCE(st.base_speed, 0) > 0;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', dt.id, 'code', dt.code, 'name', dt.name, 'image_url', dt.image_url,
    'metal_cost', dt.metal_cost, 'crystal_cost', dt.crystal_cost, 'deuterium_cost', dt.deuterium_cost,
    'unit_time', GREATEST(1, FLOOR((dt.metal_cost + dt.crystal_cost) / (2500.0 * (1 + v_shipyard)) * 3600 / POWER(2, v_nanite) / GREATEST(public.get_game_speed(), 1))),
    'available', COALESCE((public.validate_defense_requirements(o.planet_id, dt.id)->>'valid')::boolean, false)
  ) ORDER BY dt.id), '[]'::jsonb) INTO v_defs
  FROM public.defense_types dt
  WHERE dt.id NOT IN (7, 8, 9, 10, 11, 13) AND COALESCE(dt.max_per_planet, 0) = 0
    AND dt.code NOT IN ('anti_ballistic_missile', 'interplanetary_missile');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', tp.id, 'name', tp.name, 'galaxy', tp.galaxy, 'solar_system', tp.solar_system,
    'position', tp.position, 'planet_type', tp.planet_type
  ) ORDER BY tp.is_main_planet DESC, tp.created_at), '[]'::jsonb) INTO v_targets
  FROM public.planets tp
  WHERE tp.user_id = v_uid AND NOT COALESCE(tp.is_destroyed, false)
    AND NOT EXISTS (SELECT 1 FROM public.occupations x WHERE x.planet_id = tp.id AND x.status = 'active')
    AND public._colony_listed_since(tp.id) IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'occupation', jsonb_build_object(
      'id', o.id, 'started_at', o.started_at, 'owner_name', v_owner,
      'planet_id', p.id, 'planet_name', p.name, 'galaxy', p.galaxy, 'solar_system', p.solar_system,
      'position', p.position, 'image_id', p.image_id),
    'resources', jsonb_build_object(
      'metal', FLOOR(COALESCE(v_res.metal, 0)), 'crystal', FLOOR(COALESCE(v_res.crystal, 0)),
      'deuterium', FLOOR(COALESCE(v_res.deuterium, 0)),
      'metal_per_hour', COALESCE(v_res.metal_per_hour, 0), 'crystal_per_hour', COALESCE(v_res.crystal_per_hour, 0),
      'deuterium_per_hour', COALESCE(v_res.deuterium_per_hour, 0)),
    'shipyard_level', v_shipyard,
    'garrison', v_garrison,
    'queue', v_queue,
    'build_ships', v_ships,
    'build_defenses', v_defs,
    'transport_targets', v_targets
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.occupation_build(p_occupation_id uuid, p_item_type text, p_type_id integer, p_quantity integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  o public.occupations%ROWTYPE;
  v_name text;
  v_m numeric;
  v_c numeric;
  v_d numeric;
  v_valid jsonb;
  v_shipyard integer;
  v_nanite integer;
  v_unit_time integer;
  v_res record;
  v_start timestamptz;
  v_pending integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad inválida (1 a 10000)');
  END IF;
  IF p_item_type NOT IN ('ship', 'defense') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo inválido');
  END IF;

  SELECT * INTO o FROM public.occupations
  WHERE id = p_occupation_id AND occupier_id = v_uid AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ocupación no encontrada');
  END IF;

  PERFORM public._occ_process_builds(o.id);

  SELECT count(*) INTO v_pending FROM public.occupation_build_queue WHERE occupation_id = o.id AND status = 'pending';
  IF v_pending >= 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La cola de producción está llena (máximo 10 órdenes)');
  END IF;

  SELECT COALESCE(MAX(pb.level), 0) INTO v_shipyard FROM public.planet_buildings pb
  JOIN public.building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = o.planet_id AND bt.code = 'shipyard';
  IF v_shipyard < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El planeta no tiene Hangar');
  END IF;
  SELECT COALESCE(MAX(pb.level), 0) INTO v_nanite FROM public.planet_buildings pb
  JOIN public.building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = o.planet_id AND bt.code = 'nanite_factory';

  IF p_item_type = 'ship' THEN
    SELECT name, metal_cost, crystal_cost, deuterium_cost INTO v_name, v_m, v_c, v_d
    FROM public.ship_types
    WHERE id = p_type_id AND code <> 'occupation_ship' AND COALESCE(base_speed, 0) > 0;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Esta unidad no se puede producir en un planeta ocupado');
    END IF;
    v_valid := public.validate_ship_requirements(o.planet_id, p_type_id);
  ELSE
    SELECT name, metal_cost, crystal_cost, deuterium_cost INTO v_name, v_m, v_c, v_d
    FROM public.defense_types
    WHERE id = p_type_id AND id NOT IN (7, 8, 9, 10, 11, 13) AND COALESCE(max_per_planet, 0) = 0
      AND code NOT IN ('anti_ballistic_missile', 'interplanetary_missile');
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Esta defensa no se puede producir en un planeta ocupado');
    END IF;
    v_valid := public.validate_defense_requirements(o.planet_id, p_type_id);
  END IF;
  IF NOT COALESCE((v_valid->>'valid')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El planeta no cumple los requisitos para ' || v_name, 'missing', v_valid->'missing');
  END IF;

  v_unit_time := GREATEST(1, FLOOR((v_m + v_c) / (2500.0 * (1 + v_shipyard)) * 3600 / POWER(2, v_nanite) / GREATEST(public.get_game_speed(), 1)))::integer;
  v_unit_time := GREATEST(1, COALESCE(public.apply_vip_time_bonus(v_uid, v_unit_time), v_unit_time));

  PERFORM public.calculate_and_sync_resources_internal(o.planet_id, o.owner_id);
  SELECT metal, crystal, deuterium INTO v_res FROM public.planet_resources WHERE planet_id = o.planet_id FOR UPDATE;
  IF COALESCE(v_res.metal, 0) < v_m * p_quantity OR COALESCE(v_res.crystal, 0) < v_c * p_quantity
     OR COALESCE(v_res.deuterium, 0) < v_d * p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos insuficientes en el planeta ocupado');
  END IF;

  UPDATE public.planet_resources
  SET metal = metal - v_m * p_quantity, crystal = crystal - v_c * p_quantity, deuterium = deuterium - v_d * p_quantity
  WHERE planet_id = o.planet_id;

  SELECT GREATEST(now(), COALESCE(MAX(start_time + make_interval(secs => quantity::double precision * unit_time)), now()))
  INTO v_start
  FROM public.occupation_build_queue WHERE occupation_id = o.id AND status = 'pending';

  INSERT INTO public.occupation_build_queue (occupation_id, planet_id, item_type, ship_type_id, defense_type_id,
    quantity, unit_time, metal_cost, crystal_cost, deuterium_cost, start_time)
  VALUES (o.id, o.planet_id, p_item_type,
    CASE WHEN p_item_type = 'ship' THEN p_type_id END,
    CASE WHEN p_item_type = 'defense' THEN p_type_id END,
    p_quantity, v_unit_time, v_m, v_c, v_d, v_start);

  RETURN jsonb_build_object('success', true, 'message', format('%s x %s añadidos a la producción.', p_quantity, v_name),
    'unit_time', v_unit_time, 'start_time', v_start);
END
$fn$;

CREATE OR REPLACE FUNCTION public.occupation_cancel_build(p_item_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  o public.occupations%ROWTYPE;
  q public.occupation_build_queue%ROWTYPE;
  v_left integer;
  r record;
  v_prev_end timestamptz;
  v_start timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  SELECT o2.* INTO o FROM public.occupations o2
  JOIN public.occupation_build_queue q2 ON q2.occupation_id = o2.id
  WHERE q2.id = p_item_id AND o2.occupier_id = v_uid AND o2.status = 'active'
  FOR UPDATE OF o2;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada');
  END IF;

  PERFORM public._occ_process_builds(o.id);

  SELECT * INTO q FROM public.occupation_build_queue WHERE id = p_item_id FOR UPDATE;
  IF q.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La orden ya terminó');
  END IF;

  v_left := q.quantity - q.quantity_done;
  UPDATE public.occupation_build_queue SET status = 'cancelled' WHERE id = q.id;
  IF v_left > 0 THEN
    UPDATE public.planet_resources
    SET metal = metal + q.metal_cost * v_left, crystal = crystal + q.crystal_cost * v_left,
        deuterium = deuterium + q.deuterium_cost * v_left
    WHERE planet_id = o.planet_id;
  END IF;

  -- Re-encadenar las ordenes siguientes
  v_prev_end := now();
  FOR r IN SELECT * FROM public.occupation_build_queue WHERE occupation_id = o.id AND status = 'pending' ORDER BY id LOOP
    IF r.start_time > now() THEN
      v_start := v_prev_end;
      UPDATE public.occupation_build_queue SET start_time = v_start WHERE id = r.id;
    ELSE
      v_start := r.start_time;
    END IF;
    v_prev_end := GREATEST(v_prev_end, v_start + make_interval(secs => r.quantity::double precision * r.unit_time));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message', 'Orden cancelada. Recursos devueltos al planeta ocupado.');
END
$fn$;

CREATE OR REPLACE FUNCTION public.occupation_transport(p_occupation_id uuid, p_ships jsonb,
  p_metal bigint, p_crystal bigint, p_deuterium bigint, p_target_planet_id uuid, p_speed_percent integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
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
$fn$;

CREATE OR REPLACE FUNCTION public.occupation_abandon(p_occupation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  o public.occupations%ROWTYPE;
BEGIN
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

  UPDATE public.fleets
  SET is_returning = true,
      arrival_time = now(),
      return_time = now() + GREATEST(interval '10 seconds', arrival_time - departure_time)
  WHERE id = o.garrison_fleet_id AND NOT is_returning AND NOT is_completed;

  -- Si la guarnicion ya no existia, cerrar igualmente
  PERFORM public._occ_end(o.id, 'abandoned');

  RETURN jsonb_build_object('success', true, 'message', 'Has abandonado la ocupación. Tu guarnición regresa a casa.');
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_occupation_ranking(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  WITH agg AS (
    SELECT o.occupier_id,
           count(*) AS conquests,
           count(*) FILTER (WHERE o.status = 'active') AS active,
           count(*) FILTER (WHERE o.end_reason = 'recovered') AS lost,
           FLOOR(COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(o.ended_at, now()) - o.started_at))), 0) / 3600)::bigint AS hours
    FROM public.occupations o
    GROUP BY o.occupier_id
  ), ranked AS (
    SELECT a.*, pr.username,
           row_number() OVER (ORDER BY a.conquests DESC, a.active DESC, a.hours DESC, a.occupier_id) AS rnk
    FROM agg a LEFT JOIN public.profiles pr ON pr.id = a.occupier_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rank', rnk, 'username', COALESCE(username, 'Desconocido'), 'conquests', conquests,
    'active', active, 'recovered_by_owner', lost, 'hours', hours, 'is_me', occupier_id = v_uid
  ) ORDER BY rnk), '[]'::jsonb) INTO v_rows
  FROM ranked WHERE rnk <= LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  RETURN jsonb_build_object('success', true, 'ranking', v_rows);
END
$fn$;

-- ---------------------------------------------------------------------
-- 6. Parches a funciones existentes (idempotentes, anclas verificadas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.occ_patch(p_fn regprocedure, p_marker text, p_anchor text, p_new text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  src text;
  n integer;
BEGIN
  src := replace(pg_get_functiondef(p_fn), chr(13), '');
  IF position(p_marker IN src) > 0 THEN
    RAISE NOTICE '[OCUPA1] % ya tiene %', p_fn, p_marker;
    RETURN;
  END IF;
  n := (length(src) - length(replace(src, p_anchor, ''))) / GREATEST(length(p_anchor), 1);
  IF n <> 1 THEN
    RAISE EXCEPTION '[OCUPA1] ancla % encontrada % veces en %', p_marker, n, p_fn;
  END IF;
  EXECUTE replace(src, p_anchor, p_new);
END
$fn$;

-- Inserta una linea justo despues del primer BEGIN del cuerpo
CREATE OR REPLACE FUNCTION pg_temp.occ_guard_insert(p_fn regprocedure, p_marker text, p_stmt text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  src text;
  v_body integer;
  v_beg integer;
  v_eol integer;
BEGIN
  src := replace(pg_get_functiondef(p_fn), chr(13), '');
  IF position(p_marker IN src) > 0 THEN
    RAISE NOTICE '[OCUPA1] % ya tiene %', p_fn, p_marker;
    RETURN;
  END IF;
  v_body := position('$function$' IN src);
  IF v_body = 0 THEN
    RAISE EXCEPTION '[OCUPA1] cuerpo no encontrado en %', p_fn;
  END IF;
  v_beg := position(E'\nBEGIN' IN substr(src, v_body));
  IF v_beg = 0 THEN
    RAISE EXCEPTION '[OCUPA1] BEGIN no encontrado en %', p_fn;
  END IF;
  v_beg := v_body + v_beg;               -- posicion de 'B'
  v_eol := position(E'\n' IN substr(src, v_beg));
  IF v_eol = 0 THEN
    RAISE EXCEPTION '[OCUPA1] fin de linea no encontrado en %', p_fn;
  END IF;
  v_eol := v_beg + v_eol - 1;            -- posicion del salto de linea
  EXECUTE substr(src, 1, v_eol) || '  ' || p_stmt || ' /* ' || p_marker || ' */' || E'\n' || substr(src, v_eol + 1);
END
$fn$;

DO $do$
DECLARE
  r record;
  g record;
BEGIN
  -- 6.1 Guardas de planeta ocupado
  FOR g IN
    SELECT * FROM (VALUES
      ('create_market_listing',          'p_planet_id',        'PERFORM public._occ_guard(p_planet_id); IF p_item_code = ''occupation_ship'' THEN RAISE EXCEPTION ''La Nave de Ocupación no se puede vender en el mercado.''; END IF;'),
      ('purchase_market_listing',        'p_buyer_planet_id',  'PERFORM public._occ_guard(p_buyer_planet_id);'),
      ('fulfill_buy_offer',              'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('galaxy_navigate',                'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('purchase_supply_box',            'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('launch_missiles',                'p_origin_planet_id', 'PERFORM public._occ_guard(p_origin_planet_id);'),
      ('deploy_to_fortress',             'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('create_colony_listing',          'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('purchase_colony_listing',        'p_listing_id',       'PERFORM public._occ_guard((SELECT ml.planet_id FROM public.market_listings ml WHERE ml.id = p_listing_id));'),
      ('secure_abandon_colony',          'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('secure_demolish_building',       'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('update_production_percentages',  'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('refill_colony_resources',        'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('purchase_instant_unit',          'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('purchase_ship_blueprint',        'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('secure_add_to_building_queue',   'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('secure_activate_building_queue', 'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('secure_add_to_shipyard_queue',   'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('secure_start_research',          'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('set_planet_autopilot_enabled',   'p_planet_id',        'PERFORM public._occ_guard(p_planet_id);'),
      ('secure_send_fleet',              'p_origin_planet_id', 'PERFORM public._occ_guard(p_origin_planet_id);'),
      ('join_acs_with_fleet',            'p_origin_planet_id', 'PERFORM public._occ_guard(p_origin_planet_id);')
    ) AS t(fname, pname, stmt)
  LOOP
    FOR r IN
      SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname = g.fname
        AND g.pname = ANY (p.proargnames)
    LOOP
      PERFORM pg_temp.occ_guard_insert(r.sig, '[OCUPA1-g]', g.stmt);
    END LOOP;
    IF NOT FOUND THEN
      RAISE NOTICE '[OCUPA1] sin overloads para % (%)', g.fname, g.pname;
    END IF;
  END LOOP;

  -- create_buy_offer: la Nave de Ocupacion no se comercia
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_buy_offer'
             AND 'p_item_code' = ANY (p.proargnames)
  LOOP
    PERFORM pg_temp.occ_guard_insert(r.sig, '[OCUPA1-bo]',
      'IF p_item_code = ''occupation_ship'' THEN RAISE EXCEPTION ''La Nave de Ocupación no se puede comerciar en el mercado.''; END IF;');
  END LOOP;

  -- 6.2 Expediciones nunca la regalan
  PERFORM pg_temp.occ_guard_insert('public.user_can_build_ship(uuid,integer)'::regprocedure, '[OCUPA1-ucb]',
    'IF EXISTS (SELECT 1 FROM public.ship_types WHERE id = p_ship_type_id AND code = ''occupation_ship'') THEN RETURN false; END IF;');

  -- 6.3 Restauracion de colas sin volver a exigir/consumir planos
  PERFORM pg_temp.occ_guard_insert('public.enforce_ship_blueprint_requirement()'::regprocedure, '[OCUPA1-bp]',
    'IF current_setting(''occ.restoring'', true) = ''1'' THEN RETURN NEW; END IF;');

  -- 6.4 process_fleet_arrival: recuperacion (inicio rama ataque) + inicio de ocupacion
  PERFORM pg_temp.occ_patch('public.process_fleet_arrival(uuid)'::regprocedure, '[OCUPA1-pfa1]',
    E'  WHEN \'attack\' THEN\n    SELECT p.* INTO target_planet FROM planets p WHERE',
    E'  WHEN \'attack\' THEN\n    IF public._occ_recovery_arrival(p_fleet_id) THEN RETURN; END IF; /* [OCUPA1-pfa1] */\n    SELECT p.* INTO target_planet FROM planets p WHERE');
  PERFORM pg_temp.occ_patch('public.process_fleet_arrival(uuid)'::regprocedure, '[OCUPA1-pfa2]',
    E'\n      IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN\n        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;\n      ELSE\n        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;\n      END IF;\n    ELSE\n      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;\n    END IF;\n  ELSE\n    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;\n  END CASE;',
    E'\n      IF (combat_result->>\'result\') = \'attacker_won\' AND public._occ_try_start(p_fleet_id, target_planet.id, loot_metal, loot_crystal, loot_deuterium) THEN RETURN; END IF; /* [OCUPA1-pfa2] */\n      IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN\n        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;\n      ELSE\n        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;\n      END IF;\n    ELSE\n      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;\n    END IF;\n  ELSE\n    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;\n  END CASE;');

  -- 6.5 Combate: en una recuperacion solo defiende la guarnicion (no naves/defensas del planeta)
  PERFORM pg_temp.occ_patch('public.perform_combat(uuid,uuid)'::regprocedure, '[OCUPA1-pc1]',
    'WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0',
    'WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0 AND NOT public._occ_is_recovery_fleet(p_attacker_fleet_id, p_target_planet_id) /* [OCUPA1-pc1] */');
  PERFORM pg_temp.occ_patch('public.perform_combat(uuid,uuid)'::regprocedure, '[OCUPA1-pc2]',
    'WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0',
    'WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0 AND NOT public._occ_is_recovery_fleet(p_attacker_fleet_id, p_target_planet_id) /* [OCUPA1-pc2] */');
  PERFORM pg_temp.occ_patch('public.perform_acs_combat(uuid,uuid)'::regprocedure, '[OCUPA1-pac1]',
    'WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0',
    'WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0 AND NOT public._occ_is_recovery_acs(p_acs_id, p_target_planet_id) /* [OCUPA1-pac1] */');
  PERFORM pg_temp.occ_patch('public.perform_acs_combat(uuid,uuid)'::regprocedure, '[OCUPA1-pac2]',
    'WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0',
    'WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0 AND NOT public._occ_is_recovery_acs(p_acs_id, p_target_planet_id) /* [OCUPA1-pac2] */');

  -- 6.6 ACS: recuperacion cuando el creador es el dueno
  PERFORM pg_temp.occ_patch('public.process_acs_fleet_arrival(uuid)'::regprocedure, '[OCUPA1-acs1]',
    E'  v_c jsonb;\nBEGIN\n',
    E'  v_c jsonb;\n  v_occ_rec boolean := false; /* [OCUPA1-acs1] */\nBEGIN\n');
  PERFORM pg_temp.occ_patch('public.process_acs_fleet_arrival(uuid)'::regprocedure, '[OCUPA1-acs2]',
    E'  v_combat_result := perform_acs_combat(p_acs_id, v_target_planet.id);\n',
    E'  v_occ_rec := public._occ_prepare_acs(p_acs_id, v_target_planet.id); /* [OCUPA1-acs2] */\n  v_combat_result := perform_acs_combat(p_acs_id, v_target_planet.id);\n  IF v_occ_rec AND (v_combat_result->>\'result\') = \'attacker_won\' THEN PERFORM public._occ_end_for_planet(v_target_planet.id, \'recovered\'); END IF;\n');
  PERFORM pg_temp.occ_patch('public.process_acs_fleet_arrival(uuid)'::regprocedure, '[OCUPA1-acs3]',
    E'  IF (v_combat_result->>\'result\') = \'attacker_won\' THEN\n    SELECT COALESCE(SUM((unit->>\'quantity\')::integer * COALESCE((unit->>\'cargo_capacity\')',
    E'  IF (v_combat_result->>\'result\') = \'attacker_won\' AND NOT v_occ_rec /* [OCUPA1-acs3] */ THEN\n    SELECT COALESCE(SUM((unit->>\'quantity\')::integer * COALESCE((unit->>\'cargo_capacity\')');
  PERFORM pg_temp.occ_patch('public.process_acs_fleet_arrival(uuid)'::regprocedure, '[OCUPA1-acs4]',
    E'  IF (v_combat_result->>\'result\') = \'attacker_won\' THEN\n    UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = v_target_planet.user_id;',
    E'  IF (v_combat_result->>\'result\') = \'attacker_won\' AND v_occ_rec THEN\n    NULL; /* [OCUPA1-acs4] recuperacion: sin dano estructural al planeta del dueno */\n  ELSIF (v_combat_result->>\'result\') = \'attacker_won\' THEN\n    UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = v_target_planet.user_id;');

  -- 6.7 Validacion de misiones hacia un planeta ocupado
  PERFORM pg_temp.occ_patch(
    'public.validate_fleet_mission(uuid,uuid,integer,integer,integer,text,text)'::regprocedure, '[OCUPA1-vfm]',
    E'  IF p_mission_type = \'colonize\' THEN\n',
    E'  /* [OCUPA1-vfm] planeta ocupado */\n'
    || E'  IF COALESCE(p_target_type, \'planet\') = \'planet\' AND NOT v_is_fortress AND NOT v_is_treasure THEN\n'
    || E'    DECLARE\n      v_occ record;\n    BEGIN\n'
    || E'      SELECT o.owner_id, o.occupier_id INTO v_occ\n'
    || E'      FROM public.occupations o JOIN public.planets op ON op.id = o.planet_id\n'
    || E'      WHERE o.status = \'active\' AND op.galaxy = p_target_galaxy AND op.solar_system = p_target_system\n'
    || E'        AND op.position = p_target_position AND op.planet_type = \'planet\'\n'
    || E'      LIMIT 1;\n'
    || E'      IF FOUND THEN\n'
    || E'        IF p_mission_type IN (\'transport\', \'deploy\', \'hold\') THEN\n'
    || E'          RETURN jsonb_build_object(\'valid\', false, \'reason\', \'Este planeta está ocupado por otro jugador: no admite transportes ni despliegues.\');\n'
    || E'        END IF;\n'
    || E'        IF p_mission_type IN (\'attack\', \'destroy\', \'espionage\') AND p_user_id = v_occ.occupier_id THEN\n'
    || E'          RETURN jsonb_build_object(\'valid\', false, \'reason\', \'No puedes atacar un planeta que tienes ocupado.\');\n'
    || E'        END IF;\n'
    || E'        IF p_mission_type IN (\'attack\', \'espionage\') AND p_user_id = v_occ.owner_id THEN\n'
    || E'          RETURN jsonb_build_object(\'valid\', true);\n'
    || E'        END IF;\n'
    || E'      END IF;\n'
    || E'    END;\n'
    || E'  END IF;\n\n'
    || E'  IF p_mission_type = \'colonize\' THEN\n');

  -- 6.8 Unirse a un ACS de recuperacion
  PERFORM pg_temp.occ_patch('public.join_acs_with_fleet(uuid,uuid,jsonb,integer)'::regprocedure, '[OCUPA1-join]',
    E'  IF v_target_planet.id IS NOT NULL AND v_target_planet.user_id IS NOT NULL THEN\n    IF v_target_planet.user_id = v_user_id THEN',
    E'  /* [OCUPA1-join] planeta ocupado */\n'
    || E'  DECLARE\n    v_occ record;\n  BEGIN\n'
    || E'    SELECT o.owner_id, o.occupier_id INTO v_occ\n'
    || E'    FROM public.occupations o JOIN public.planets op ON op.id = o.planet_id\n'
    || E'    WHERE o.status = \'active\' AND op.galaxy = v_acs_record.target_galaxy AND op.solar_system = v_acs_record.target_system\n'
    || E'      AND op.position = v_acs_record.target_position AND op.planet_type = \'planet\'\n'
    || E'    LIMIT 1;\n'
    || E'    IF FOUND THEN\n'
    || E'      IF v_occ.occupier_id = v_user_id THEN\n'
    || E'        RETURN jsonb_build_object(\'success\', false, \'error\', \'No puedes atacar un planeta que tienes ocupado\');\n'
    || E'      END IF;\n'
    || E'      IF v_acs_record.creator_id = v_occ.owner_id AND v_target_planet.id IS NOT NULL THEN\n'
    || E'        v_target_planet.user_id := v_occ.occupier_id;\n'
    || E'      END IF;\n'
    || E'    END IF;\n'
    || E'  END;\n\n'
    || E'  IF v_target_planet.id IS NOT NULL AND v_target_planet.user_id IS NOT NULL THEN\n    IF v_target_planet.user_id = v_user_id THEN');
END
$do$;

-- ---------------------------------------------------------------------
-- 7. Permisos
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('_occ_active', '_occ_guard', '_occ_is_recovery_fleet', '_occ_is_recovery_acs',
        '_occ_process_builds', '_occ_end', '_occ_end_for_planet', '_occ_prepare_acs', '_occ_try_start',
        '_occ_recovery_arrival', '_occ_cron_tick', '_occ_trg_garrison_end', '_occ_trg_block_fleet',
        '_occ_trg_block_queue', '_occ_trg_hostile_warning',
        'get_occupation_ship_info', 'purchase_occupation_ship', 'get_occupation_overview', 'get_occupation_detail',
        'occupation_build', 'occupation_cancel_build', 'occupation_transport', 'occupation_abandon', 'get_occupation_ranking')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.proname IN ('get_occupation_ship_info', 'purchase_occupation_ship', 'get_occupation_overview', 'get_occupation_detail',
                     'occupation_build', 'occupation_cancel_build', 'occupation_transport', 'occupation_abandon', 'get_occupation_ranking') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    END IF;
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------
-- 8. Cron (acreditacion de produccion del ocupante + autocuracion)
-- ---------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'occupation-build-tick') THEN
    PERFORM cron.unschedule('occupation-build-tick');
  END IF;
  PERFORM cron.schedule('occupation-build-tick', '* * * * *', 'SELECT public._occ_cron_tick()');
END
$do$;
