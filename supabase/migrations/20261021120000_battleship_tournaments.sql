-- =====================================================================
-- [BSTOUR1] Batalla de Naves: TORNEOS de eliminacion directa
--
--  * Torneo oficial (admin): comision 20% para la empresa.
--  * Torneo de jugador: comision 30% = 20% empresa + 10% para el organizador.
--  * El 20% de empresa se reparte con distribute_spend_fee (reparto normal):
--      50% pools / 50% empresa (20% de la parte de empresa al referido,
--      record_admin_revenue('battleship_tournament') -> accionistas).
--  * Bolsa de premios = resto (80% / 70%), top 3 (por defecto 50/30/20).
--  * La inscripcion queda retenida (escrow). Reembolso total si el jugador se
--    retira antes de empezar, si se cancela o si no se llega a 4 jugadores.
--  * Las comisiones se cobran SOLO cuando el torneo arranca.
--  * Partidas de torneo: stake 0, sin pot ni comision; no cuentan para el
--    pool diario ni para el ranking.
--  * Todo el acceso via RPC SECURITY DEFINER con auth.uid(); tablas sin grants.
-- =====================================================================

SET lock_timeout = '10s';

-- ---------------------------------------------------------------------
-- 1) Nuevo tipo de ingreso
-- ---------------------------------------------------------------------
DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conrelid = 'public.admin_revenue'::regclass AND conname = 'admin_revenue_revenue_type_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'admin_revenue_revenue_type_check no encontrado';
  END IF;
  IF position('''battleship_tournament''' IN v_def) > 0 THEN
    RETURN;
  END IF;
  v_def := regexp_replace(v_def, '\s+NOT VALID\s*$', '');
  IF length(v_def) - length(replace(v_def, ']', '')) <> 1 THEN
    RAISE EXCEPTION 'Formato inesperado: %', v_def;
  END IF;
  v_def := replace(v_def, ']', ', ''battleship_tournament''::text]');
  EXECUTE 'ALTER TABLE public.admin_revenue DROP CONSTRAINT admin_revenue_revenue_type_check';
  EXECUTE 'ALTER TABLE public.admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check ' || v_def || ' NOT VALID';
END
$mig$;

-- ---------------------------------------------------------------------
-- 2) Tablas
-- ---------------------------------------------------------------------
CREATE TABLE public.battleship_tournaments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 40),
  description     text CHECK (description IS NULL OR char_length(description) <= 200),
  creator_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_official     boolean NOT NULL DEFAULT false,
  entry_fee       numeric NOT NULL CHECK (entry_fee > 0),
  company_pct     numeric NOT NULL CHECK (company_pct >= 0 AND company_pct <= 50),
  creator_pct     numeric NOT NULL CHECK (creator_pct >= 0 AND creator_pct <= 50),
  prize_split     integer[] NOT NULL CHECK (cardinality(prize_split) = 3),
  max_players     integer NOT NULL CHECK (max_players IN (4, 8, 16, 32, 64)),
  min_players     integer NOT NULL DEFAULT 4 CHECK (min_players >= 4),
  starts_at       timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'running', 'finished', 'cancelled')),
  players         integer NOT NULL DEFAULT 0,
  bracket_size    integer,
  rounds          integer,
  current_round   integer NOT NULL DEFAULT 0,
  total_collected numeric NOT NULL DEFAULT 0,
  company_fee     numeric NOT NULL DEFAULT 0,
  creator_fee     numeric NOT NULL DEFAULT 0,
  prize_pool      numeric NOT NULL DEFAULT 0,
  prizes          numeric[],
  first_id        uuid,
  second_id       uuid,
  third_id        uuid,
  cancel_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX battleship_tournaments_status_idx ON public.battleship_tournaments (status, starts_at);
CREATE INDEX battleship_tournaments_creator_idx ON public.battleship_tournaments (creator_id, status);

CREATE TABLE public.battleship_tournament_entries (
  tournament_id uuid NOT NULL REFERENCES public.battleship_tournaments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  paid          numeric NOT NULL CHECK (paid > 0),
  refunded      boolean NOT NULL DEFAULT false,
  final_rank    smallint,
  prize         numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX battleship_tournament_entries_user_idx ON public.battleship_tournament_entries (user_id);

CREATE TABLE public.battleship_tournament_games (
  id            bigserial PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES public.battleship_tournaments(id) ON DELETE CASCADE,
  round         smallint NOT NULL,
  slot          smallint NOT NULL,
  kind          text NOT NULL DEFAULT 'main' CHECK (kind IN ('main', 'third')),
  player1       uuid,
  player2       uuid,
  match_id      uuid UNIQUE REFERENCES public.battleship_matches(id) ON DELETE SET NULL,
  winner        uuid,
  loser         uuid,
  status        text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'done', 'bye')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  UNIQUE (tournament_id, round, kind, slot)
);

ALTER TABLE public.battleship_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battleship_tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battleship_tournament_games ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.battleship_tournaments FROM PUBLIC, anon, authenticated, authenticator;
REVOKE ALL ON TABLE public.battleship_tournament_entries FROM PUBLIC, anon, authenticated, authenticator;
REVOKE ALL ON TABLE public.battleship_tournament_games FROM PUBLIC, anon, authenticated, authenticator;
REVOKE ALL ON SEQUENCE public.battleship_tournament_games_id_seq FROM PUBLIC, anon, authenticated, authenticator;

-- ---------------------------------------------------------------------
-- 3) Partidas de torneo dentro del motor existente
-- ---------------------------------------------------------------------
ALTER TABLE public.battleship_matches
  ADD COLUMN tournament_id uuid REFERENCES public.battleship_tournaments(id) ON DELETE SET NULL,
  ADD COLUMN tournament_round smallint;
ALTER TABLE public.battleship_matches DROP CONSTRAINT battleship_matches_stake_check;
ALTER TABLE public.battleship_matches ADD CONSTRAINT battleship_matches_stake_check
  CHECK (stake > 0 OR (tournament_id IS NOT NULL AND stake = 0));
CREATE INDEX battleship_matches_tournament_idx ON public.battleship_matches (tournament_id) WHERE tournament_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4) Helpers internos
-- ---------------------------------------------------------------------
CREATE FUNCTION public._bst_round_name(p_round integer, p_rounds integer, p_kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_kind = 'third' THEN 'Duelo por el 3er puesto'
    WHEN p_round = p_rounds THEN 'Gran Final'
    WHEN p_round = p_rounds - 1 THEN 'Semifinal'
    WHEN p_round = p_rounds - 2 THEN 'Cuartos de final'
    WHEN p_round = p_rounds - 3 THEN 'Octavos de final'
    ELSE 'Ronda ' || p_round
  END;
$function$;

CREATE FUNCTION public._bst_uname(p_uid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT NULLIF(btrim(username), '') FROM public.profiles WHERE id = p_uid), 'Comandante');
$function$;

