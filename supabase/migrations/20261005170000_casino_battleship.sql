-- [BATTLESHIP1] Batalla Naval espacial PvP con apuestas TUNG (planeta 3:250:6)
-- Reglas: tablero 10x10, flota Estrella de la Muerte(5) Acorazado(4) Crucero(3) Destructor(3) Cazador Ligero(2).
-- Clasico: si aciertas vuelves a disparar. Turno 30 s; al agotarse se dispara automatico; 3 agotados seguidos = derrota.
-- Dinero: cada jugador paga 20% de su apuesta (10% pools, 10% empresa -> 20% de eso al referido).
--         El ganador cobra el 80% de ambas apuestas (1.6x). La comision se cobra al empezar la partida;
--         una sala cancelada/expirada antes de empezar se devuelve completa.
-- Seguridad: tablas con RLS sin politicas y sin privilegios para roles de API; todo pasa por RPC
--            SECURITY DEFINER con auth.uid(); el tablero rival nunca se envia (solo impactos y naves hundidas).
--            Sin realtime: el cliente consulta por polling.
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- 1) Nuevo tipo de ingreso de empresa
ALTER TABLE public.admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE public.admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check CHECK (revenue_type = ANY (ARRAY[
  'market_fee','withdrawal_fee','instant_build','instant_research','instant_ship','referral_bonus','officer_fxu',
  'expedition_fee','supply_box','fleet_acceleration','swap_fee','transfer_fee','plus_subscription','colony_abandon',
  'planet_rename','alliance_rename','alliance_creation','lottery_fee','p2p_fee','blueprint_sale','hero_respec',
  'hero_kit_sale','other','premium_mission','hero_duel','daily_streak','deposit_gas_buffer','instant_unit_sale',
  'casino_roulette','casino_slots','casino_dice','casino_battleship'
]::text[])) NOT VALID;

-- 2) Coordenada reservada 3:250:6
CREATE OR REPLACE FUNCTION public._battleship_is_location(p_galaxy integer, p_system integer, p_position integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_galaxy = 3 AND p_system = 250 AND p_position = 6;
$$;
REVOKE ALL ON FUNCTION public._battleship_is_location(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._battleship_is_location(integer, integer, integer) TO authenticated;

-- Parches minimos: no se pueden enviar flotas ahi y una colonizacion en vuelo regresa sin colonizar
-- (sin trigger que lance excepcion: romperia el procesado de llegadas).
DO $mig$
DECLARE
  v_def    text;
  v_new    text;
  v_anchor text;
BEGIN
  v_def := replace(pg_get_functiondef('public.secure_send_fleet'::regproc), E'\r', '');
  IF position('_battleship_is_location' IN v_def) = 0 THEN
    v_anchor := '-- [CASINO1] El Casino Galactico solo admite la Nave Heroe (hero_casino_travel)';
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) <> length(v_anchor) THEN
      RAISE EXCEPTION 'ancla secure_send_fleet no encontrada o repetida';
    END IF;
    v_new := replace(v_def, v_anchor,
      '-- [BATTLESHIP1] 3:250:6 reservada para la Batalla Naval' || E'\n' ||
      '  IF public._battleship_is_location(p_target_galaxy, p_target_system, p_target_position) THEN' || E'\n' ||
      '    RETURN jsonb_build_object(''success'', false, ''error'', ''Coordenada reservada para la Batalla Naval'');' || E'\n' ||
      '  END IF;' || E'\n\n  ' || v_anchor);
    EXECUTE v_new;
  END IF;

  v_def := replace(pg_get_functiondef('public.process_fleet_arrival'::regproc), E'\r', '');
  IF position('_battleship_is_location' IN v_def) = 0 THEN
    v_anchor := 'has_colony_ship := COALESCE(v_colony_ship_quantity, 0) > 0;';
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) <> length(v_anchor) THEN
      RAISE EXCEPTION 'ancla process_fleet_arrival no encontrada o repetida';
    END IF;
    v_new := replace(v_def, v_anchor, v_anchor ||
      ' IF public._battleship_is_location(fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position) THEN has_colony_ship := false; END IF; /* [BATTLESHIP1] */');
    EXECUTE v_new;
  END IF;
END
$mig$;

