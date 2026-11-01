-- [SPORTS1] Apuestas Deportivas de futbol (1X2) en el planeta 3:250:4, en TUNG.
--   * Sistema de apuestas mutuas (parimutuel): la casa NO arriesga dinero. Todo lo apostado
--     a un partido forma el bote; los que aciertan se lo reparten en proporcion a lo apostado.
--   * Mercado 1X2 sobre los 90 minutos reglamentarios (+ descuento). Prorroga y penaltis no cuentan.
--   * Comision 20% (igual que la ruleta), cobrada al liquidar: 10% -> pools del jackpot,
--     10% -> empresa. Del tramo empresa, 20% al referido del apostante; el resto es ingreso
--     de empresa (record_admin_revenue 'sports_football' -> dashboard + accionistas).
--     La comision nunca supera el dinero de los perdedores: quien acierta jamas cobra menos
--     de lo que aposto. Si nadie acierta, se devuelve lo apostado menos la comision.
--   * Partido cancelado / aplazado / sin resultado oficial -> devolucion del 100%.
--   * Datos: football-data.org v4 (PL, LaLiga, Serie A, Bundesliga, Ligue 1, Champions),
--     consultado desde la BD con pg_net cada pocos minutos por pg_cron. El token solo se
--     guarda en la BD y nunca se devuelve al cliente.
--   * Tablas con RLS y sin privilegios para anon/authenticated. Todo via RPC con auth.uid().
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM public.planets WHERE galaxy = 3 AND solar_system = 250 AND position = 4) THEN
    RAISE EXCEPTION '3:250:4 ocupado, abortado';
  END IF;
END
$mig$;

-- 1) Nuevo tipo de ingreso (lista actual + 'sports_football'); se valida fuera de la transaccion
ALTER TABLE public.admin_revenue DROP CONSTRAINT admin_revenue_revenue_type_check;
ALTER TABLE public.admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check CHECK (revenue_type = ANY (ARRAY[
  'market_fee','withdrawal_fee','instant_build','instant_research','instant_ship','referral_bonus',
  'officer_fxu','expedition_fee','supply_box','fleet_acceleration','swap_fee','transfer_fee',
  'plus_subscription','colony_abandon','planet_rename','alliance_rename','alliance_creation',
  'lottery_fee','p2p_fee','blueprint_sale','hero_respec','hero_kit_sale','other','premium_mission',
  'hero_duel','daily_streak','deposit_gas_buffer','instant_unit_sale','casino_roulette','casino_slots',
  'casino_dice','casino_battleship','sports_football'
]::text[])) NOT VALID;

-- 2) Coordenada reservada 3:250:4
CREATE OR REPLACE FUNCTION public._sports_is_location(p_galaxy integer, p_system integer, p_position integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_galaxy = 3 AND p_system = 250 AND p_position = 4;
$$;
REVOKE ALL ON FUNCTION public._sports_is_location(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._sports_is_location(integer, integer, integer) TO authenticated;

DO $mig$
DECLARE
  v_def    text;
  v_new    text;
  v_anchor text;
BEGIN
  v_def := replace(pg_get_functiondef('public.secure_send_fleet'::regproc), E'\r', '');
  IF position('_sports_is_location' IN v_def) = 0 THEN
    v_anchor := '-- [CASINO1] El Casino Galactico solo admite la Nave Heroe (hero_casino_travel)';
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) <> length(v_anchor) THEN
      RAISE EXCEPTION 'ancla secure_send_fleet no encontrada o repetida';
    END IF;
    v_new := replace(v_def, v_anchor,
      '-- [SPORTS1] 3:250:4 reservada para las Apuestas Deportivas' || E'\n' ||
      '  IF public._sports_is_location(p_target_galaxy, p_target_system, p_target_position) THEN' || E'\n' ||
      '    RETURN jsonb_build_object(''success'', false, ''error'', ''Coordenada reservada para las Apuestas Deportivas'');' || E'\n' ||
      '  END IF;' || E'\n\n  ' || v_anchor);
    EXECUTE v_new;
  END IF;

  v_def := replace(pg_get_functiondef('public.process_fleet_arrival'::regproc), E'\r', '');
  IF position('_sports_is_location' IN v_def) = 0 THEN
    v_anchor := 'has_colony_ship := COALESCE(v_colony_ship_quantity, 0) > 0;';
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) <> length(v_anchor) THEN
      RAISE EXCEPTION 'ancla process_fleet_arrival no encontrada o repetida';
    END IF;
    v_new := replace(v_def, v_anchor, v_anchor ||
      ' IF public._sports_is_location(fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position) THEN has_colony_ship := false; END IF; /* [SPORTS1] */');
    EXECUTE v_new;
  END IF;
END
$mig$;

-- Defensivo (igual que el Casino): nadie puede crear/mover un planeta a esa coordenada
CREATE OR REPLACE FUNCTION public._trg_planets_block_sports()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public._sports_is_location(NEW.galaxy, NEW.solar_system, NEW.position) THEN
    RAISE EXCEPTION 'Coordenada reservada para las Apuestas Deportivas';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._trg_planets_block_sports() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_planets_block_sports ON public.planets;
CREATE TRIGGER trg_planets_block_sports
  BEFORE INSERT OR UPDATE OF galaxy, solar_system, position ON public.planets
  FOR EACH ROW EXECUTE FUNCTION public._trg_planets_block_sports();