-- [total, empresa, organizador, bolsa, 1o, 2o, 3o]
CREATE FUNCTION public._bst_prizes(p_fee numeric, p_n integer, p_company numeric, p_creator numeric, p_split integer[])
 RETURNS numeric[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_comp  numeric;
  v_cre   numeric;
  v_pool  numeric;
  v2      numeric;
  v3      numeric;
BEGIN
  v_total := p_fee * p_n;
  v_comp  := round(p_fee * p_company / 100, 2) * p_n;
  v_cre   := round(p_fee * p_creator / 100, 2) * p_n;
  v_pool  := v_total - v_comp - v_cre;
  v2      := floor(v_pool * p_split[2]) / 100;
  v3      := floor(v_pool * p_split[3]) / 100;
  RETURN ARRAY[v_total, v_comp, v_cre, v_pool, v_pool - v2 - v3, v2, v3];
END;
$function$;

CREATE FUNCTION public._bst_notify(p_uid uuid, p_subject text, p_body text, p_dm boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_uid IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (p_uid, NULL, left(p_subject, 200), p_body, 'system');
    IF p_dm THEN
      PERFORM public._tgn_dm(p_uid, p_subject,
        p_body || E'\n\n👉 https://falcoxnova.com/game/battleship?tab=torneos');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[BSTOUR1] aviso a %: %', p_uid, SQLERRM;
  END;
END;
$function$;

-- Sigue compitiendo en un torneo en curso (no eliminado definitivamente)
CREATE FUNCTION public._bst_alive(p_tid uuid, p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.battleship_tournaments t
      JOIN public.battleship_tournament_entries e
        ON e.tournament_id = t.id AND e.user_id = p_uid AND NOT e.refunded
     WHERE t.id = p_tid AND t.status = 'running'
       AND NOT EXISTS (
         SELECT 1 FROM public.battleship_tournament_games g
          WHERE g.tournament_id = t.id
            AND (   (g.loser = p_uid AND NOT (g.kind = 'main' AND g.round = t.rounds - 1))
                 OR (g.status = 'done' AND p_uid IN (g.player1, g.player2)
                     AND (g.kind = 'third' OR g.round = t.rounds)))));
$function$;

-- Inscrito en un torneo que empieza en <= 10 min o que sigue jugando
CREATE FUNCTION public._bst_busy(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.battleship_tournament_entries e
      JOIN public.battleship_tournaments t ON t.id = e.tournament_id
     WHERE e.user_id = p_uid AND NOT e.refunded
       AND (   (t.status = 'open' AND t.starts_at <= now() + interval '10 minutes')
            OR (t.status = 'running' AND public._bst_alive(t.id, p_uid))));
$function$;

-- Crea una partida (o un pase directo si falta un jugador) del cuadro
CREATE FUNCTION public._bst_new_match(p_tid uuid, p_round integer, p_kind text, p_slot integer, p_p1 uuid, p_p2 uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl       constant text := E'\n';
  v_name   text;
  v_rounds integer;
  v_rn     text;
  v_mid    uuid;
  v_solo   uuid := COALESCE(p_p1, p_p2);
BEGIN
  SELECT name, rounds INTO v_name, v_rounds FROM public.battleship_tournaments WHERE id = p_tid;
  v_rn := public._bst_round_name(p_round, v_rounds, p_kind);

  IF p_p1 IS NULL OR p_p2 IS NULL THEN
    IF v_solo IS NULL THEN
      RETURN;
    END IF;
    INSERT INTO public.battleship_tournament_games (tournament_id, round, slot, kind, player1, winner, status, finished_at)
    VALUES (p_tid, p_round, p_slot, p_kind, v_solo, v_solo, 'bye', now());
    PERFORM public._bst_notify(v_solo, '🎟 Pase directo · ' || v_name,
      '🍀 En ' || v_rn || ' no tienes rival: avanzas automáticamente.' || nl
      || '⚓ Prepárate para la siguiente ronda del torneo «' || v_name || '».', false);
    RETURN;
  END IF;

  INSERT INTO public.battleship_matches (status, is_private, stake, pot, player1, player2, deadline, p1_seen_at,
                                         started_at, loser_fee, tournament_id, tournament_round)
  VALUES ('placing', false, 0, 0, p_p1, p_p2, now() + interval '3 minutes', now(),
          now(), false, p_tid, p_round)
  RETURNING id INTO v_mid;

  INSERT INTO public.battleship_tournament_games (tournament_id, round, slot, kind, player1, player2, match_id, status)
  VALUES (p_tid, p_round, p_slot, p_kind, p_p1, p_p2, v_mid, 'live');

  PERFORM public._bst_notify(p_p1, '⚔️ ' || v_rn || ' · Torneo «' || v_name || '»',
    '🚀 ¡Tu batalla del torneo ha comenzado!' || nl
    || '⚓ Rival: ' || public._bst_uname(p_p2) || nl
    || '⏱ Tienes 3 minutos para desplegar tu flota (si no, se desplegará al azar).' || nl || nl
    || '🏆 Entra ya a la Batalla de Naves y hunde su flota.', true);
  PERFORM public._bst_notify(p_p2, '⚔️ ' || v_rn || ' · Torneo «' || v_name || '»',
    '🚀 ¡Tu batalla del torneo ha comenzado!' || nl
    || '⚓ Rival: ' || public._bst_uname(p_p1) || nl
    || '⏱ Tienes 3 minutos para desplegar tu flota (si no, se desplegará al azar).' || nl || nl
    || '🏆 Entra ya a la Batalla de Naves y hunde su flota.', true);
END;
$function$;

-- Llamado desde _bs_settle cuando termina una partida de torneo
CREATE FUNCTION public._bst_on_match_end(p_match_id uuid, p_winner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl     constant text := E'\n';
  g      public.battleship_tournament_games%ROWTYPE;
  t      public.battleship_tournaments%ROWTYPE;
  v_rn   text;
BEGIN
  UPDATE public.battleship_tournament_games
     SET winner = p_winner,
         loser = CASE WHEN player1 = p_winner THEN player2 ELSE player1 END,
         status = 'done', finished_at = now()
   WHERE match_id = p_match_id AND status = 'live'
  RETURNING * INTO g;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  BEGIN
    SELECT * INTO t FROM public.battleship_tournaments WHERE id = g.tournament_id;
    v_rn := public._bst_round_name(g.round, t.rounds, g.kind);

    IF g.kind = 'third' OR g.round = t.rounds THEN
      NULL;  -- el podio se anuncia al cerrar el torneo
    ELSIF g.round = t.rounds - 1 THEN
      PERFORM public._bst_notify(g.winner, '🔥 ¡Estás en la GRAN FINAL! · ' || t.name,
        '⚓ Venciste a ' || public._bst_uname(g.loser) || ' en la semifinal.' || nl
        || '🥇 La final empieza en cuanto termine la otra semifinal. ¡A por la corona!', false);
      PERFORM public._bst_notify(g.loser, '🥉 Aún puedes subir al podio · ' || t.name,
        '💥 Caíste en la semifinal contra ' || public._bst_uname(g.winner) || '.' || nl
        || '🥉 Jugarás el duelo por el 3er puesto en cuanto termine la otra semifinal.', true);
    ELSE
      PERFORM public._bst_notify(g.winner, '✅ Avanzas de ronda · ' || t.name,
        '⚓ Venciste a ' || public._bst_uname(g.loser) || ' (' || v_rn || ').' || nl
        || '⏳ Tu próxima batalla empieza cuando termine la ronda. ¡Atento!', false);
      PERFORM public._bst_notify(g.loser, '💥 Eliminado del torneo · ' || t.name,
        '⚓ ' || public._bst_uname(g.winner) || ' te eliminó en ' || v_rn || '.' || nl || nl
        || '💪 ¡Gracias por competir! Apúntate al próximo torneo y vuelve más fuerte.', true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[BSTOUR1] on_match_end %: %', p_match_id, SQLERRM;
  END;
END;
$function$;

-- Reembolsa a todos los inscritos y cancela (el torneo debe estar bloqueado)
CREATE FUNCTION public._bst_refund_all(p_tid uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl     constant text := E'\n';
  v_name text;
  e      record;
BEGIN
  SELECT name INTO v_name FROM public.battleship_tournaments WHERE id = p_tid;
  PERFORM public._internal_set_fxu_context();
  FOR e IN
    SELECT user_id, paid FROM public.battleship_tournament_entries
     WHERE tournament_id = p_tid AND NOT refunded
     ORDER BY user_id
       FOR UPDATE
  LOOP
    UPDATE public.profiles SET fxu_balance = fxu_balance + e.paid WHERE id = e.user_id;
    UPDATE public.battleship_tournament_entries SET refunded = true
     WHERE tournament_id = p_tid AND user_id = e.user_id;
    PERFORM public._bst_notify(e.user_id, '↩️ Torneo cancelado · ' || v_name,
      '⚓ El torneo «' || v_name || '» se canceló: ' || p_reason || '.' || nl
      || '💰 Te devolvimos ' || public._tgn_fmt(e.paid) || ' TUNG de la inscripción.', true);
  END LOOP;
  UPDATE public.battleship_tournaments
     SET status = 'cancelled', cancel_reason = p_reason, finished_at = now(), updated_at = now()
   WHERE id = p_tid;
END;
$function$;

-- Anuncio de torneo nuevo: canal de Telegram + mensaje a jugadores activos
CREATE FUNCTION public._bst_announce(p_tid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl      constant text := E'\n';
  c_url   constant text := 'https://falcoxnova.com/game/battleship?tab=torneos';
  t       public.battleship_tournaments%ROWTYPE;
  v_pr    numeric[];
  v_price numeric;
  v_body  text;
  v_subj  text;
BEGIN
  SELECT * INTO t FROM public.battleship_tournaments WHERE id = p_tid;
  v_pr := public._bst_prizes(t.entry_fee, t.max_players, t.company_pct, t.creator_pct, t.prize_split);
  v_price := public._tgn_price(NULL);

  v_subj := CASE WHEN t.is_official THEN '🏆 TORNEO OFICIAL · BATALLA DE NAVES'
                 ELSE '🏆 NUEVO TORNEO · BATALLA DE NAVES' END;
  v_body := '⚓ «' || t.name || '»' || nl
         || CASE WHEN t.description IS NOT NULL THEN '📜 ' || t.description || nl ELSE '' END
         || CASE WHEN t.is_official THEN '🎖 Torneo oficial' ELSE '🎖 Organiza: ' || public._bst_uname(t.creator_id) END || nl || nl
         || '🎟 Inscripción: ' || public._tgn_fmt(t.entry_fee) || ' TUNG' || public._tgn_usdt(t.entry_fee, v_price) || nl
         || '👥 Plazas: ' || t.max_players || ' comandantes (mínimo ' || t.min_players || ')' || nl
         || '📅 Comienza: ' || to_char(t.starts_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC' || nl || nl
         || '💰 PREMIOS CON EL CUPO LLENO' || nl
         || '🥇 1º lugar: ' || public._tgn_fmt(v_pr[5]) || ' TUNG' || public._tgn_usdt(v_pr[5], v_price) || nl
         || '🥈 2º lugar: ' || public._tgn_fmt(v_pr[6]) || ' TUNG' || public._tgn_usdt(v_pr[6], v_price) || nl
         || '🥉 3º lugar: ' || public._tgn_fmt(v_pr[7]) || ' TUNG' || public._tgn_usdt(v_pr[7], v_price) || nl
         || '💎 Bolsa total: ' || public._tgn_fmt(v_pr[4]) || ' TUNG' || nl || nl
         || '⚔️ Eliminación directa 1 vs 1. ¡Hunde todas las flotas y llévate la corona!' || nl
         || '👉 Inscríbete en ' || c_url;

  PERFORM public._tgn_channel_post(v_subj, v_body);

  BEGIN
    INSERT INTO public.messages (recipient_id, sender_id, subject, body, message_type)
    SELECT p.id, NULL, left(v_subj || ' · ' || t.name, 200), v_body, 'system'
      FROM public.profiles p
     WHERE p.last_activity > now() - interval '7 days'
       AND NOT COALESCE(p.is_banned, false)
       AND NOT COALESCE(p.is_bot, false);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[BSTOUR1] anuncio %: %', p_tid, SQLERRM;
  END;
END;
$function$;

-- Arranque: cobra comisiones, arma el cuadro y crea la 1a ronda
CREATE FUNCTION public._bst_start(p_tid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl         constant text := E'\n';
  c_url      constant text := 'https://falcoxnova.com/game/battleship?tab=torneos';
  t          public.battleship_tournaments%ROWTYPE;
  v_n        integer;
  v_pr       numeric[];
  v_comp_one numeric;
  v_size     integer := 4;
  v_rounds   integer := 2;
  v_half     integer;
  v_players  uuid[];
  v_price    numeric;
  v_body     text;
  k          integer;
  e          record;
BEGIN
  SELECT * INTO t FROM public.battleship_tournaments WHERE id = p_tid FOR UPDATE;
  IF NOT FOUND OR t.status <> 'open' OR t.starts_at > now() THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_n FROM public.battleship_tournament_entries WHERE tournament_id = p_tid AND NOT refunded;
  IF v_n < t.min_players THEN
    PERFORM public._bst_refund_all(p_tid, 'no se llegó al mínimo de ' || t.min_players || ' jugadores');
    RETURN;
  END IF;

  v_pr := public._bst_prizes(t.entry_fee, v_n, t.company_pct, t.creator_pct, t.prize_split);
  v_comp_one := round(t.entry_fee * t.company_pct / 100, 2);

  -- Comision de empresa por inscrito (reparto normal: pools / empresa / referido / accionistas)
  FOR e IN SELECT user_id FROM public.battleship_tournament_entries
            WHERE tournament_id = p_tid AND NOT refunded ORDER BY user_id
  LOOP
    PERFORM public.distribute_spend_fee(v_comp_one, 'battleship_tournament', 'battleship_tournament', e.user_id,
      left('Torneo Batalla de Naves: ' || t.name, 200), p_tid);
  END LOOP;

  -- Comision del organizador (torneos de jugador)
  IF v_pr[3] > 0 AND t.creator_id IS NOT NULL THEN
    PERFORM public._internal_set_fxu_context();
    UPDATE public.profiles SET fxu_balance = fxu_balance + v_pr[3] WHERE id = t.creator_id;
    PERFORM public._bst_notify(t.creator_id, '💼 Comisión de organizador · ' || t.name,
      '🏆 ¡Tu torneo «' || t.name || '» ha comenzado con ' || v_n || ' comandantes!' || nl
      || '💰 Recibiste ' || public._tgn_fmt(v_pr[3]) || ' TUNG (' || t.creator_pct || '% de las inscripciones).', true);
  END IF;

  WHILE v_size < v_n LOOP
    v_size := v_size * 2;
    v_rounds := v_rounds + 1;
  END LOOP;
  v_half := v_size / 2;

  UPDATE public.battleship_tournaments
     SET status = 'running', players = v_n, bracket_size = v_size, rounds = v_rounds, current_round = 1,
         total_collected = v_pr[1], company_fee = v_pr[2], creator_fee = v_pr[3], prize_pool = v_pr[4],
         prizes = ARRAY[v_pr[5], v_pr[6], v_pr[7]], started_at = now(), updated_at = now()
   WHERE id = p_tid;

  -- Sorteo: los primeros v_half van a la izquierda; los pases directos quedan al final
  v_players := ARRAY(SELECT user_id FROM public.battleship_tournament_entries
                      WHERE tournament_id = p_tid AND NOT refunded ORDER BY gen_random_uuid());
  FOR k IN 0 .. v_half - 1 LOOP
    PERFORM public._bst_new_match(p_tid, 1, 'main', k, v_players[k + 1],
      CASE WHEN v_half + k + 1 <= v_n THEN v_players[v_half + k + 1] ELSE NULL END);
  END LOOP;

  v_price := public._tgn_price(NULL);
  v_body := '👥 ' || v_n || ' comandantes en la arena' || nl
         || '💎 Bolsa de premios: ' || public._tgn_fmt(v_pr[4]) || ' TUNG' || public._tgn_usdt(v_pr[4], v_price) || nl || nl
         || '🥇 ' || public._tgn_fmt(v_pr[5]) || ' TUNG' || public._tgn_usdt(v_pr[5], v_price) || nl
         || '🥈 ' || public._tgn_fmt(v_pr[6]) || ' TUNG' || public._tgn_usdt(v_pr[6], v_price) || nl
         || '🥉 ' || public._tgn_fmt(v_pr[7]) || ' TUNG' || public._tgn_usdt(v_pr[7], v_price) || nl || nl
         || '⚔️ Arranca: ' || public._bst_round_name(1, v_rounds, 'main') || '. ¡Que gane el mejor almirante!' || nl
         || '👉 Síguelo en ' || c_url;
  PERFORM public._tgn_channel_post('🏆 ¡ARRANCA EL TORNEO «' || t.name || '»!', v_body);
END;
$function$;

-- Cierre: paga el podio y lo anuncia
CREATE FUNCTION public._bst_finish(p_tid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl       constant text := E'\n';
  c_url    constant text := 'https://falcoxnova.com/game/battleship?tab=torneos';
  t        public.battleship_tournaments%ROWTYPE;
  v_first  uuid;
  v_second uuid;
  v_third  uuid;
  v_p      numeric[];
  v_price  numeric;
  v_body   text;
  e        record;
BEGIN
  SELECT * INTO t FROM public.battleship_tournaments WHERE id = p_tid FOR UPDATE;
  IF NOT FOUND OR t.status <> 'running' THEN
    RETURN;
  END IF;

  SELECT winner, loser INTO v_first, v_second FROM public.battleship_tournament_games
   WHERE tournament_id = p_tid AND round = t.rounds AND kind = 'main' AND slot = 0 AND status IN ('done', 'bye');
  SELECT winner INTO v_third FROM public.battleship_tournament_games
   WHERE tournament_id = p_tid AND round = t.rounds AND kind = 'third' AND slot = 0 AND status IN ('done', 'bye');
  IF v_first IS NULL THEN
    RAISE EXCEPTION 'Torneo % sin campeon', p_tid;
  END IF;

  v_p := t.prizes;
  -- Defensivo: un premio sin dueño pasa al campeón
  IF v_second IS NULL THEN v_p[1] := v_p[1] + v_p[2]; v_p[2] := 0; END IF;
  IF v_third IS NULL THEN v_p[1] := v_p[1] + v_p[3]; v_p[3] := 0; END IF;

  PERFORM public._internal_set_fxu_context();
  IF v_p[1] > 0 THEN UPDATE public.profiles SET fxu_balance = fxu_balance + v_p[1] WHERE id = v_first; END IF;
  IF v_p[2] > 0 THEN UPDATE public.profiles SET fxu_balance = fxu_balance + v_p[2] WHERE id = v_second; END IF;
  IF v_p[3] > 0 THEN UPDATE public.profiles SET fxu_balance = fxu_balance + v_p[3] WHERE id = v_third; END IF;

  UPDATE public.battleship_tournament_entries SET final_rank = 1, prize = v_p[1] WHERE tournament_id = p_tid AND user_id = v_first;
  UPDATE public.battleship_tournament_entries SET final_rank = 2, prize = v_p[2] WHERE tournament_id = p_tid AND user_id = v_second;
  UPDATE public.battleship_tournament_entries SET final_rank = 3, prize = v_p[3] WHERE tournament_id = p_tid AND user_id = v_third;

  UPDATE public.battleship_tournaments
     SET status = 'finished', first_id = v_first, second_id = v_second, third_id = v_third,
         prizes = v_p, finished_at = now(), updated_at = now()
   WHERE id = p_tid;

  v_price := public._tgn_price(NULL);

  PERFORM public._bst_notify(v_first, '👑 ¡CAMPEÓN del torneo «' || t.name || '»!',
    '🏆 ¡Eres el almirante supremo del torneo!' || nl || nl
    || '🥇 Premio: ' || public._tgn_fmt(v_p[1]) || ' TUNG' || public._tgn_usdt(v_p[1], v_price) || nl
    || '👥 Superaste a ' || (t.players - 1) || ' comandantes' || nl || nl
    || '🎉 El premio ya está en tu saldo.', true);
  IF v_second IS NOT NULL THEN
    PERFORM public._bst_notify(v_second, '🥈 ¡Subcampeón del torneo «' || t.name || '»!',
      '⚓ Llegaste hasta la Gran Final. ¡Gran campaña!' || nl || nl
      || '🥈 Premio: ' || public._tgn_fmt(v_p[2]) || ' TUNG' || public._tgn_usdt(v_p[2], v_price) || nl || nl
      || '🎉 El premio ya está en tu saldo.', true);
  END IF;
  IF v_third IS NOT NULL THEN
    PERFORM public._bst_notify(v_third, '🥉 ¡Tercer puesto en el torneo «' || t.name || '»!',
      '⚓ Te subiste al podio ganando el duelo por el 3er puesto.' || nl || nl
      || '🥉 Premio: ' || public._tgn_fmt(v_p[3]) || ' TUNG' || public._tgn_usdt(v_p[3], v_price) || nl || nl
      || '🎉 El premio ya está en tu saldo.', true);
  END IF;
  FOR e IN SELECT user_id FROM public.battleship_tournament_entries
            WHERE tournament_id = p_tid AND NOT refunded AND final_rank IS NULL
  LOOP
    PERFORM public._bst_notify(e.user_id, '🏁 Torneo finalizado · ' || t.name,
      '👑 Campeón: ' || public._bst_uname(v_first) || nl
      || '🥈 Subcampeón: ' || public._bst_uname(v_second) || nl
      || '🥉 Tercero: ' || public._bst_uname(v_third) || nl || nl
      || '⚔️ ¡Gracias por competir! Nos vemos en el próximo torneo.', false);
  END LOOP;

  v_body := '⚓ «' || t.name || '» ya tiene campeón' || nl || nl
         || '━━━━━━━━━━━━━━━━' || nl
         || '👑 CAMPEÓN' || nl
         || '🥇 ' || public._bst_uname(v_first) || nl
         || '💰 ' || public._tgn_fmt(v_p[1]) || ' TUNG' || public._tgn_usdt(v_p[1], v_price) || nl || nl
         || CASE WHEN v_second IS NOT NULL THEN
              '🥈 ' || public._bst_uname(v_second) || ' · ' || public._tgn_fmt(v_p[2]) || ' TUNG' || public._tgn_usdt(v_p[2], v_price) || nl
            ELSE '' END
         || CASE WHEN v_third IS NOT NULL THEN
              '🥉 ' || public._bst_uname(v_third) || ' · ' || public._tgn_fmt(v_p[3]) || ' TUNG' || public._tgn_usdt(v_p[3], v_price) || nl
            ELSE '' END
         || '━━━━━━━━━━━━━━━━' || nl
         || '👥 ' || t.players || ' comandantes · 💎 Bolsa: ' || public._tgn_fmt(t.prize_pool) || ' TUNG' || nl
         || CASE WHEN t.is_official THEN '🎖 Torneo oficial' ELSE '🎖 Organizado por ' || public._bst_uname(t.creator_id) END || nl || nl
         || '⚔️ ¡El próximo campeón puedes ser tú!' || nl
         || '👉 ' || c_url;
  PERFORM public._tgn_channel_post('🏆 TORNEO FINALIZADO · ' || t.name, v_body);
END;
$function$;

-- Avanza el cuadro cuando termina una ronda
CREATE FUNCTION public._bst_advance(p_tid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl      constant text := E'\n';
  c_url   constant text := 'https://falcoxnova.com/game/battleship?tab=torneos';
  t       public.battleship_tournaments%ROWTYPE;
  r       integer;
  k       integer;
  a       uuid;
  b       uuid;
  v_price numeric;
BEGIN
  SELECT * INTO t FROM public.battleship_tournaments WHERE id = p_tid FOR UPDATE;
  IF NOT FOUND OR t.status <> 'running' THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.battleship_tournament_games
              WHERE tournament_id = p_tid AND round = t.current_round AND status = 'live') THEN
    RETURN;
  END IF;

  IF t.current_round >= t.rounds THEN
    PERFORM public._bst_finish(p_tid);
    RETURN;
  END IF;

  r := t.current_round + 1;
  UPDATE public.battleship_tournaments SET current_round = r, updated_at = now() WHERE id = p_tid;

  FOR k IN 0 .. (t.bracket_size >> r) - 1 LOOP
    a := NULL; b := NULL;
    SELECT winner INTO a FROM public.battleship_tournament_games
     WHERE tournament_id = p_tid AND round = r - 1 AND kind = 'main' AND slot = 2 * k;
    SELECT winner INTO b FROM public.battleship_tournament_games
     WHERE tournament_id = p_tid AND round = r - 1 AND kind = 'main' AND slot = 2 * k + 1;
    PERFORM public._bst_new_match(p_tid, r, 'main', k, a, b);
  END LOOP;

  IF r = t.rounds THEN
    a := NULL; b := NULL;
    SELECT loser INTO a FROM public.battleship_tournament_games
     WHERE tournament_id = p_tid AND round = r - 1 AND kind = 'main' AND slot = 0;
    SELECT loser INTO b FROM public.battleship_tournament_games
     WHERE tournament_id = p_tid AND round = r - 1 AND kind = 'main' AND slot = 1;
    PERFORM public._bst_new_match(p_tid, r, 'third', 0, a, b);

    -- Hype en el canal: la Gran Final
    SELECT player1, player2 INTO a, b FROM public.battleship_tournament_games
     WHERE tournament_id = p_tid AND round = r AND kind = 'main' AND slot = 0 AND status = 'live';
    IF a IS NOT NULL AND b IS NOT NULL THEN
      v_price := public._tgn_price(NULL);
      PERFORM public._tgn_channel_post('🔥 GRAN FINAL · ' || t.name,
        '⚔️ ' || public._bst_uname(a) || '  🆚  ' || public._bst_uname(b) || nl || nl
        || '🥇 En juego: ' || public._tgn_fmt(t.prizes[1]) || ' TUNG' || public._tgn_usdt(t.prizes[1], v_price) || nl
        || '🥈 Subcampeón: ' || public._tgn_fmt(t.prizes[2]) || ' TUNG' || nl
        || '🥉 También se disputa el 3er puesto: ' || public._tgn_fmt(t.prizes[3]) || ' TUNG' || nl || nl
        || '👉 ' || c_url);
    END IF;
  END IF;
END;
$function$;

-- Cron: arranca torneos y avanza rondas
CREATE FUNCTION public.battleship_tournament_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_n  integer := 0;
BEGIN
  IF session_user <> 'postgres' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('battleship_tournament_tick')) THEN
    RETURN 0;
  END IF;
  PERFORM set_config('lock_timeout', '5s', true);

  FOR v_id IN SELECT id FROM public.battleship_tournaments
               WHERE status = 'open' AND starts_at <= now() ORDER BY starts_at LIMIT 20
  LOOP
    BEGIN
      PERFORM public._bst_start(v_id);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[BSTOUR1] start %: %', v_id, SQLERRM;
    END;
  END LOOP;

  FOR v_id IN SELECT id FROM public.battleship_tournaments WHERE status = 'running' ORDER BY started_at
  LOOP
    BEGIN
      PERFORM public._bst_advance(v_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[BSTOUR1] advance %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$function$;

-- JSON publico de un torneo
CREATE FUNCTION public._bst_json(p_tid uuid, p_uid uuid, p_is_admin boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t      public.battleship_tournaments%ROWTYPE;
  v_full numeric[];
  v_now  numeric[];
  v_reg  boolean;
BEGIN
  SELECT * INTO t FROM public.battleship_tournaments WHERE id = p_tid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_full := public._bst_prizes(t.entry_fee, t.max_players, t.company_pct, t.creator_pct, t.prize_split);
  v_now  := public._bst_prizes(t.entry_fee, t.players, t.company_pct, t.creator_pct, t.prize_split);
  v_reg  := EXISTS (SELECT 1 FROM public.battleship_tournament_entries
                     WHERE tournament_id = t.id AND user_id = p_uid AND NOT refunded);
  RETURN jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'description', t.description,
    'is_official', t.is_official,
    'creator', CASE WHEN t.is_official THEN NULL ELSE public._bst_uname(t.creator_id) END,
    'mine', t.creator_id = p_uid,
    'entry_fee', t.entry_fee,
    'fee_pct', t.company_pct + t.creator_pct,
    'company_pct', t.company_pct,
    'creator_pct', t.creator_pct,
    'prize_split', to_jsonb(t.prize_split),
    'max_players', t.max_players,
    'min_players', t.min_players,
    'players', t.players,
    'starts_at', t.starts_at,
    'status', t.status,
    'current_round', t.current_round,
    'rounds', t.rounds,
    'round_name', CASE WHEN t.status = 'running' THEN public._bst_round_name(t.current_round, t.rounds, 'main') END,
    'pool_full', v_full[4],
    'prizes_full', jsonb_build_array(v_full[5], v_full[6], v_full[7]),
    'pool', CASE WHEN t.status IN ('running', 'finished') THEN t.prize_pool ELSE v_now[4] END,
    'prizes', CASE WHEN t.status IN ('running', 'finished') THEN to_jsonb(t.prizes)
                   ELSE jsonb_build_array(v_now[5], v_now[6], v_now[7]) END,
    'registered', v_reg,
    'alive', public._bst_alive(t.id, p_uid),
    'can_cancel', t.status = 'open' AND (p_is_admin OR t.creator_id = p_uid),
    'podium', CASE WHEN t.status = 'finished' THEN jsonb_build_array(
                public._bst_uname(t.first_id),
                CASE WHEN t.second_id IS NOT NULL THEN public._bst_uname(t.second_id) END,
                CASE WHEN t.third_id IS NOT NULL THEN public._bst_uname(t.third_id) END) END,
    'cancel_reason', t.cancel_reason,
    'started_at', t.started_at,
    'finished_at', t.finished_at
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 5) RPCs publicas (solo authenticated)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.battleship_tournament_create(
  p_name text, p_entry_fee numeric, p_max_players integer, p_starts_at timestamptz,
  p_prize_split integer[] DEFAULT ARRAY[50, 30, 20], p_description text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_min_fee constant numeric := 1;
  v_uid     uuid := auth.uid();
  v_admin   boolean;
  v_banned  boolean;
  v_enabled boolean;
  v_name    text;
  v_desc    text;
  v_max_fee numeric;
  v_id      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(is_admin, false), COALESCE(is_banned, false) INTO v_admin, v_banned FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_banned THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cuenta no habilitada');
  END IF;
  SELECT enabled INTO v_enabled FROM public.battleship_config WHERE id = 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Batalla de Naves esta cerrada temporalmente');
  END IF;

  v_name := btrim(regexp_replace(regexp_replace(COALESCE(p_name, ''), '[<>&|[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'));
  IF char_length(v_name) < 3 OR char_length(v_name) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre debe tener entre 3 y 40 caracteres');
  END IF;
  v_desc := NULLIF(btrim(regexp_replace(regexp_replace(COALESCE(p_description, ''), '[<>&|[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), '');
  IF v_desc IS NOT NULL AND char_length(v_desc) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La descripcion admite como maximo 200 caracteres');
  END IF;

  v_max_fee := CASE WHEN v_admin THEN 1000000 ELSE 100000 END;
  IF p_entry_fee IS NULL OR p_entry_fee <> round(p_entry_fee, 2) OR p_entry_fee < c_min_fee OR p_entry_fee > v_max_fee THEN
    RETURN jsonb_build_object('success', false, 'error',
      'La inscripcion debe estar entre ' || c_min_fee || ' y ' || v_max_fee || ' TUNG (maximo 2 decimales)');
  END IF;
  IF p_max_players IS NULL OR p_max_players NOT IN (4, 8, 16, 32, 64) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plazas invalidas (4, 8, 16, 32 o 64)');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at < now() + interval '5 minutes' OR p_starts_at > now() + interval '30 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El inicio debe ser entre 5 minutos y 30 dias desde ahora');
  END IF;
  IF p_prize_split IS NULL OR cardinality(p_prize_split) <> 3
     OR p_prize_split[1] IS NULL OR p_prize_split[2] IS NULL OR p_prize_split[3] IS NULL
     OR p_prize_split[3] < 5 OR p_prize_split[2] < p_prize_split[3] OR p_prize_split[1] < p_prize_split[2]
     OR p_prize_split[1] + p_prize_split[2] + p_prize_split[3] <> 100 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Reparto invalido: debe sumar 100%, cada puesto minimo 5% y 1o >= 2o >= 3o');
  END IF;

  IF NOT v_admin THEN
    PERFORM pg_advisory_xact_lock(hashtext('bst_create_' || v_uid::text));
    IF EXISTS (SELECT 1 FROM public.battleship_tournaments
                WHERE creator_id = v_uid AND status IN ('open', 'running')) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un torneo activo. Espera a que termine para crear otro.');
    END IF;
    IF EXISTS (SELECT 1 FROM public.battleship_tournaments
                WHERE creator_id = v_uid AND created_at > now() - interval '10 minutes') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Espera unos minutos antes de crear otro torneo');
    END IF;
    IF (SELECT count(*) FROM public.battleship_tournaments WHERE NOT is_official AND status = 'open') >= 20 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Hay demasiados torneos abiertos. Intentalo mas tarde.');
    END IF;
  END IF;

  INSERT INTO public.battleship_tournaments (name, description, creator_id, is_official, entry_fee, company_pct,
                                             creator_pct, prize_split, max_players, starts_at)
  VALUES (v_name, v_desc, v_uid, v_admin, p_entry_fee, 20, CASE WHEN v_admin THEN 0 ELSE 10 END,
          p_prize_split, p_max_players, p_starts_at)
  RETURNING id INTO v_id;

  PERFORM public._bst_announce(v_id);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$function$;

CREATE FUNCTION public.battleship_tournament_register(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl        constant text := E'\n';
  v_uid     uuid := auth.uid();
  v_gate    text;
  v_enabled boolean;
  v_banned  boolean;
  v_bal     numeric;
  t         public.battleship_tournaments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  v_gate := public._casino_games_gate(v_uid);
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_gate);
  END IF;
  SELECT enabled INTO v_enabled FROM public.battleship_config WHERE id = 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Batalla de Naves esta cerrada temporalmente');
  END IF;

  -- Orden de bloqueo: torneo -> perfil
  SELECT * INTO t FROM public.battleship_tournaments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Torneo no encontrado');
  END IF;
  IF t.status <> 'open' OR t.starts_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Las inscripciones de este torneo estan cerradas');
  END IF;
  IF EXISTS (SELECT 1 FROM public.battleship_tournament_entries
              WHERE tournament_id = p_id AND user_id = v_uid AND NOT refunded) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya estas inscrito en este torneo');
  END IF;
  IF t.players >= t.max_players THEN
    RETURN jsonb_build_object('success', false, 'error', 'El torneo esta completo');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.battleship_tournament_entries e
      JOIN public.battleship_tournaments o ON o.id = e.tournament_id
     WHERE e.user_id = v_uid AND NOT e.refunded AND o.id <> p_id
       AND (   (o.status = 'open' AND abs(extract(epoch FROM o.starts_at - t.starts_at)) < 3 * 3600)
            OR (o.status = 'running' AND public._bst_alive(o.id, v_uid)))) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Ya estas inscrito en otro torneo que se juega a una hora cercana (menos de 3 horas)');
  END IF;

  SELECT COALESCE(fxu_balance, 0), COALESCE(is_banned, false) INTO v_bal, v_banned
    FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_banned THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cuenta no habilitada');
  END IF;
  IF v_bal < t.entry_fee THEN
    RETURN jsonb_build_object('success', false, 'error',
      'TUNG insuficiente. La inscripcion cuesta ' || t.entry_fee || ' TUNG y tienes ' || round(v_bal, 2) || '.');
  END IF;

  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance - t.entry_fee WHERE id = v_uid;
  INSERT INTO public.battleship_tournament_entries (tournament_id, user_id, paid)
  VALUES (p_id, v_uid, t.entry_fee)
  ON CONFLICT (tournament_id, user_id) DO UPDATE
     SET paid = EXCLUDED.paid, refunded = false, final_rank = NULL, prize = 0, created_at = now();
  UPDATE public.battleship_tournaments SET players = players + 1, updated_at = now() WHERE id = p_id;

  PERFORM public._bst_notify(v_uid, '🎟 Inscripción confirmada · ' || t.name,
    '⚓ Ya estás dentro del torneo «' || t.name || '».' || nl
    || '💵 Inscripción: ' || public._tgn_fmt(t.entry_fee) || ' TUNG' || nl
    || '📅 Comienza: ' || to_char(t.starts_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC' || nl || nl
    || '↩️ Puedes retirarte con reembolso completo antes de que empiece.', false);

  RETURN jsonb_build_object('success', true, 'players', t.players + 1);
END;
$function$;

CREATE FUNCTION public.battleship_tournament_unregister(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  t      public.battleship_tournaments%ROWTYPE;
  v_paid numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.battleship_tournaments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Torneo no encontrado');
  END IF;
  IF t.status <> 'open' OR t.starts_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'El torneo ya empezo: no puedes retirarte');
  END IF;
  SELECT paid INTO v_paid FROM public.battleship_tournament_entries
   WHERE tournament_id = p_id AND user_id = v_uid AND NOT refunded FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No estas inscrito en este torneo');
  END IF;

  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance + v_paid WHERE id = v_uid;
  UPDATE public.battleship_tournament_entries SET refunded = true WHERE tournament_id = p_id AND user_id = v_uid;
  UPDATE public.battleship_tournaments SET players = players - 1, updated_at = now() WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_paid);
END;
$function$;

CREATE FUNCTION public.battleship_tournament_cancel(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_admin boolean;
  t       public.battleship_tournaments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(is_admin, false) INTO v_admin FROM public.profiles WHERE id = v_uid;
  SELECT * INTO t FROM public.battleship_tournaments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Torneo no encontrado');
  END IF;
  IF NOT (COALESCE(v_admin, false) OR t.creator_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo el organizador o un admin puede cancelarlo');
  END IF;
  IF t.status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden cancelar torneos que aun no han empezado');
  END IF;
  PERFORM public._bst_refund_all(p_id,
    CASE WHEN t.creator_id = v_uid THEN 'cancelado por el organizador' ELSE 'cancelado por la administración' END);
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE FUNCTION public.battleship_tournaments()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_admin   boolean;
  v_bal     numeric;
  v_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(is_admin, false), COALESCE(fxu_balance, 0) INTO v_admin, v_bal FROM public.profiles WHERE id = v_uid;
  SELECT enabled INTO v_enabled FROM public.battleship_config WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'enabled', COALESCE(v_enabled, false),
    'is_admin', COALESCE(v_admin, false),
    'balance', COALESCE(v_bal, 0),
    'gate_error', public._casino_games_gate(v_uid),
    'rules', jsonb_build_object(
      'official_fee_pct', 20, 'player_fee_pct', 30, 'creator_pct', 10,
      'min_fee', 1, 'max_fee', CASE WHEN v_admin THEN 1000000 ELSE 100000 END,
      'sizes', jsonb_build_array(4, 8, 16, 32, 64), 'min_players', 4),
    'can_create', COALESCE(v_admin, false) OR NOT EXISTS (
      SELECT 1 FROM public.battleship_tournaments WHERE creator_id = v_uid AND status IN ('open', 'running')),
    'live_match', (SELECT m.id FROM public.battleship_matches m
                    WHERE m.tournament_id IS NOT NULL AND m.status IN ('placing', 'battle')
                      AND (m.player1 = v_uid OR m.player2 = v_uid)
                    ORDER BY m.created_at DESC LIMIT 1),
    'tournaments', (
      SELECT COALESCE(jsonb_agg(public._bst_json(x.id, v_uid, COALESCE(v_admin, false)) ORDER BY x.ord, x.sortkey), '[]'::jsonb)
        FROM (SELECT t.id,
                     CASE t.status WHEN 'running' THEN 0 WHEN 'open' THEN 1 WHEN 'finished' THEN 2 ELSE 3 END AS ord,
                     CASE WHEN t.status IN ('open', 'running') THEN extract(epoch FROM t.starts_at)
                          ELSE -extract(epoch FROM COALESCE(t.finished_at, t.updated_at)) END AS sortkey
                FROM public.battleship_tournaments t
               WHERE t.status IN ('open', 'running')
                  OR (t.status = 'finished' AND t.finished_at > now() - interval '7 days')
                  OR (t.status = 'cancelled' AND t.finished_at > now() - interval '1 day')
               ORDER BY 2, 3
               LIMIT 60) x)
  );
END;
$function$;

CREATE FUNCTION public.battleship_tournament_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_admin boolean;
  v_t     jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(is_admin, false) INTO v_admin FROM public.profiles WHERE id = v_uid;
  v_t := public._bst_json(p_id, v_uid, COALESCE(v_admin, false));
  IF v_t IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Torneo no encontrado');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tournament', v_t,
    'entrants', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'username', public._bst_uname(e.user_id), 'rank', e.final_rank, 'prize', e.prize,
               'me', e.user_id = v_uid) ORDER BY e.final_rank NULLS LAST, e.created_at), '[]'::jsonb)
        FROM public.battleship_tournament_entries e
       WHERE e.tournament_id = p_id AND NOT e.refunded),
    'games', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'round', g.round, 'slot', g.slot, 'kind', g.kind, 'status', g.status,
               'p1', CASE WHEN g.player1 IS NOT NULL THEN public._bst_uname(g.player1) END,
               'p2', CASE WHEN g.player2 IS NOT NULL THEN public._bst_uname(g.player2) END,
               'winner', CASE WHEN g.winner IS NULL THEN NULL WHEN g.winner = g.player1 THEN 1 ELSE 2 END,
               'p1_hits', m.p1_hits, 'p2_hits', m.p2_hits, 'phase', m.status, 'end_reason', m.end_reason,
               'me', v_uid IN (g.player1, g.player2),
               'match_id', CASE WHEN v_uid IN (g.player1, g.player2) THEN g.match_id END)
               ORDER BY g.round, g.kind, g.slot), '[]'::jsonb)
        FROM public.battleship_tournament_games g
        LEFT JOIN public.battleship_matches m ON m.id = g.match_id
       WHERE g.tournament_id = p_id)
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 6) Parches al motor existente (ancla exacta y unica)
-- ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.bst_patch(p_fn text, p_old text, p_new text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_src text;
  v_cnt integer;
BEGIN
  v_src := replace(pg_get_functiondef(p_fn::regprocedure), E'\r', '');
  v_cnt := (length(v_src) - length(replace(v_src, p_old, ''))) / length(p_old);
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Ancla encontrada % veces en %', v_cnt, p_fn;
  END IF;
  EXECUTE replace(v_src, p_old, p_new);
END;
$function$;

-- 6.1 _bs_settle: las partidas de torneo no pagan pot ni comision
SELECT pg_temp.bst_patch('public._bs_settle(uuid,uuid,text)',
$a$  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance + m.pot WHERE id = p_winner;$a$,
$b$  IF m.tournament_id IS NOT NULL THEN
    -- [BSTOUR1] Torneo: sin apuesta ni comision; el cuadro avanza
    UPDATE public.battleship_matches
       SET status = 'finished', winner = p_winner, end_reason = p_reason, payout = 0,
           turn = NULL, deadline = NULL, finished_at = now(), version = version + 1, updated_at = now()
     WHERE id = p_match_id;
    PERFORM public._bst_on_match_end(p_match_id, p_winner);
    RETURN;
  END IF;
  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance + m.pot WHERE id = p_winner;$b$);

-- 6.2 Aviso de victoria/derrota normal: no aplica a torneos
SELECT pg_temp.bst_patch('public._trg_battleship_notify()',
$a$BEGIN
  BEGIN
    v_loser := CASE WHEN NEW.winner = NEW.player1$a$,
$b$BEGIN
  IF NEW.tournament_id IS NOT NULL THEN
    RETURN NULL;  -- [BSTOUR1] los torneos tienen sus propios avisos
  END IF;
  BEGIN
    v_loser := CASE WHEN NEW.winner = NEW.player1$b$);

-- 6.3 No abrir duelos con apuesta si tienes un torneo inminente o en curso
SELECT pg_temp.bst_patch('public.battleship_create(numeric,boolean)',
$a$    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una partida en curso');
  END IF;$a$,
$b$    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una partida en curso');
  END IF;
  IF public._bst_busy(v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tienes un torneo en curso o a punto de empezar: no puedes abrir duelos ahora');
  END IF;$b$);

SELECT pg_temp.bst_patch('public.battleship_join(uuid,text)',
$a$    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una partida en curso');
  END IF;$a$,
$b$    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una partida en curso');
  END IF;
  IF public._bst_busy(v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tienes un torneo en curso o a punto de empezar: no puedes unirte a duelos ahora');
  END IF;$b$);

-- 6.4 Pool diario y ranking: solo duelos con apuesta
SELECT pg_temp.bst_patch('public.battleship_daily_pool_payout()',
$a$       WHERE m.status = 'finished' AND m.winner IS NOT NULL AND x.uid IS NOT NULL
         AND m.finished_at >= v_from AND m.finished_at < v_to$a$,
$b$       WHERE m.status = 'finished' AND m.winner IS NOT NULL AND x.uid IS NOT NULL
         AND m.finished_at >= v_from AND m.finished_at < v_to
         AND m.tournament_id IS NULL$b$);

SELECT pg_temp.bst_patch('public.casino_leaderboard(text,text)',
$a$     WHERE p_game = 'battleship' AND m.status = 'finished' AND m.winner IS NOT NULL
       AND x.uid IS NOT NULL AND m.finished_at >= v_since$a$,
$b$     WHERE p_game = 'battleship' AND m.status = 'finished' AND m.winner IS NOT NULL
       AND x.uid IS NOT NULL AND m.finished_at >= v_since
       AND m.tournament_id IS NULL$b$);

-- 6.5 Lobby: historial y ultimas victorias solo de duelos con apuesta
SELECT pg_temp.bst_patch('public.battleship_lobby()',
$a$WHERE (m.player1 = v_uid OR m.player2 = v_uid) AND m.status IN ('finished', 'cancelled')$a$,
$b$WHERE (m.player1 = v_uid OR m.player2 = v_uid) AND m.status IN ('finished', 'cancelled') AND m.tournament_id IS NULL$b$);

SELECT pg_temp.bst_patch('public.battleship_lobby()',
$a$             WHERE m.status = 'finished'
             ORDER BY m.finished_at DESC LIMIT 8$a$,
$b$             WHERE m.status = 'finished' AND m.tournament_id IS NULL
             ORDER BY m.finished_at DESC LIMIT 8$b$);

-- 6.6 Estado de partida: datos del torneo
SELECT pg_temp.bst_patch('public.battleship_state(uuid)',
$a$    'version', m.version
  );$a$,
$b$    'version', m.version,
    'tournament_id', m.tournament_id,
    'tournament_name', (SELECT t.name FROM public.battleship_tournaments t WHERE t.id = m.tournament_id),
    'round_name', (SELECT public._bst_round_name(g.round, t.rounds, g.kind)
                     FROM public.battleship_tournament_games g
                     JOIN public.battleship_tournaments t ON t.id = g.tournament_id
                    WHERE g.match_id = m.id)
  );$b$);

-- ---------------------------------------------------------------------
-- 7) Permisos
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._bst_round_name(integer, integer, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_uname(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_prizes(numeric, integer, numeric, numeric, integer[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_notify(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_alive(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_busy(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_new_match(uuid, integer, text, integer, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_on_match_end(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_refund_all(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_announce(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_start(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_finish(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_advance(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bst_json(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.battleship_tournament_tick() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.battleship_tournament_create(text, numeric, integer, timestamptz, integer[], text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.battleship_tournament_register(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.battleship_tournament_unregister(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.battleship_tournament_cancel(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.battleship_tournaments() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.battleship_tournament_detail(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.battleship_tournament_create(text, numeric, integer, timestamptz, integer[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battleship_tournament_register(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battleship_tournament_unregister(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battleship_tournament_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battleship_tournaments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.battleship_tournament_detail(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Cron
-- ---------------------------------------------------------------------
SELECT cron.schedule('battleship-tournament-tick', '10 seconds', 'SELECT public.battleship_tournament_tick()');