-- 3) Tablas (solo accesibles via RPC)
CREATE TABLE IF NOT EXISTS public.battleship_config (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled       boolean NOT NULL DEFAULT true,
  min_stake     numeric NOT NULL DEFAULT 0.10 CHECK (min_stake >= 0.10),
  max_stake     numeric NOT NULL DEFAULT 1000 CHECK (max_stake >= min_stake),
  pool_pending  numeric NOT NULL DEFAULT 0,
  total_matches bigint  NOT NULL DEFAULT 0,
  total_wagered numeric NOT NULL DEFAULT 0,
  total_fees    numeric NOT NULL DEFAULT 0,
  total_paid    numeric NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.battleship_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.battleship_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'placing', 'battle', 'finished', 'cancelled')),
  is_private        boolean NOT NULL DEFAULT false,
  join_code         text UNIQUE,
  stake             numeric NOT NULL CHECK (stake > 0),
  pot               numeric NOT NULL DEFAULT 0,
  player1           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player2           uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  p1_ready          boolean NOT NULL DEFAULT false,
  p2_ready          boolean NOT NULL DEFAULT false,
  turn              uuid,
  deadline          timestamptz,
  p1_seen_at        timestamptz NOT NULL DEFAULT now(),
  p1_timeouts       smallint NOT NULL DEFAULT 0,
  p2_timeouts       smallint NOT NULL DEFAULT 0,
  p1_hits           smallint NOT NULL DEFAULT 0,
  p2_hits           smallint NOT NULL DEFAULT 0,
  p1_shots          smallint NOT NULL DEFAULT 0,
  p2_shots          smallint NOT NULL DEFAULT 0,
  winner            uuid,
  end_reason        text CHECK (end_reason IN ('fleet_destroyed', 'timeout', 'surrender', 'cancelled', 'expired')),
  payout            numeric NOT NULL DEFAULT 0,
  version           integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  battle_started_at timestamptz,
  finished_at       timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (player2 IS NULL OR player2 <> player1),
  CHECK (NOT is_private OR join_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_battleship_matches_active ON public.battleship_matches (status, deadline)
  WHERE status IN ('waiting', 'placing', 'battle');
CREATE INDEX IF NOT EXISTS idx_battleship_matches_p1 ON public.battleship_matches (player1, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battleship_matches_p2 ON public.battleship_matches (player2, created_at DESC) WHERE player2 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_battleship_matches_finished ON public.battleship_matches (finished_at DESC) WHERE status = 'finished';

CREATE TABLE IF NOT EXISTS public.battleship_boards (
  match_id    uuid NOT NULL REFERENCES public.battleship_matches(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  ships       jsonb NOT NULL,
  cells       integer[] NOT NULL,
  auto_placed boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.battleship_shots (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id   uuid NOT NULL REFERENCES public.battleship_matches(id) ON DELETE CASCADE,
  shooter    uuid NOT NULL,
  cell       smallint NOT NULL CHECK (cell BETWEEN 0 AND 99),
  hit        boolean NOT NULL,
  sunk       text,
  auto       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, shooter, cell)
);

CREATE TABLE IF NOT EXISTS public.battleship_entries (
  match_id       uuid NOT NULL REFERENCES public.battleship_matches(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  stake          numeric NOT NULL,
  fee            numeric NOT NULL DEFAULT 0,
  pool_share     numeric NOT NULL DEFAULT 0,
  company_share  numeric NOT NULL DEFAULT 0,
  referrer_id    uuid,
  referrer_share numeric NOT NULL DEFAULT 0,
  payout         numeric NOT NULL DEFAULT 0,
  refunded       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_battleship_entries_user ON public.battleship_entries (user_id, created_at DESC);

DO $mig$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['battleship_config', 'battleship_matches', 'battleship_boards', 'battleship_shots', 'battleship_entries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, authenticator', t);
  END LOOP;
  EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, authenticator',
                 pg_get_serial_sequence('public.battleship_shots', 'id'));
END
$mig$;

-- 4) Utilidades internas
CREATE OR REPLACE FUNCTION public._bs_fleet()
RETURNS TABLE (code text, size integer, ord integer)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  VALUES ('deathstar', 5, 1), ('battlecruiser', 4, 2), ('cruiser', 3, 3), ('destroyer', 3, 4), ('light_fighter', 2, 5);
$$;

-- Entero aleatorio seguro y sin sesgo en [0, p_n)
CREATE OR REPLACE FUNCTION public._bs_rand(p_n integer)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_b   bytea;
  v_r   bigint;
  v_lim bigint := (4294967296::bigint / p_n) * p_n;
BEGIN
  LOOP
    v_b := extensions.gen_random_bytes(4);
    v_r := (get_byte(v_b, 0)::bigint << 24) + (get_byte(v_b, 1)::bigint << 16)
         + (get_byte(v_b, 2)::bigint << 8) + get_byte(v_b, 3)::bigint;
    EXIT WHEN v_r < v_lim;
  END LOOP;
  RETURN (v_r % p_n)::integer;
END;
$$;

-- Celdas de una nave (cell = y*10 + x) o NULL si se sale del tablero
CREATE OR REPLACE FUNCTION public._bs_ship_cells(p_x integer, p_y integer, p_dir text, p_size integer)
RETURNS integer[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_x < 0 OR p_y < 0 OR p_x > 9 OR p_y > 9 THEN NULL
    WHEN p_dir = 'h' AND p_x + p_size <= 10 THEN ARRAY(SELECT p_y * 10 + p_x + i FROM generate_series(0, p_size - 1) i ORDER BY i)
    WHEN p_dir = 'v' AND p_y + p_size <= 10 THEN ARRAY(SELECT (p_y + i) * 10 + p_x FROM generate_series(0, p_size - 1) i ORDER BY i)
    ELSE NULL
  END;
$$;

-- Valida el despliegue enviado por el cliente. Devuelve {ships, cells} o NULL si es invalido.
CREATE OR REPLACE FUNCTION public._bs_build_board(p_ships jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_e     jsonb;
  v_code  text;
  v_dir   text;
  v_size  integer;
  v_x     numeric;
  v_y     numeric;
  v_cells integer[];
  v_all   integer[] := '{}';
  v_seen  text[] := '{}';
  v_out   jsonb := '[]'::jsonb;
BEGIN
  IF p_ships IS NULL OR jsonb_typeof(p_ships) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_ships) <> (SELECT count(*) FROM public._bs_fleet()) THEN
    RETURN NULL;
  END IF;

  FOR v_e IN SELECT value FROM jsonb_array_elements(p_ships) LOOP
    IF jsonb_typeof(v_e) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_e -> 'code') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_e -> 'dir') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_e -> 'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_e -> 'y') IS DISTINCT FROM 'number' THEN
      RETURN NULL;
    END IF;
    v_code := v_e ->> 'code';
    v_dir  := v_e ->> 'dir';
    IF v_dir NOT IN ('h', 'v') OR v_code = ANY (v_seen) THEN
      RETURN NULL;
    END IF;
    v_size := NULL;
    SELECT f.size INTO v_size FROM public._bs_fleet() f WHERE f.code = v_code;
    IF v_size IS NULL THEN
      RETURN NULL;
    END IF;
    v_x := (v_e ->> 'x')::numeric;
    v_y := (v_e ->> 'y')::numeric;
    IF v_x <> trunc(v_x) OR v_y <> trunc(v_y) OR v_x < 0 OR v_x > 9 OR v_y < 0 OR v_y > 9 THEN
      RETURN NULL;
    END IF;
    v_cells := public._bs_ship_cells(v_x::integer, v_y::integer, v_dir, v_size);
    IF v_cells IS NULL OR v_cells && v_all THEN
      RETURN NULL;
    END IF;
    v_all  := v_all || v_cells;
    v_seen := v_seen || v_code;
    v_out  := v_out || jsonb_build_array(jsonb_build_object(
      'code', v_code, 'size', v_size, 'x', v_x::integer, 'y', v_y::integer, 'dir', v_dir, 'cells', to_jsonb(v_cells)));
  END LOOP;

  RETURN jsonb_build_object('ships', v_out, 'cells', to_jsonb(v_all));
END;
$$;

-- Despliegue aleatorio (para quien no despliega a tiempo)
CREATE OR REPLACE FUNCTION public._bs_random_board()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  f       record;
  v_x     integer;
  v_y     integer;
  v_dir   text;
  v_try   integer;
  v_cells integer[];
  v_all   integer[] := '{}';
  v_out   jsonb := '[]'::jsonb;
BEGIN
  FOR f IN SELECT * FROM public._bs_fleet() ORDER BY ord LOOP
    v_try := 0;
    LOOP
      v_try := v_try + 1;
      IF v_try > 5000 THEN
        RAISE EXCEPTION 'battleship: no se pudo desplegar la flota';
      END IF;
      v_dir := CASE WHEN public._bs_rand(2) = 0 THEN 'h' ELSE 'v' END;
      v_x := public._bs_rand(10);
      v_y := public._bs_rand(10);
      v_cells := public._bs_ship_cells(v_x, v_y, v_dir, f.size);
      EXIT WHEN v_cells IS NOT NULL AND NOT (v_cells && v_all);
    END LOOP;
    v_all := v_all || v_cells;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'code', f.code, 'size', f.size, 'x', v_x, 'y', v_y, 'dir', v_dir, 'cells', to_jsonb(v_cells)));
  END LOOP;
  RETURN jsonb_build_object('ships', v_out, 'cells', to_jsonb(v_all));