-- 3) Tablas (solo accesibles via RPC)
CREATE TABLE IF NOT EXISTS public.sports_config (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled               boolean NOT NULL DEFAULT true,
  api_token             text,
  competitions          text[]  NOT NULL DEFAULT ARRAY['PL','PD','SA','BL1','FL1','CL']::text[],
  min_bet               numeric NOT NULL DEFAULT 1 CHECK (min_bet >= 1),
  max_bet               numeric NOT NULL DEFAULT 1000000 CHECK (max_bet >= min_bet),
  max_per_match         numeric NOT NULL DEFAULT 5000000 CHECK (max_per_match >= max_bet),
  close_minutes         integer NOT NULL DEFAULT 5 CHECK (close_minutes BETWEEN 0 AND 120),
  sync_interval_minutes integer NOT NULL DEFAULT 3 CHECK (sync_interval_minutes BETWEEN 1 AND 60),
  pool_pending          numeric NOT NULL DEFAULT 0 CHECK (pool_pending >= 0),
  pending_request_id    bigint,
  last_request_at       timestamptz,
  force_sync            boolean NOT NULL DEFAULT false,
  last_sync_at          timestamptz,
  last_sync_status      integer,
  last_sync_error       text,
  last_sync_count       integer,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sports_matches (
  id                 bigint PRIMARY KEY,          -- id del partido en football-data.org
  competition_code   text NOT NULL,
  competition_name   text NOT NULL,
  competition_emblem text,
  matchday           integer,
  stage              text,
  home_name          text NOT NULL,
  home_short         text,
  home_tla           text,
  home_crest         text,
  away_name          text NOT NULL,
  away_short         text,
  away_tla           text,
  away_crest         text,
  kickoff            timestamptz NOT NULL,
  first_kickoff      timestamptz NOT NULL,
  api_status         text NOT NULL,
  duration           text,
  live_home          integer,                     -- marcador mostrado (fullTime del proveedor)
  live_away          integer,
  score_home         integer,                     -- marcador a los 90 minutos (para liquidar)
  score_away         integer,
  result             text CHECK (result IN ('H','D','A')),
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed','settled','void')),
  pool_home          numeric NOT NULL DEFAULT 0 CHECK (pool_home >= 0),
  pool_draw          numeric NOT NULL DEFAULT 0 CHECK (pool_draw >= 0),
  pool_away          numeric NOT NULL DEFAULT 0 CHECK (pool_away >= 0),
  bettors            integer NOT NULL DEFAULT 0,
  bets_count         integer NOT NULL DEFAULT 0,
  fee_total          numeric NOT NULL DEFAULT 0,
  paid_total         numeric NOT NULL DEFAULT 0,
  void_reason        text,
  last_error         text,
  settled_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sports_matches_state_kickoff_idx ON public.sports_matches (state, kickoff);
CREATE INDEX IF NOT EXISTS sports_matches_settled_idx ON public.sports_matches (settled_at DESC) WHERE settled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sports_bets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id       bigint NOT NULL REFERENCES public.sports_matches(id) ON DELETE RESTRICT,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pick           text NOT NULL CHECK (pick IN ('H','D','A')),
  amount         numeric NOT NULL CHECK (amount > 0),
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','refunded')),
  payout         numeric NOT NULL DEFAULT 0 CHECK (payout >= 0),
  fee            numeric NOT NULL DEFAULT 0 CHECK (fee >= 0),
  pool_share     numeric NOT NULL DEFAULT 0,
  company_share  numeric NOT NULL DEFAULT 0,
  referrer_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  referrer_share numeric NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  settled_at     timestamptz
);
CREATE INDEX IF NOT EXISTS sports_bets_match_idx ON public.sports_bets (match_id, status);
CREATE INDEX IF NOT EXISTS sports_bets_user_idx ON public.sports_bets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sports_bets_open_idx ON public.sports_bets (status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS sports_bets_wins_idx ON public.sports_bets (settled_at DESC) WHERE status = 'won';

ALTER TABLE public.sports_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_bets    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sports_config, public.sports_matches, public.sports_bets FROM PUBLIC, anon, authenticated, authenticator;

INSERT INTO public.sports_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4) Ingesta de la respuesta de football-data.org (/v4/matches)
CREATE OR REPLACE FUNCTION public._sports_ingest(p_data jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comps  text[];
  v_close  integer;
  m        jsonb;
  v_n      integer := 0;
  v_id     bigint;
  v_code   text;
  v_status text;
  v_kick   timestamptz;
  v_dur    text;
  v_ft_h   integer;
  v_ft_a   integer;
  v_rt_h   integer;
  v_rt_a   integer;
  v_hname  text;
  v_aname  text;
BEGIN
  SELECT competitions, close_minutes INTO v_comps, v_close FROM public.sports_config WHERE id = 1;
  IF p_data IS NULL OR jsonb_typeof(p_data -> 'matches') IS DISTINCT FROM 'array' THEN
    RETURN 0;
  END IF;

  FOR m IN SELECT value FROM jsonb_array_elements(p_data -> 'matches') LOOP
    BEGIN
      v_id     := (m ->> 'id')::bigint;
      v_code   := m -> 'competition' ->> 'code';
      v_status := upper(m ->> 'status');
      v_kick   := (m ->> 'utcDate')::timestamptz;
      v_hname  := left(btrim(m -> 'homeTeam' ->> 'name'), 80);
      v_aname  := left(btrim(m -> 'awayTeam' ->> 'name'), 80);
      CONTINUE WHEN v_id IS NULL OR v_code IS NULL OR NOT (v_code = ANY (v_comps))
                 OR v_kick IS NULL OR v_status IS NULL
                 OR COALESCE(v_hname, '') = '' OR COALESCE(v_aname, '') = '';

      v_dur  := upper(COALESCE(m -> 'score' ->> 'duration', 'REGULAR'));
      v_ft_h := (m -> 'score' -> 'fullTime' ->> 'home')::integer;
      v_ft_a := (m -> 'score' -> 'fullTime' ->> 'away')::integer;
      IF v_dur = 'REGULAR' THEN
        v_rt_h := v_ft_h;
        v_rt_a := v_ft_a;
      ELSE
        -- Con prorroga/penaltis solo vale el marcador de los 90'. Si no viene, se anula.
        v_rt_h := (m -> 'score' -> 'regularTime' ->> 'home')::integer;
        v_rt_a := (m -> 'score' -> 'regularTime' ->> 'away')::integer;
      END IF;

      INSERT INTO public.sports_matches AS sm (
        id, competition_code, competition_name, competition_emblem, matchday, stage,
        home_name, home_short, home_tla, home_crest, away_name, away_short, away_tla, away_crest,
        kickoff, first_kickoff, api_status, duration, live_home, live_away, score_home, score_away, state)
      VALUES (
        v_id, v_code,
        left(COALESCE(m -> 'competition' ->> 'name', v_code), 60),
        CASE WHEN (m -> 'competition' ->> 'emblem') ~ '^https://[A-Za-z0-9./_%-]+$' THEN left(m -> 'competition' ->> 'emblem', 300) END,
        (m ->> 'matchday')::integer,
        left(m ->> 'stage', 40),
        v_hname, left(m -> 'homeTeam' ->> 'shortName', 40), left(m -> 'homeTeam' ->> 'tla', 5),
        CASE WHEN (m -> 'homeTeam' ->> 'crest') ~ '^https://[A-Za-z0-9./_%-]+$' THEN left(m -> 'homeTeam' ->> 'crest', 300) END,
        v_aname, left(m -> 'awayTeam' ->> 'shortName', 40), left(m -> 'awayTeam' ->> 'tla', 5),
        CASE WHEN (m -> 'awayTeam' ->> 'crest') ~ '^https://[A-Za-z0-9./_%-]+$' THEN left(m -> 'awayTeam' ->> 'crest', 300) END,
        v_kick, v_kick, v_status, v_dur, v_ft_h, v_ft_a, v_rt_h, v_rt_a,
        CASE WHEN v_status IN ('SCHEDULED','TIMED') AND v_kick > now() + make_interval(mins => v_close) THEN 'open' ELSE 'closed' END)
      ON CONFLICT (id) DO UPDATE SET
        competition_name   = EXCLUDED.competition_name,
        competition_emblem = COALESCE(EXCLUDED.competition_emblem, sm.competition_emblem),
        matchday           = EXCLUDED.matchday,
        stage              = EXCLUDED.stage,
        home_name          = EXCLUDED.home_name,
        home_short         = EXCLUDED.home_short,
        home_tla           = EXCLUDED.home_tla,
        home_crest         = COALESCE(EXCLUDED.home_crest, sm.home_crest),
        away_name          = EXCLUDED.away_name,
        away_short         = EXCLUDED.away_short,
        away_tla           = EXCLUDED.away_tla,
        away_crest         = COALESCE(EXCLUDED.away_crest, sm.away_crest),
        kickoff            = EXCLUDED.kickoff,
        first_kickoff      = CASE WHEN sm.bets_count = 0 AND sm.state IN ('open','closed') THEN EXCLUDED.kickoff ELSE sm.first_kickoff END,
        api_status         = EXCLUDED.api_status,
        duration           = EXCLUDED.duration,
        live_home          = EXCLUDED.live_home,
        live_away          = EXCLUDED.live_away,
        score_home         = CASE WHEN sm.state IN ('open','closed') THEN EXCLUDED.score_home ELSE sm.score_home END,
        score_away         = CASE WHEN sm.state IN ('open','closed') THEN EXCLUDED.score_away ELSE sm.score_away END,
        updated_at         = now()
      WHERE (sm.api_status, sm.kickoff, sm.duration, sm.live_home, sm.live_away, sm.score_home, sm.score_away,
             sm.home_name, sm.away_name, sm.home_crest, sm.away_crest, sm.home_short, sm.away_short,
             sm.competition_name, sm.matchday, sm.stage)
        IS DISTINCT FROM
            (EXCLUDED.api_status, EXCLUDED.kickoff, EXCLUDED.duration, EXCLUDED.live_home, EXCLUDED.live_away,
             EXCLUDED.score_home, EXCLUDED.score_away, EXCLUDED.home_name, EXCLUDED.away_name,
             COALESCE(EXCLUDED.home_crest, sm.home_crest), COALESCE(EXCLUDED.away_crest, sm.away_crest),
             EXCLUDED.home_short, EXCLUDED.away_short, EXCLUDED.competition_name, EXCLUDED.matchday, EXCLUDED.stage);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[SPORTS1] partido ignorado (%): %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public._sports_ingest(jsonb) FROM PUBLIC, anon, authenticated;

-- 5) Anulacion: devuelve el 100% a todos
CREATE OR REPLACE FUNCTION public._sports_void(p_match_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m        public.sports_matches%ROWTYPE;
  v_total  numeric;
  v_n      integer;
BEGIN
  SELECT * INTO m FROM public.sports_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.state NOT IN ('open','closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'El partido ya esta cerrado');
  END IF;

  SELECT COALESCE(sum(amount), 0), count(*) INTO v_total, v_n
    FROM public.sports_bets WHERE match_id = p_match_id AND status = 'open';

  IF v_n > 0 THEN
    PERFORM 1 FROM public.profiles
     WHERE id IN (SELECT user_id FROM public.sports_bets WHERE match_id = p_match_id AND status = 'open')
     ORDER BY id FOR UPDATE;

    PERFORM public._internal_set_fxu_context();
    UPDATE public.profiles p SET fxu_balance = p.fxu_balance + x.s
      FROM (SELECT user_id, sum(amount) s FROM public.sports_bets
             WHERE match_id = p_match_id AND status = 'open' GROUP BY user_id) x
     WHERE p.id = x.user_id;

    INSERT INTO public.messages (recipient_id, sender_id, subject, body, message_type)
    SELECT x.user_id, NULL,
           'Apuesta devuelta: ' || m.home_name || ' vs ' || m.away_name,
           'Partido anulado (' || COALESCE(p_reason, 'sin resultado oficial') || '). Se te han devuelto '
             || round(x.s, 2)::text || ' TUNG (100% de lo apostado, sin comision).',
           'system'
      FROM (SELECT user_id, sum(amount) s FROM public.sports_bets
             WHERE match_id = p_match_id AND status = 'open' GROUP BY user_id) x;

    UPDATE public.sports_bets
       SET status = 'refunded', payout = amount, fee = 0, pool_share = 0, company_share = 0,
           referrer_share = 0, settled_at = now()
     WHERE match_id = p_match_id AND status = 'open';
  END IF;

  UPDATE public.sports_matches
     SET state = 'void', void_reason = left(COALESCE(p_reason, 'Sin resultado oficial'), 120),
         paid_total = v_total, fee_total = 0, settled_at = now(), last_error = NULL, updated_at = now()
   WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_total, 'bets', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public._sports_void(bigint, text) FROM PUBLIC, anon, authenticated;

-- 6) Liquidacion parimutuel
CREATE OR REPLACE FUNCTION public._sports_settle(p_match_id bigint, p_result text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_fee_rate  constant numeric := 0.20;
  c_ref_rate  constant numeric := 0.20;  -- del tramo empresa
  m           public.sports_matches%ROWTYPE;
  v_T         numeric;
  v_W         numeric;
  v_L         numeric;
  v_n         integer;
  v_fee       numeric := 0;
  v_paid      numeric := 0;
  v_fee_sum   numeric := 0;
  v_pool      numeric := 0;
  v_admin     numeric := 0;
  v_ref       numeric := 0;
  v_dust      numeric;
  v_pending   numeric;
  v_flush     numeric;
  v_admin_id  uuid;
  v_title     text;
  v_res_txt   text;
BEGIN
  IF p_result IS NULL OR p_result NOT IN ('H','D','A') THEN
    RAISE EXCEPTION 'Resultado invalido';
  END IF;

  SELECT * INTO m FROM public.sports_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.state NOT IN ('open','closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'El partido ya esta cerrado');
  END IF;

  v_title := m.home_name || ' vs ' || m.away_name;
  v_res_txt := CASE
    WHEN m.score_home IS NOT NULL AND m.score_away IS NOT NULL
      THEN m.home_name || ' ' || m.score_home || '-' || m.score_away || ' ' || m.away_name || ' (90 min)'
    ELSE 'Resultado: ' || CASE p_result WHEN 'H' THEN 'gana ' || m.home_name WHEN 'A' THEN 'gana ' || m.away_name ELSE 'empate' END
  END;

  SELECT COALESCE(sum(amount), 0), COALESCE(sum(amount) FILTER (WHERE pick = p_result), 0), count(*)
    INTO v_T, v_W, v_n
    FROM public.sports_bets WHERE match_id = p_match_id AND status = 'open';
  v_L := v_T - v_W;

  IF v_n > 0 THEN
    -- Comision del 20% del bote, sin superar nunca el dinero de los perdedores
    v_fee := CASE WHEN v_W > 0 THEN least(round(v_T * c_fee_rate, 8), v_L) ELSE round(v_T * c_fee_rate, 8) END;

    WITH calc AS (
      SELECT b.id, b.amount, b.pick, b.user_id,
             trunc(b.amount * v_fee / v_T, 8) AS fee_i,
             CASE WHEN pr.referred_by IS NOT NULL AND pr.referred_by <> b.user_id
                       AND EXISTS (SELECT 1 FROM public.profiles r WHERE r.id = pr.referred_by)
                  THEN pr.referred_by END AS ref
        FROM public.sports_bets b
        JOIN public.profiles pr ON pr.id = b.user_id
       WHERE b.match_id = p_match_id AND b.status = 'open'
    ), c2 AS (
      SELECT calc.*,
             trunc(fee_i / 2, 8)               AS pool_i,
             fee_i - trunc(fee_i / 2, 8)       AS company_i
        FROM calc
    ), c3 AS (
      SELECT c2.*,
             CASE WHEN ref IS NOT NULL THEN trunc(company_i * c_ref_rate, 8) ELSE 0 END AS ref_i
        FROM c2
    )
    UPDATE public.sports_bets b SET
      status = CASE WHEN v_W = 0 THEN 'refunded' WHEN c3.pick = p_result THEN 'won' ELSE 'lost' END,
      payout = CASE WHEN v_W = 0 THEN c3.amount - c3.fee_i
                    WHEN c3.pick = p_result THEN c3.amount + trunc((v_L - v_fee) * c3.amount / v_W, 8)
                    ELSE 0 END,
      fee            = c3.fee_i,
      pool_share     = c3.pool_i,
      referrer_id    = c3.ref,
      referrer_share = c3.ref_i,
      company_share  = c3.company_i - c3.ref_i,
      settled_at     = now()
      FROM c3
     WHERE b.id = c3.id;

    SELECT COALESCE(sum(payout), 0), COALESCE(sum(fee), 0), COALESCE(sum(pool_share), 0),
           COALESCE(sum(company_share), 0), COALESCE(sum(referrer_share), 0)
      INTO v_paid, v_fee_sum, v_pool, v_admin, v_ref
      FROM public.sports_bets WHERE match_id = p_match_id;

    SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;

    -- Bloqueo de perfiles en orden fijo (evita interbloqueos)
    PERFORM 1 FROM public.profiles
     WHERE id IN (SELECT user_id FROM public.sports_bets WHERE match_id = p_match_id AND payout > 0
                  UNION SELECT referrer_id FROM public.sports_bets WHERE match_id = p_match_id AND referrer_share > 0
                  UNION SELECT v_admin_id)
     ORDER BY id FOR UPDATE;

    PERFORM public._internal_set_fxu_context();

    -- Apostantes
    UPDATE public.profiles p SET fxu_balance = p.fxu_balance + x.s
      FROM (SELECT user_id, sum(payout) s FROM public.sports_bets
             WHERE match_id = p_match_id AND payout > 0 GROUP BY user_id) x
     WHERE p.id = x.user_id;

    -- Referidos (20% del tramo empresa de cada apostante)
    UPDATE public.profiles p SET fxu_balance = p.fxu_balance + x.s
      FROM (SELECT referrer_id, sum(referrer_share) s FROM public.sports_bets
             WHERE match_id = p_match_id AND referrer_share > 0 GROUP BY referrer_id) x
     WHERE p.id = x.referrer_id;

    INSERT INTO public.referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    SELECT referrer_id, user_id, NULL, 'sports_football_referral', sum(referrer_share)
      FROM public.sports_bets
     WHERE match_id = p_match_id AND referrer_share > 0 AND referrer_id IS NOT NULL
     GROUP BY referrer_id, user_id;

    -- Empresa (billetera admin, igual que el resto del juego) + ledger/accionistas
    IF v_admin > 0 THEN
      IF v_admin_id IS NOT NULL THEN
        UPDATE public.profiles SET fxu_balance = fxu_balance + v_admin WHERE id = v_admin_id;
      END IF;
      PERFORM public.record_admin_revenue('sports_football', v_admin,
        left('Apuestas futbol: ' || v_title, 200), NULL, NULL);
    END IF;

    -- Pools del jackpot (+ restos de redondeo): se envia en multiplos de 10
    v_dust := greatest(v_T - v_paid - v_fee_sum, 0);
    SELECT pool_pending INTO v_pending FROM public.sports_config WHERE id = 1 FOR UPDATE;
    v_pending := COALESCE(v_pending, 0) + v_pool + v_dust;
    v_flush := floor(v_pending / 10) * 10;
    IF v_flush > 0 THEN
      PERFORM public.contribute_to_jackpot(v_flush, 'sports_football', NULL);
      v_pending := v_pending - v_flush;
    END IF;
    UPDATE public.sports_config SET pool_pending = v_pending, updated_at = now() WHERE id = 1;

    -- Aviso a cada apostante
    INSERT INTO public.messages (recipient_id, sender_id, subject, body, message_type)
    SELECT x.user_id, NULL,
           CASE WHEN x.won THEN 'Apuesta ganada: ' WHEN v_W = 0 THEN 'Apuesta devuelta: ' ELSE 'Apuesta perdida: ' END || v_title,
           v_res_txt || '. Apostaste ' || round(x.staked, 2)::text || ' TUNG'
             || CASE WHEN x.paid > 0 THEN ' y cobras ' || round(x.paid, 2)::text || ' TUNG.' ELSE '.' END
             || CASE WHEN v_W = 0 THEN ' Nadie acerto el resultado: se devuelve lo apostado menos la comision.' ELSE '' END,
           'system'
      FROM (SELECT user_id, sum(amount) staked, sum(payout) paid, bool_or(status = 'won') won
              FROM public.sports_bets WHERE match_id = p_match_id GROUP BY user_id) x;
  END IF;

  UPDATE public.sports_matches
     SET state = 'settled', result = p_result, fee_total = v_fee_sum, paid_total = v_paid,
         settled_at = now(), last_error = NULL, updated_at = now()
   WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'result', p_result, 'pot', v_T, 'winners_stake', v_W,
                            'fee', v_fee_sum, 'paid', v_paid, 'bets', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public._sports_settle(bigint, text) FROM PUBLIC, anon, authenticated;

-- 7) Tick (pg_cron cada minuto): recoge datos, cierra mercados, liquida y anula
CREATE OR REPLACE FUNCTION public._sports_cron_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg        public.sports_config%ROWTYPE;
  v_resp     record;
  v_n        integer;
  v_req      bigint;
  v_url      text;
  v_today    date := (now() AT TIME ZONE 'UTC')::date;
  r          record;
  v_reason   text;
  v_settled  integer := 0;
  v_voided   integer := 0;
  v_errors   integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('xnova_sports_tick')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  SELECT * INTO cfg FROM public.sports_config WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  -- 1) Recoger la respuesta pendiente de pg_net
  IF cfg.pending_request_id IS NOT NULL THEN
    SELECT status_code, content, timed_out, error_msg INTO v_resp
      FROM net._http_response WHERE id = cfg.pending_request_id;
    IF FOUND THEN
      IF v_resp.status_code = 200 THEN
        BEGIN
          v_n := public._sports_ingest(v_resp.content::jsonb);
          UPDATE public.sports_config
             SET pending_request_id = NULL, last_sync_at = now(), last_sync_status = 200,
                 last_sync_error = NULL, last_sync_count = v_n, updated_at = now()
           WHERE id = 1;
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.sports_config
             SET pending_request_id = NULL, last_sync_status = 200,
                 last_sync_error = left('Respuesta invalida: ' || SQLERRM, 300), updated_at = now()
           WHERE id = 1;
        END;
      ELSE
        UPDATE public.sports_config
           SET pending_request_id = NULL, last_sync_status = v_resp.status_code,
               last_sync_error = left(COALESCE(v_resp.error_msg,
                                               CASE WHEN v_resp.timed_out THEN 'Tiempo de espera agotado' END,
                                               v_resp.content, 'Error desconocido'), 300),
               updated_at = now()
         WHERE id = 1;
      END IF;
    ELSIF cfg.last_request_at IS NULL OR cfg.last_request_at < now() - interval '3 minutes' THEN
      UPDATE public.sports_config
         SET pending_request_id = NULL, last_sync_error = 'Sin respuesta del proveedor (timeout)', updated_at = now()
       WHERE id = 1;
    END IF;
    SELECT * INTO cfg FROM public.sports_config WHERE id = 1;
  END IF;

  -- 2) Nueva consulta (ventana de 10 dias: hoy-2 .. hoy+7)
  IF cfg.pending_request_id IS NULL AND cfg.api_token IS NOT NULL
     AND (cfg.force_sync OR cfg.last_request_at IS NULL
          OR cfg.last_request_at <= now() - make_interval(mins => cfg.sync_interval_minutes) + interval '15 seconds') THEN
    v_url := 'https://api.football-data.org/v4/matches?competitions=' || array_to_string(cfg.competitions, ',')
          || '&dateFrom=' || to_char(v_today - 2, 'YYYY-MM-DD')
          || '&dateTo='   || to_char(v_today + 7, 'YYYY-MM-DD');
    v_req := net.http_get(
      url := v_url,
      params := '{}'::jsonb,
      headers := jsonb_build_object('X-Auth-Token', cfg.api_token),
      timeout_milliseconds := 20000);
    UPDATE public.sports_config
       SET pending_request_id = v_req, last_request_at = now(), force_sync = false, updated_at = now()
     WHERE id = 1;
  END IF;

  -- 3) Reabrir partidos sin apuestas que vuelven a tener fecha; cerrar los que empiezan
  UPDATE public.sports_matches
     SET state = 'open', updated_at = now()
   WHERE state = 'closed' AND bets_count = 0 AND api_status IN ('SCHEDULED','TIMED')
     AND kickoff > now() + make_interval(mins => cfg.close_minutes);

  UPDATE public.sports_matches
     SET state = 'closed', updated_at = now()
   WHERE state = 'open'
     AND (api_status NOT IN ('SCHEDULED','TIMED') OR kickoff <= now() + make_interval(mins => cfg.close_minutes));

  -- 4) Liquidar o anular (cada partido aislado: un fallo no bloquea a los demas)
  FOR r IN
    SELECT id, api_status, kickoff, first_kickoff, score_home, score_away
      FROM public.sports_matches
     WHERE state IN ('open','closed')
       AND (api_status IN ('FINISHED','CANCELLED','AWARDED')
            OR (api_status IN ('POSTPONED','SUSPENDED') AND kickoff < now() - interval '48 hours')
            OR (bets_count > 0 AND kickoff > first_kickoff + interval '48 hours')
            OR kickoff < now() - interval '4 days')
     ORDER BY kickoff
     LIMIT 40
  LOOP
    BEGIN
      IF r.api_status = 'FINISHED' AND r.score_home IS NOT NULL AND r.score_away IS NOT NULL THEN
        PERFORM public._sports_settle(r.id,
          CASE WHEN r.score_home > r.score_away THEN 'H' WHEN r.score_home < r.score_away THEN 'A' ELSE 'D' END);
        v_settled := v_settled + 1;
      ELSE
        v_reason := CASE
          WHEN r.api_status = 'FINISHED'  THEN 'Sin marcador oficial de los 90 minutos'
          WHEN r.api_status = 'CANCELLED' THEN 'Partido cancelado'
          WHEN r.api_status = 'AWARDED'   THEN 'Resultado decidido fuera del campo'
          WHEN r.api_status = 'POSTPONED' THEN 'Partido aplazado'
          WHEN r.api_status = 'SUSPENDED' THEN 'Partido suspendido'
          WHEN r.kickoff > r.first_kickoff + interval '48 hours' THEN 'Partido reprogramado'
          ELSE 'Sin resultado oficial' END;
        PERFORM public._sports_void(r.id, v_reason);
        v_voided := v_voided + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      UPDATE public.sports_matches SET last_error = left(SQLERRM, 300), updated_at = now() WHERE id = r.id;
    END;
  END LOOP;

  RETURN jsonb_build_object('settled', v_settled, 'voided', v_voided, 'errors', v_errors);