END;
$$;

CREATE OR REPLACE FUNCTION public._bs_active_match(p_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.battleship_matches
   WHERE status IN ('waiting', 'placing', 'battle') AND (player1 = p_uid OR player2 = p_uid)
   ORDER BY created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._bs_gen_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  c_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i      integer;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(c_alpha, 1 + public._bs_rand(32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.battleship_matches WHERE join_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- Devuelve la apuesta de una sala que nunca empezo (el llamador tiene el bloqueo)
CREATE OR REPLACE FUNCTION public._bs_refund_waiting(p_match_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.battleship_matches%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.status <> 'waiting' THEN
    RETURN;
  END IF;
  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance + m.stake WHERE id = m.player1;
  UPDATE public.battleship_entries SET refunded = true WHERE match_id = p_match_id AND user_id = m.player1;
  UPDATE public.battleship_matches
     SET status = 'cancelled', end_reason = p_reason, deadline = NULL, finished_at = now(),
         version = version + 1, updated_at = now()
   WHERE id = p_match_id;
END;
$$;

-- Fin de partida: el ganador cobra el bote (la comision ya se repartio al empezar)
CREATE OR REPLACE FUNCTION public._bs_settle(p_match_id uuid, p_winner uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.battleship_matches%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.status NOT IN ('placing', 'battle') OR p_winner NOT IN (m.player1, m.player2) THEN
    RETURN;
  END IF;
  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance + m.pot WHERE id = p_winner;
  UPDATE public.battleship_entries
     SET payout = CASE WHEN user_id = p_winner THEN m.pot ELSE 0 END
   WHERE match_id = p_match_id;
  UPDATE public.battleship_matches
     SET status = 'finished', winner = p_winner, end_reason = p_reason, payout = m.pot,
         turn = NULL, deadline = NULL, finished_at = now(), version = version + 1, updated_at = now()
   WHERE id = p_match_id;
  UPDATE public.battleship_config SET total_paid = total_paid + m.pot, updated_at = now() WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public._bs_start_battle(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.battleship_matches%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.status <> 'placing' THEN
    RETURN;
  END IF;
  UPDATE public.battleship_matches
     SET status = 'battle', p1_ready = true, p2_ready = true,
         turn = CASE WHEN public._bs_rand(2) = 0 THEN m.player1 ELSE m.player2 END,
         deadline = now() + interval '30 seconds', battle_started_at = now(),
         version = version + 1, updated_at = now()
   WHERE id = p_match_id;
END;
$$;

-- Aplica un disparo (el llamador tiene el bloqueo y ya valido turno y casilla)
CREATE OR REPLACE FUNCTION public._bs_apply_shot(p_match_id uuid, p_shooter uuid, p_cell integer, p_auto boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m            public.battleship_matches%ROWTYPE;
  v_opp        uuid;
  v_cells      integer[];
  v_ships      jsonb;
  v_ship       jsonb;
  v_ship_cells integer[];
  v_hit        boolean;
  v_sunk       text;
  v_hits       integer;
  v_total      integer;
  v_shot_id    bigint;
BEGIN
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  v_opp := CASE WHEN p_shooter = m.player1 THEN m.player2 ELSE m.player1 END;
  SELECT cells, ships INTO v_cells, v_ships FROM public.battleship_boards WHERE match_id = p_match_id AND user_id = v_opp;
  v_hit := p_cell = ANY (v_cells);

  INSERT INTO public.battleship_shots (match_id, shooter, cell, hit, auto)
  VALUES (p_match_id, p_shooter, p_cell, v_hit, p_auto)
  RETURNING id INTO v_shot_id;

  IF v_hit THEN
    SELECT s INTO v_ship FROM jsonb_array_elements(v_ships) s
     WHERE (s -> 'cells') @> to_jsonb(p_cell)
     LIMIT 1;
    v_ship_cells := ARRAY(SELECT c::integer FROM jsonb_array_elements_text(v_ship -> 'cells') c);
    IF NOT EXISTS (
      SELECT 1 FROM unnest(v_ship_cells) sc
       WHERE NOT EXISTS (SELECT 1 FROM public.battleship_shots s
                          WHERE s.match_id = p_match_id AND s.shooter = p_shooter AND s.cell = sc)) THEN
      v_sunk := v_ship ->> 'code';
      UPDATE public.battleship_shots SET sunk = v_sunk WHERE id = v_shot_id;
    END IF;
  END IF;

  IF p_shooter = m.player1 THEN
    UPDATE public.battleship_matches
       SET p1_hits = p1_hits + v_hit::integer, p1_shots = p1_shots + 1,
           p1_timeouts = CASE WHEN p_auto THEN p1_timeouts ELSE 0 END
     WHERE id = p_match_id
     RETURNING p1_hits INTO v_hits;
  ELSE
    UPDATE public.battleship_matches
       SET p2_hits = p2_hits + v_hit::integer, p2_shots = p2_shots + 1,
           p2_timeouts = CASE WHEN p_auto THEN p2_timeouts ELSE 0 END
     WHERE id = p_match_id
     RETURNING p2_hits INTO v_hits;
  END IF;

  v_total := cardinality(v_cells);
  IF v_hits >= v_total THEN
    PERFORM public._bs_settle(p_match_id, p_shooter, 'fleet_destroyed');
  ELSE
    UPDATE public.battleship_matches
       SET turn = CASE WHEN v_hit THEN p_shooter ELSE v_opp END,
           deadline = now() + interval '30 seconds',
           version = version + 1, updated_at = now()
     WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'shot_id', v_shot_id,
    'cell', p_cell,
    'hit', v_hit,
    'sunk', v_sunk,
    'ship', CASE WHEN v_sunk IS NOT NULL THEN v_ship ELSE NULL END,
    'game_over', v_hits >= v_total
  );
END;
$$;

-- Resuelve plazos vencidos (un paso por llamada)
CREATE OR REPLACE FUNCTION public._bs_resolve(p_match_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m      public.battleship_matches%ROWTYPE;
  v_p    uuid;
  v_b    jsonb;
  v_who  uuid;
  v_opp  uuid;
  v_to   integer;
  v_cell integer;
BEGIN
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF m.status = 'waiting' THEN
    IF m.deadline <= now() OR m.p1_seen_at < now() - interval '90 seconds' THEN
      PERFORM public._bs_refund_waiting(p_match_id, 'expired');
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  IF m.status NOT IN ('placing', 'battle') OR m.deadline IS NULL OR m.deadline > now() THEN
    RETURN false;
  END IF;

  IF m.status = 'placing' THEN
    FOREACH v_p IN ARRAY ARRAY[m.player1, m.player2] LOOP
      IF NOT EXISTS (SELECT 1 FROM public.battleship_boards WHERE match_id = p_match_id AND user_id = v_p) THEN
        v_b := public._bs_random_board();
        INSERT INTO public.battleship_boards (match_id, user_id, ships, cells, auto_placed)
        VALUES (p_match_id, v_p, v_b -> 'ships',
                ARRAY(SELECT c::integer FROM jsonb_array_elements_text(v_b -> 'cells') c), true);
      END IF;
    END LOOP;
    PERFORM public._bs_start_battle(p_match_id);
    RETURN true;
  END IF;

  -- Combate: turno agotado
  v_who := m.turn;
  v_opp := CASE WHEN v_who = m.player1 THEN m.player2 ELSE m.player1 END;
  IF v_who = m.player1 THEN
    UPDATE public.battleship_matches SET p1_timeouts = p1_timeouts + 1 WHERE id = p_match_id RETURNING p1_timeouts INTO v_to;
  ELSE
    UPDATE public.battleship_matches SET p2_timeouts = p2_timeouts + 1 WHERE id = p_match_id RETURNING p2_timeouts INTO v_to;
  END IF;

  IF v_to >= 3 THEN
    PERFORM public._bs_settle(p_match_id, v_opp, 'timeout');
    RETURN true;
  END IF;

  SELECT c INTO v_cell FROM generate_series(0, 99) c
   WHERE NOT EXISTS (SELECT 1 FROM public.battleship_shots s
                      WHERE s.match_id = p_match_id AND s.shooter = v_who AND s.cell = c)
   ORDER BY random()
   LIMIT 1;
  PERFORM public._bs_apply_shot(p_match_id, v_who, v_cell, true);
  RETURN true;
END;
$$;

DO $mig$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._bs_fleet()', 'public._bs_rand(integer)', 'public._bs_ship_cells(integer, integer, text, integer)',
    'public._bs_build_board(jsonb)', 'public._bs_random_board()', 'public._bs_active_match(uuid)',
    'public._bs_gen_code()', 'public._bs_refund_waiting(uuid, text)', 'public._bs_settle(uuid, uuid, text)',
    'public._bs_start_battle(uuid)', 'public._bs_apply_shot(uuid, uuid, integer, boolean)', 'public._bs_resolve(uuid)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || f || ' FROM PUBLIC, anon, authenticated';
  END LOOP;
END
$mig$;

-- 5) RPC publicas (solo authenticated)

-- Lobby: salas publicas, partida activa, historial
CREATE OR REPLACE FUNCTION public.battleship_lobby()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_cfg      public.battleship_config%ROWTYPE;
  v_bal      numeric;
  v_is_admin boolean;
  v_gate     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.battleship_config WHERE id = 1;
  SELECT COALESCE(fxu_balance, 0), COALESCE(is_admin, false) INTO v_bal, v_is_admin FROM public.profiles WHERE id = v_uid;
  v_gate := public._casino_games_gate(v_uid);

  RETURN jsonb_build_object(
    'success', true,
    'enabled', COALESCE(v_cfg.enabled, false),
    'min_stake', v_cfg.min_stake,
    'max_stake', v_cfg.max_stake,
    'fee_pct', 20,
    'payout_mult', 1.6,
    'gate_error', v_gate,
    'balance', COALESCE(v_bal, 0),
    'active_match', public._bs_active_match(v_uid),
    'live_matches', (SELECT count(*) FROM public.battleship_matches WHERE status IN ('placing', 'battle')),
    'rooms', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', r.id, 'username', r.username, 'stake', r.stake, 'created_at', r.created_at, 'mine', r.mine)
               ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM (SELECT m.id, p.username, m.stake, m.created_at, (m.player1 = v_uid) AS mine
              FROM public.battleship_matches m JOIN public.profiles p ON p.id = m.player1
             WHERE m.status = 'waiting' AND NOT m.is_private AND m.deadline > now()
               AND m.p1_seen_at > now() - interval '20 seconds'
             ORDER BY m.created_at DESC LIMIT 30) r),
    'history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', h.id, 'opponent', h.opponent, 'stake', h.stake, 'pot', h.pot, 'status', h.status,
               'result', h.result, 'end_reason', h.end_reason, 'finished_at', h.finished_at)
               ORDER BY h.finished_at DESC), '[]'::jsonb)
      FROM (SELECT m.id, op.username AS opponent, m.stake, m.pot, m.status, m.end_reason, m.finished_at,
                   CASE WHEN m.status = 'cancelled' THEN 'refunded' WHEN m.winner = v_uid THEN 'win' ELSE 'loss' END AS result
              FROM public.battleship_matches m
              LEFT JOIN public.profiles op ON op.id = CASE WHEN m.player1 = v_uid THEN m.player2 ELSE m.player1 END
             WHERE (m.player1 = v_uid OR m.player2 = v_uid) AND m.status IN ('finished', 'cancelled')
             ORDER BY m.finished_at DESC NULLS LAST LIMIT 10) h),
    'recent_wins', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'winner', w.winner, 'loser', w.loser, 'pot', w.pot, 'end_reason', w.end_reason, 'finished_at', w.finished_at)
               ORDER BY w.finished_at DESC), '[]'::jsonb)
      FROM (SELECT pw.username AS winner, pl.username AS loser, m.pot, m.end_reason, m.finished_at
              FROM public.battleship_matches m
              JOIN public.profiles pw ON pw.id = m.winner
              LEFT JOIN public.profiles pl ON pl.id = CASE WHEN m.winner = m.player1 THEN m.player2 ELSE m.player1 END
             WHERE m.status = 'finished'
             ORDER BY m.finished_at DESC LIMIT 8) w),
    'admin', CASE WHEN v_is_admin THEN jsonb_build_object(
      'pool_pending', v_cfg.pool_pending,
      'total_matches', v_cfg.total_matches,
      'total_wagered', v_cfg.total_wagered,
      'total_fees', v_cfg.total_fees,
      'total_paid', v_cfg.total_paid,
      'waiting', (SELECT count(*) FROM public.battleship_matches WHERE status = 'waiting')) ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_lobby() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_lobby() TO authenticated;

-- Crear sala (la apuesta queda retenida)
CREATE OR REPLACE FUNCTION public.battleship_create(p_stake numeric, p_private boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_cfg  public.battleship_config%ROWTYPE;
  v_gate text;
  v_bal  numeric;
  v_last timestamptz;
  v_code text;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_gate := public._casino_games_gate(v_uid);
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_gate);
  END IF;

  SELECT * INTO v_cfg FROM public.battleship_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Batalla Naval esta cerrada temporalmente');
  END IF;

  IF p_stake IS NULL OR p_stake <> round(p_stake, 2) OR p_stake < v_cfg.min_stake OR p_stake > v_cfg.max_stake THEN
    RETURN jsonb_build_object('success', false, 'error',
      'La apuesta debe estar entre ' || v_cfg.min_stake || ' y ' || v_cfg.max_stake || ' TUNG (maximo 2 decimales)');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_bal FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  IF public._bs_active_match(v_uid) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una partida en curso');
  END IF;

  SELECT max(created_at) INTO v_last FROM public.battleship_matches WHERE player1 = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '5 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Espera unos segundos antes de crear otra sala');
  END IF;

  IF v_bal < p_stake THEN
    RETURN jsonb_build_object('success', false, 'error',
      'TUNG insuficiente. Necesitas ' || p_stake || ' TUNG, tienes ' || round(v_bal, 2) || '.');
  END IF;

  IF COALESCE(p_private, false) THEN
    v_code := public._bs_gen_code();
  END IF;

  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance - p_stake WHERE id = v_uid;

  INSERT INTO public.battleship_matches (status, is_private, join_code, stake, player1, deadline, p1_seen_at)
  VALUES ('waiting', COALESCE(p_private, false), v_code, p_stake, v_uid, now() + interval '15 minutes', now())
  RETURNING id INTO v_id;

  INSERT INTO public.battleship_entries (match_id, user_id, stake) VALUES (v_id, v_uid, p_stake);

  RETURN jsonb_build_object('success', true, 'match_id', v_id, 'code', v_code);
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_create(numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_create(numeric, boolean) TO authenticated;

-- Unirse: publica por id o privada por codigo. Aqui empieza la partida y se cobra la comision.
CREATE OR REPLACE FUNCTION public.battleship_join(p_match_id uuid DEFAULT NULL, p_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_fee_rate  constant numeric := 0.20;
  c_pool_rate constant numeric := 0.10;
  c_ref_rate  constant numeric := 0.20;
  v_uid         uuid := auth.uid();
  v_cfg         public.battleship_config%ROWTYPE;
  v_gate        text;
  v_code        text;
  v_mid         uuid;
  m             public.battleship_matches%ROWTYPE;
  v_bal         numeric;
  v_fee         numeric;
  v_pool        numeric;
  v_company     numeric;
  v_pot         numeric;
  v_admin_id    uuid;
  v_p           uuid;
  v_referrer    uuid;
  v_ref_share   numeric;
  v_admin_share numeric;
  v_pending     numeric;
  v_flush       numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_gate := public._casino_games_gate(v_uid);
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_gate);
  END IF;

  SELECT * INTO v_cfg FROM public.battleship_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Batalla Naval esta cerrada temporalmente');
  END IF;

  IF p_code IS NOT NULL AND length(trim(p_code)) > 0 THEN
    v_code := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
    IF length(v_code) <> 6 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Codigo de sala invalido');
    END IF;
    SELECT id INTO v_mid FROM public.battleship_matches WHERE join_code = v_code AND status = 'waiting';
  ELSIF p_match_id IS NOT NULL THEN
    SELECT id INTO v_mid FROM public.battleship_matches WHERE id = p_match_id AND NOT is_private AND status = 'waiting';
  END IF;
  IF v_mid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sala no encontrada o ya no esta disponible');
  END IF;

  -- Orden de bloqueo: partida -> perfiles -> config
  SELECT * INTO m FROM public.battleship_matches WHERE id = v_mid FOR UPDATE;
  IF m.status <> 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La sala ya no esta disponible');
  END IF;
  IF m.player1 = v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes unirte a tu propia sala');
  END IF;
  IF m.deadline <= now() OR m.p1_seen_at < now() - interval '90 seconds' THEN
    PERFORM public._bs_refund_waiting(v_mid, 'expired');
    RETURN jsonb_build_object('success', false, 'error', 'La sala ha expirado');
  END IF;
  IF m.p1_seen_at < now() - interval '20 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El creador de la sala no esta conectado ahora mismo');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_bal FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;
  IF public._bs_active_match(v_uid) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una partida en curso');
  END IF;
  IF v_bal < m.stake THEN
    RETURN jsonb_build_object('success', false, 'error',
      'TUNG insuficiente. Necesitas ' || m.stake || ' TUNG, tienes ' || round(v_bal, 2) || '.');
  END IF;

  v_fee     := m.stake * c_fee_rate;
  v_pool    := m.stake * c_pool_rate;
  v_company := v_fee - v_pool;
  v_pot     := (m.stake - v_fee) * 2;

  PERFORM public._internal_set_fxu_context();

  -- Apuesta del retador
  UPDATE public.profiles SET fxu_balance = fxu_balance - m.stake WHERE id = v_uid;
  INSERT INTO public.battleship_entries (match_id, user_id, stake) VALUES (v_mid, v_uid, m.stake);

  SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;

  -- Comision de cada jugador: empresa + referido de ESE jugador
  FOREACH v_p IN ARRAY ARRAY[m.player1, v_uid] LOOP
    v_referrer := NULL;
    SELECT p.referred_by INTO v_referrer FROM public.profiles p WHERE p.id = v_p;
    IF v_referrer IS NOT NULL AND v_referrer <> v_p
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_referrer) THEN
      v_ref_share := round(v_company * c_ref_rate, 8);
    ELSE
      v_referrer := NULL;
      v_ref_share := 0;
    END IF;
    v_admin_share := v_company - v_ref_share;

    IF v_admin_share > 0 AND v_admin_id IS NOT NULL THEN
      UPDATE public.profiles SET fxu_balance = fxu_balance + v_admin_share WHERE id = v_admin_id;
    END IF;

    IF v_referrer IS NOT NULL AND v_ref_share > 0 THEN
      UPDATE public.profiles SET fxu_balance = fxu_balance + v_ref_share WHERE id = v_referrer;
      INSERT INTO public.referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
      VALUES (v_referrer, v_p, NULL, 'casino_battleship_referral', v_ref_share);
    END IF;

    UPDATE public.battleship_entries
       SET fee = v_fee, pool_share = v_pool, company_share = v_admin_share,
           referrer_id = v_referrer, referrer_share = v_ref_share
     WHERE match_id = v_mid AND user_id = v_p;

    IF v_admin_share > 0 THEN
      PERFORM public.record_admin_revenue('casino_battleship', v_admin_share,
        'Batalla Naval: comision de partida', v_p, v_mid);
    END IF;
  END LOOP;

  -- Pools del jackpot: se acumula y se envia en multiplos de 10
  SELECT * INTO v_cfg FROM public.battleship_config WHERE id = 1 FOR UPDATE;
  v_pending := v_cfg.pool_pending + v_pool * 2;
  v_flush := floor(v_pending / 10) * 10;
  IF v_flush > 0 THEN
    PERFORM public.contribute_to_jackpot(v_flush, 'casino_battleship', v_uid);
    v_pending := v_pending - v_flush;
  END IF;
  UPDATE public.battleship_config
     SET pool_pending  = v_pending,
         total_matches = total_matches + 1,
         total_wagered = total_wagered + m.stake * 2,
         total_fees    = total_fees + v_fee * 2,
         updated_at    = now()
   WHERE id = 1;

  UPDATE public.battleship_matches
     SET player2 = v_uid, status = 'placing', pot = v_pot,
         deadline = now() + interval '90 seconds', started_at = now(),
         version = version + 1, updated_at = now()
   WHERE id = v_mid;

  RETURN jsonb_build_object('success', true, 'match_id', v_mid);
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_join(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_join(uuid, text) TO authenticated;

-- Cancelar sala propia que aun no empezo (devolucion completa)
CREATE OR REPLACE FUNCTION public.battleship_cancel(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  m     public.battleship_matches%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.player1 <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sala no encontrada');
  END IF;
  IF m.status <> 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La partida ya empezo y no se puede cancelar');
  END IF;
  PERFORM public._bs_refund_waiting(p_match_id, 'cancelled');
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_cancel(uuid) TO authenticated;

-- Desplegar flota
CREATE OR REPLACE FUNCTION public.battleship_place(p_match_id uuid, p_ships jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  m     public.battleship_matches%ROWTYPE;
  v_b   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR (m.player1 <> v_uid AND m.player2 IS DISTINCT FROM v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Partida no encontrada');
  END IF;
  IF m.status = 'placing' AND m.deadline <= now() THEN
    PERFORM public._bs_resolve(p_match_id);
    SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id;
  END IF;
  IF m.status <> 'placing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La fase de despliegue ha terminado');
  END IF;
  IF EXISTS (SELECT 1 FROM public.battleship_boards WHERE match_id = p_match_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya desplegaste tu flota');
  END IF;

  v_b := public._bs_build_board(p_ships);
  IF v_b IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Despliegue invalido: coloca las 5 naves dentro del tablero sin solaparse');
  END IF;

  INSERT INTO public.battleship_boards (match_id, user_id, ships, cells, auto_placed)
  VALUES (p_match_id, v_uid, v_b -> 'ships', ARRAY(SELECT c::integer FROM jsonb_array_elements_text(v_b -> 'cells') c), false);

  UPDATE public.battleship_matches
     SET p1_ready = p1_ready OR player1 = v_uid,
         p2_ready = p2_ready OR player2 = v_uid,
         version = version + 1, updated_at = now()
   WHERE id = p_match_id
  RETURNING * INTO m;

  IF m.p1_ready AND m.p2_ready THEN
    PERFORM public._bs_start_battle(p_match_id);
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_place(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_place(uuid, jsonb) TO authenticated;

-- Disparar (cell = fila*10 + columna)
CREATE OR REPLACE FUNCTION public.battleship_fire(p_match_id uuid, p_cell integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  m     public.battleship_matches%ROWTYPE;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR (m.player1 <> v_uid AND m.player2 IS DISTINCT FROM v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Partida no encontrada');
  END IF;
  IF m.status = 'battle' AND m.deadline <= now() THEN
    PERFORM public._bs_resolve(p_match_id);
    SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id;
  END IF;
  IF m.status <> 'battle' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La partida no esta en combate');
  END IF;
  IF m.turn <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'No es tu turno');
  END IF;
  IF p_cell IS NULL OR p_cell < 0 OR p_cell > 99 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Casilla invalida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.battleship_shots WHERE match_id = p_match_id AND shooter = v_uid AND cell = p_cell) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya disparaste a esa casilla');
  END IF;

  v_res := public._bs_apply_shot(p_match_id, v_uid, p_cell, false);
  RETURN v_res || jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_fire(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_fire(uuid, integer) TO authenticated;

-- Rendirse (el rival gana el bote)
CREATE OR REPLACE FUNCTION public.battleship_surrender(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  m     public.battleship_matches%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR (m.player1 <> v_uid AND m.player2 IS DISTINCT FROM v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Partida no encontrada');
  END IF;
  IF m.status NOT IN ('placing', 'battle') THEN
    RETURN jsonb_build_object('success', false, 'error', 'La partida no esta en curso');
  END IF;
  PERFORM public._bs_settle(p_match_id, CASE WHEN m.player1 = v_uid THEN m.player2 ELSE m.player1 END, 'surrender');
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_surrender(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_surrender(uuid) TO authenticated;

-- Estado de la partida para un participante (nunca expone naves rivales no hundidas)
CREATE OR REPLACE FUNCTION public.battleship_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  m     public.battleship_matches%ROWTYPE;
  v_me  integer;
  v_opp uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id;
  IF NOT FOUND OR (m.player1 <> v_uid AND m.player2 IS DISTINCT FROM v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Partida no encontrada');
  END IF;

  IF m.status = 'waiting' AND m.player1 = v_uid THEN
    UPDATE public.battleship_matches SET p1_seen_at = now() WHERE id = p_match_id AND status = 'waiting';
  ELSIF (m.status IN ('placing', 'battle') AND m.deadline <= now())
     OR (m.status = 'waiting' AND m.deadline <= now()) THEN
    PERFORM public._bs_resolve(p_match_id);
  END IF;
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id;

  v_me  := CASE WHEN m.player1 = v_uid THEN 1 ELSE 2 END;
  v_opp := CASE WHEN v_me = 1 THEN m.player2 ELSE m.player1 END;

  RETURN jsonb_build_object(
    'success', true,
    'id', m.id,
    'status', m.status,
    'is_private', m.is_private,
    'code', CASE WHEN v_me = 1 AND m.status = 'waiting' THEN m.join_code ELSE NULL END,
    'stake', m.stake,
    'pot', CASE WHEN m.pot > 0 THEN m.pot ELSE m.stake * 1.6 END,
    'me', v_me,
    'my_name', (SELECT username FROM public.profiles WHERE id = v_uid),
    'opp_name', (SELECT username FROM public.profiles WHERE id = v_opp),
    'my_ready', EXISTS (SELECT 1 FROM public.battleship_boards WHERE match_id = m.id AND user_id = v_uid),
    'opp_ready', (v_opp IS NOT NULL AND EXISTS (SELECT 1 FROM public.battleship_boards WHERE match_id = m.id AND user_id = v_opp)),
    'my_turn', (m.status = 'battle' AND m.turn = v_uid),
    'deadline', m.deadline,
    'server_time', now(),
    'my_timeouts', CASE WHEN v_me = 1 THEN m.p1_timeouts ELSE m.p2_timeouts END,
    'opp_timeouts', CASE WHEN v_me = 1 THEN m.p2_timeouts ELSE m.p1_timeouts END,
    'my_hits', CASE WHEN v_me = 1 THEN m.p1_hits ELSE m.p2_hits END,
    'opp_hits', CASE WHEN v_me = 1 THEN m.p2_hits ELSE m.p1_hits END,
    'my_fleet', (SELECT ships FROM public.battleship_boards WHERE match_id = m.id AND user_id = v_uid),
    'my_shots', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'cell', s.cell, 'hit', s.hit, 'sunk', s.sunk, 'auto', s.auto) ORDER BY s.id), '[]'::jsonb)
                   FROM public.battleship_shots s WHERE s.match_id = m.id AND s.shooter = v_uid),
    'opp_shots', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'cell', s.cell, 'hit', s.hit, 'sunk', s.sunk, 'auto', s.auto) ORDER BY s.id), '[]'::jsonb)
                    FROM public.battleship_shots s WHERE s.match_id = m.id AND s.shooter = v_opp),
    'opp_sunk', (SELECT COALESCE(jsonb_agg(sh), '[]'::jsonb)
                   FROM public.battleship_boards b, jsonb_array_elements(b.ships) sh
                  WHERE b.match_id = m.id AND b.user_id = v_opp
                    AND (sh ->> 'code') IN (SELECT s.sunk FROM public.battleship_shots s
                                             WHERE s.match_id = m.id AND s.shooter = v_uid AND s.sunk IS NOT NULL)),
    'opp_fleet', CASE WHEN m.status = 'finished'
                      THEN (SELECT ships FROM public.battleship_boards WHERE match_id = m.id AND user_id = v_opp)
                      ELSE NULL END,
    'winner', CASE WHEN m.winner IS NULL THEN NULL WHEN m.winner = v_uid THEN 'me' ELSE 'opp' END,
    'end_reason', m.end_reason,
    'payout', m.payout,
    'version', m.version
  );
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_state(uuid) TO authenticated;

-- Administracion (solo is_admin)
CREATE OR REPLACE FUNCTION public.battleship_admin(p_action text, p_value numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cfg public.battleship_config%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_admin = true) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_cfg FROM public.battleship_config WHERE id = 1 FOR UPDATE;

  IF p_action IN ('enable', 'disable') THEN
    UPDATE public.battleship_config SET enabled = (p_action = 'enable'), updated_at = now() WHERE id = 1;
  ELSIF p_action = 'set_max' THEN
    IF p_value IS NULL OR p_value <> round(p_value, 2) OR p_value < v_cfg.min_stake OR p_value > 1000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Maximo invalido');
    END IF;
    UPDATE public.battleship_config SET max_stake = p_value, updated_at = now() WHERE id = 1;
  ELSIF p_action = 'set_min' THEN
    IF p_value IS NULL OR p_value <> round(p_value, 2) OR p_value < 0.10 OR p_value > v_cfg.max_stake THEN
      RETURN jsonb_build_object('success', false, 'error', 'Minimo invalido (desde 0.10)');
    END IF;
    UPDATE public.battleship_config SET min_stake = p_value, updated_at = now() WHERE id = 1;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Accion invalida');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_admin(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_admin(text, numeric) TO authenticated;

-- 6) Tick del servidor: resuelve plazos aunque nadie este mirando
CREATE OR REPLACE FUNCTION public.battleship_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_n  integer := 0;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  FOR v_id IN
    SELECT id FROM public.battleship_matches
     WHERE (status IN ('placing', 'battle') AND deadline <= now())
        OR (status = 'waiting' AND (deadline <= now() OR p1_seen_at < now() - interval '90 seconds'))
     ORDER BY deadline
     LIMIT 100
  LOOP
    BEGIN
      IF public._bs_resolve(v_id) THEN
        v_n := v_n + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'battleship_tick %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_tick() FROM PUBLIC, anon, authenticated;

DO $mig$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'battleship-tick';
  PERFORM cron.schedule('battleship-tick', '10 seconds', 'SELECT public.battleship_tick()');
END
$mig$;

COMMIT;

-- Validacion sin bloquear escrituras (la lista nueva es superconjunto de la anterior)
ALTER TABLE public.admin_revenue VALIDATE CONSTRAINT admin_revenue_revenue_type_check;

NOTIFY pgrst, 'reload schema';