END;
$$;
REVOKE ALL ON FUNCTION public._sports_cron_tick() FROM PUBLIC, anon, authenticated;

-- 8) RPC: lobby
CREATE OR REPLACE FUNCTION public.sports_lobby()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_balance  numeric;
  cfg        public.sports_config%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT COALESCE(is_admin, false), COALESCE(fxu_balance, 0) INTO v_is_admin, v_balance
    FROM public.profiles WHERE id = v_uid;
  SELECT * INTO cfg FROM public.sports_config WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'server_time', now(),
    'balance', v_balance,
    'config', jsonb_build_object(
      'enabled', cfg.enabled,
      'ready', cfg.api_token IS NOT NULL,
      'min_bet', cfg.min_bet,
      'max_bet', cfg.max_bet,
      'max_per_match', cfg.max_per_match,
      'close_minutes', cfg.close_minutes,
      'fee_rate', 0.20,
      'competitions', to_jsonb(cfg.competitions),
      'last_sync_at', cfg.last_sync_at),
    'matches', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.kickoff, x.id) FROM (
        SELECT m.id, m.competition_code, m.competition_name, m.competition_emblem, m.matchday, m.stage,
               m.home_name, m.home_short, m.home_tla, m.home_crest,
               m.away_name, m.away_short, m.away_tla, m.away_crest,
               m.kickoff, m.api_status, m.state, m.live_home, m.live_away,
               m.pool_home, m.pool_draw, m.pool_away, m.bettors,
               COALESCE(s.my_h, 0) AS my_home, COALESCE(s.my_d, 0) AS my_draw, COALESCE(s.my_a, 0) AS my_away
          FROM public.sports_matches m
          LEFT JOIN LATERAL (
            SELECT sum(b.amount) FILTER (WHERE b.pick = 'H') AS my_h,
                   sum(b.amount) FILTER (WHERE b.pick = 'D') AS my_d,
                   sum(b.amount) FILTER (WHERE b.pick = 'A') AS my_a
              FROM public.sports_bets b WHERE b.match_id = m.id AND b.user_id = v_uid
          ) s ON true
         WHERE m.state IN ('open','closed') AND m.kickoff < now() + interval '8 days'
         ORDER BY m.kickoff, m.id
         LIMIT 300) x), '[]'::jsonb),
    'results', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.kickoff DESC, x.id) FROM (
        SELECT m.id, m.competition_code, m.competition_name, m.competition_emblem,
               m.home_name, m.home_short, m.home_tla, m.home_crest,
               m.away_name, m.away_short, m.away_tla, m.away_crest,
               m.kickoff, m.api_status, m.state, m.result, m.void_reason,
               m.live_home, m.live_away, m.score_home, m.score_away,
               m.pool_home, m.pool_draw, m.pool_away, m.bettors,
               COALESCE(s.staked, 0) AS my_staked, COALESCE(s.paid, 0) AS my_paid
          FROM public.sports_matches m
          LEFT JOIN LATERAL (
            SELECT sum(b.amount) AS staked, sum(b.payout) AS paid
              FROM public.sports_bets b WHERE b.match_id = m.id AND b.user_id = v_uid
          ) s ON true
         WHERE m.state IN ('settled','void') AND m.kickoff > now() - interval '3 days'
         ORDER BY m.kickoff DESC, m.id
         LIMIT 120) x), '[]'::jsonb),
    'big_wins', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.payout DESC) FROM (
        SELECT pr.username, b.payout, b.amount, b.pick, m.home_name, m.away_name, b.settled_at
          FROM public.sports_bets b
          JOIN public.sports_matches m ON m.id = b.match_id
          JOIN public.profiles pr ON pr.id = b.user_id
         WHERE b.status = 'won' AND b.settled_at > now() - interval '7 days' AND b.payout > b.amount
         ORDER BY b.payout DESC
         LIMIT 8) x), '[]'::jsonb),
    'my_open', (SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(amount), 0))
                  FROM public.sports_bets WHERE user_id = v_uid AND status = 'open'),
    'admin', CASE WHEN v_is_admin THEN jsonb_build_object(
      'token_set', cfg.api_token IS NOT NULL,
      'token_hint', CASE WHEN cfg.api_token IS NOT NULL THEN '****' || right(cfg.api_token, 4) END,
      'sync_interval_minutes', cfg.sync_interval_minutes,
      'last_request_at', cfg.last_request_at,
      'last_sync_at', cfg.last_sync_at,
      'last_sync_status', cfg.last_sync_status,
      'last_sync_error', cfg.last_sync_error,
      'last_sync_count', cfg.last_sync_count,
      'pending', cfg.pending_request_id IS NOT NULL,
      'pool_pending', cfg.pool_pending,
      'escrow', (SELECT COALESCE(sum(amount), 0) FROM public.sports_bets WHERE status = 'open'),
      'total_bets', (SELECT count(*) FROM public.sports_bets),
      'total_wagered', (SELECT COALESCE(sum(amount), 0) FROM public.sports_bets),
      'total_fees', (SELECT COALESCE(sum(fee), 0) FROM public.sports_bets),
      'total_company', (SELECT COALESCE(sum(company_share), 0) FROM public.sports_bets),
      'total_paid', (SELECT COALESCE(sum(payout), 0) FROM public.sports_bets WHERE status <> 'open'),
      'matches_known', (SELECT count(*) FROM public.sports_matches),
      'errors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'match', home_name || ' vs ' || away_name, 'error', last_error))
                            FROM public.sports_matches WHERE last_error IS NOT NULL AND state IN ('open','closed')), '[]'::jsonb)
    ) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.sports_lobby() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sports_lobby() TO authenticated;

-- 9) RPC: apostar
CREATE OR REPLACE FUNCTION public.sports_place_bet(p_match_id bigint, p_pick text, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  cfg       public.sports_config%ROWTYPE;
  m         public.sports_matches%ROWTYPE;
  v_balance numeric;
  v_last    timestamptz;
  v_mine    numeric;
  v_first   boolean;
  v_bet_id  uuid := gen_random_uuid();
  v_new_bal numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  IF p_match_id IS NULL OR p_pick IS NULL OR p_pick NOT IN ('H','D','A') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apuesta invalida');
  END IF;

  SELECT * INTO cfg FROM public.sports_config WHERE id = 1;
  IF NOT FOUND OR NOT cfg.enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Las apuestas deportivas estan cerradas temporalmente');
  END IF;
  IF p_amount IS NULL OR p_amount <> trunc(p_amount) OR p_amount < cfg.min_bet OR p_amount > cfg.max_bet THEN
    RETURN jsonb_build_object('success', false, 'error',
      'La apuesta debe ser un numero entero entre ' || cfg.min_bet || ' y ' || cfg.max_bet || ' TUNG');
  END IF;

  -- Orden de bloqueo: partido -> jugador
  SELECT * INTO m FROM public.sports_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Partido no encontrado');
  END IF;
  IF m.state <> 'open' OR m.api_status NOT IN ('SCHEDULED','TIMED')
     OR now() >= m.kickoff - make_interval(mins => cfg.close_minutes) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Las apuestas para este partido estan cerradas');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  SELECT max(created_at) INTO v_last FROM public.sports_bets WHERE user_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Espera un momento antes de volver a apostar');
  END IF;

  SELECT COALESCE(sum(amount), 0), count(*) = 0 INTO v_mine, v_first
    FROM public.sports_bets WHERE match_id = p_match_id AND user_id = v_uid;
  IF v_mine + p_amount > cfg.max_per_match THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Limite por partido: ' || cfg.max_per_match || ' TUNG (ya tienes ' || v_mine || ' apostados)');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      'TUNG insuficiente. Necesitas ' || p_amount || ' TUNG, tienes ' || floor(v_balance) || '.');
  END IF;

  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance - p_amount WHERE id = v_uid
  RETURNING fxu_balance INTO v_new_bal;

  INSERT INTO public.sports_bets (id, match_id, user_id, pick, amount)
  VALUES (v_bet_id, p_match_id, v_uid, p_pick, p_amount);

  UPDATE public.sports_matches
     SET pool_home  = pool_home + CASE WHEN p_pick = 'H' THEN p_amount ELSE 0 END,
         pool_draw  = pool_draw + CASE WHEN p_pick = 'D' THEN p_amount ELSE 0 END,
         pool_away  = pool_away + CASE WHEN p_pick = 'A' THEN p_amount ELSE 0 END,
         bets_count = bets_count + 1,
         bettors    = bettors + CASE WHEN v_first THEN 1 ELSE 0 END,
         updated_at = now()
   WHERE id = p_match_id
  RETURNING * INTO m;

  RETURN jsonb_build_object(
    'success', true,
    'bet_id', v_bet_id,
    'balance', v_new_bal,
    'match', jsonb_build_object('id', m.id, 'pool_home', m.pool_home, 'pool_draw', m.pool_draw,
                                'pool_away', m.pool_away, 'bettors', m.bettors));
END;
$$;
REVOKE ALL ON FUNCTION public.sports_place_bet(bigint, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sports_place_bet(bigint, text, numeric) TO authenticated;

-- 10) RPC: mis apuestas
CREATE OR REPLACE FUNCTION public.sports_my_bets(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  RETURN jsonb_build_object('success', true, 'bets', COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
      SELECT b.id, b.match_id, b.pick, b.amount, b.status, b.payout, b.fee, b.created_at, b.settled_at,
             m.competition_code, m.competition_name, m.competition_emblem,
             m.home_name, m.home_short, m.home_tla, m.home_crest,
             m.away_name, m.away_short, m.away_tla, m.away_crest,
             m.kickoff, m.api_status, m.state, m.result, m.void_reason,
             m.live_home, m.live_away, m.score_home, m.score_away,
             m.pool_home, m.pool_draw, m.pool_away
        FROM public.sports_bets b
        JOIN public.sports_matches m ON m.id = b.match_id
       WHERE b.user_id = v_uid
       ORDER BY b.created_at DESC
       LIMIT least(greatest(COALESCE(p_limit, 50), 1), 200)) x), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.sports_my_bets(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sports_my_bets(integer) TO authenticated;

-- 11) RPC: administracion (solo is_admin)
CREATE OR REPLACE FUNCTION public.sports_admin(p_action text, p_match_id bigint DEFAULT NULL, p_value text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_ok    boolean;
  v_lim   jsonb;
  v_min   numeric;
  v_max   numeric;
  v_mpm   numeric;
  v_close integer;
  v_int   integer;
  m       public.sports_matches%ROWTYPE;
  v_res   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  SELECT COALESCE(is_admin, false) INTO v_ok FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_ok, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;

  -- Serializa con el tick del cron
  PERFORM pg_advisory_xact_lock(hashtext('xnova_sports_tick'));

  IF p_action = 'set_token' THEN
    IF p_value IS NULL OR btrim(p_value) !~ '^[A-Za-z0-9]{16,64}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Token invalido');
    END IF;
    UPDATE public.sports_config
       SET api_token = btrim(p_value), force_sync = true, pending_request_id = NULL,
           last_sync_error = NULL, updated_at = now()
     WHERE id = 1;
    RETURN jsonb_build_object('success', true, 'message', 'Token guardado. Sincronizando partidos...');

  ELSIF p_action = 'clear_token' THEN
    UPDATE public.sports_config SET api_token = NULL, pending_request_id = NULL, updated_at = now() WHERE id = 1;
    RETURN jsonb_build_object('success', true, 'message', 'Token eliminado');

  ELSIF p_action IN ('enable', 'disable') THEN
    UPDATE public.sports_config SET enabled = (p_action = 'enable'), updated_at = now() WHERE id = 1;
    RETURN jsonb_build_object('success', true, 'message', CASE WHEN p_action = 'enable' THEN 'Apuestas abiertas' ELSE 'Apuestas pausadas' END);

  ELSIF p_action = 'set_limits' THEN
    BEGIN
      v_lim   := p_value::jsonb;
      v_min   := (v_lim ->> 'min_bet')::numeric;
      v_max   := (v_lim ->> 'max_bet')::numeric;
      v_mpm   := (v_lim ->> 'max_per_match')::numeric;
      v_close := (v_lim ->> 'close_minutes')::integer;
      v_int   := (v_lim ->> 'sync_interval_minutes')::integer;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', 'Valores invalidos');
    END;
    IF v_min IS NULL OR v_max IS NULL OR v_mpm IS NULL OR v_close IS NULL OR v_int IS NULL
       OR v_min < 1 OR v_max < v_min OR v_mpm < v_max OR v_close NOT BETWEEN 0 AND 120 OR v_int NOT BETWEEN 1 AND 60
       OR v_min <> trunc(v_min) OR v_max <> trunc(v_max) OR v_mpm <> trunc(v_mpm) THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Valores invalidos (min >= 1, max >= min, max por partido >= max, cierre 0-120 min, sync 1-60 min)');
    END IF;
    UPDATE public.sports_config
       SET min_bet = v_min, max_bet = v_max, max_per_match = v_mpm, close_minutes = v_close,
           sync_interval_minutes = v_int, updated_at = now()
     WHERE id = 1;
    RETURN jsonb_build_object('success', true, 'message', 'Limites actualizados');

  ELSIF p_action = 'sync_now' THEN
    UPDATE public.sports_config SET force_sync = true, updated_at = now() WHERE id = 1;
    v_res := public._sports_cron_tick();
    RETURN jsonb_build_object('success', true, 'message', 'Sincronizacion solicitada', 'tick', v_res);

  ELSIF p_action = 'void_match' THEN
    v_res := public._sports_void(p_match_id, left(COALESCE(NULLIF(btrim(p_value), ''), 'Anulado por administracion'), 120));
    RETURN v_res;

  ELSIF p_action = 'settle_match' THEN
    SELECT * INTO m FROM public.sports_matches WHERE id = p_match_id;
    IF NOT FOUND OR m.state NOT IN ('open','closed') THEN
      RETURN jsonb_build_object('success', false, 'error', 'El partido ya esta cerrado');
    END IF;
    IF m.kickoff > now() - interval '110 minutes' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Solo se puede liquidar a mano cuando el partido ya termino');
    END IF;
    IF p_value IS NULL OR p_value NOT IN ('H','D','A') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Resultado invalido');
    END IF;
    UPDATE public.sports_matches SET state = 'closed' WHERE id = p_match_id AND state = 'open';
    v_res := public._sports_settle(p_match_id, p_value);
    RETURN v_res;
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Accion desconocida');
END;
$$;
REVOKE ALL ON FUNCTION public.sports_admin(text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sports_admin(text, bigint, text) TO authenticated;

-- 12) Cron cada minuto
SELECT cron.schedule('sports-football-tick', '* * * * *', 'SELECT public._sports_cron_tick()');

COMMIT;

ALTER TABLE public.admin_revenue VALIDATE CONSTRAINT admin_revenue_revenue_type_check;

NOTIFY pgrst, 'reload schema';
