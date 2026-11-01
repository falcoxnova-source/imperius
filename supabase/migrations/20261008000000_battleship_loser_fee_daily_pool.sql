-- Batalla de Naves: comision solo al perdedor (20% de SU apuesta) + pool diario TOP 5
--   5%  -> pools normales (jackpot, acumulado en pool_pending y enviado en multiplos de 10)
--   5%  -> pool diario de la Batalla de Naves (se reparte cada dia 00:01 UTC al TOP 5 del ranking "Hoy")
--   10% -> empresa: 20% al referidor del perdedor (si no hay, a la empresa); el resto a empresa/accionistas
-- Ganador cobra su apuesta + 80% de la del rival = 1.8x
SET client_encoding = 'UTF8';

-- ─── Esquema ───────────────────────────────────────────────────────
ALTER TABLE public.battleship_matches ADD COLUMN IF NOT EXISTS loser_fee boolean NOT NULL DEFAULT false;
ALTER TABLE public.battleship_entries ADD COLUMN IF NOT EXISTS daily_pool_share numeric NOT NULL DEFAULT 0;
ALTER TABLE public.battleship_config
  ADD COLUMN IF NOT EXISTS daily_pool numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_pool_total_in numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_pool_total_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_pool_last_day date;

CREATE TABLE IF NOT EXISTS public.battleship_pool_payouts (
  id          bigserial PRIMARY KEY,
  day         date NOT NULL,
  rank        smallint NOT NULL CHECK (rank BETWEEN 1 AND 5),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wins        integer NOT NULL,
  net         numeric NOT NULL,
  pct         numeric NOT NULL,
  amount      numeric NOT NULL CHECK (amount > 0),
  pool_before numeric NOT NULL,
  tung_price  numeric,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, rank),
  UNIQUE (day, user_id)
);
ALTER TABLE public.battleship_pool_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.battleship_pool_payouts FROM PUBLIC, anon, authenticated, authenticator;
REVOKE ALL ON SEQUENCE public.battleship_pool_payouts_id_seq FROM PUBLIC, anon, authenticated, authenticator;

-- ─── Unirse: ya no cobra comision, solo bloquea la apuesta ─────────
CREATE OR REPLACE FUNCTION public.battleship_join(p_match_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_win_mult constant numeric := 1.8;
  v_uid  uuid := auth.uid();
  v_cfg  public.battleship_config%ROWTYPE;
  v_gate text;
  v_code text;
  v_mid  uuid;
  m      public.battleship_matches%ROWTYPE;
  v_bal  numeric;
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
    RETURN jsonb_build_object('success', false, 'error', 'La Batalla de Naves esta cerrada temporalmente');
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

  PERFORM public._internal_set_fxu_context();

  -- Apuesta del retador (la comision se cobra al PERDEDOR al terminar, en _bs_settle)
  UPDATE public.profiles SET fxu_balance = fxu_balance - m.stake WHERE id = v_uid;
  INSERT INTO public.battleship_entries (match_id, user_id, stake) VALUES (v_mid, v_uid, m.stake);

  UPDATE public.battleship_config
     SET total_matches = total_matches + 1,
         total_wagered = total_wagered + m.stake * 2,
         updated_at    = now()
   WHERE id = 1;

  UPDATE public.battleship_matches
     SET player2 = v_uid, status = 'placing', pot = m.stake * c_win_mult, loser_fee = true,
         deadline = now() + interval '90 seconds', started_at = now(),
         version = version + 1, updated_at = now()
   WHERE id = v_mid;

  RETURN jsonb_build_object('success', true, 'match_id', v_mid);
END;
$function$;

-- ─── Liquidacion: paga al ganador y reparte la comision del perdedor ─
CREATE OR REPLACE FUNCTION public._bs_settle(p_match_id uuid, p_winner uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_pool_rate  constant numeric := 0.05;
  c_daily_rate constant numeric := 0.05;
  c_ref_rate   constant numeric := 0.20;
  m             public.battleship_matches%ROWTYPE;
  v_cfg         public.battleship_config%ROWTYPE;
  v_loser       uuid;
  v_fee         numeric;
  v_pool        numeric;
  v_daily       numeric;
  v_company     numeric;
  v_referrer    uuid;
  v_ref_share   numeric := 0;
  v_admin_share numeric;
  v_admin_id    uuid;
  v_pending     numeric;
  v_flush       numeric;
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

  IF NOT m.loser_fee THEN
    -- Partidas antiguas: la comision ya se cobro al unirse
    UPDATE public.battleship_config SET total_paid = total_paid + m.pot, updated_at = now() WHERE id = 1;
    RETURN;
  END IF;

  v_loser   := CASE WHEN p_winner = m.player1 THEN m.player2 ELSE m.player1 END;
  v_fee     := m.stake * 2 - m.pot;                -- 20% de la apuesta del perdedor
  v_pool    := round(m.stake * c_pool_rate, 8);    -- 5%  pools normales
  v_daily   := round(m.stake * c_daily_rate, 8);   -- 5%  pool diario Batalla de Naves
  v_company := v_fee - v_pool - v_daily;           -- 10% empresa

  SELECT p.referred_by INTO v_referrer FROM public.profiles p WHERE p.id = v_loser;
  IF v_referrer IS NOT NULL AND v_referrer <> v_loser
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_referrer) THEN
    v_ref_share := round(v_company * c_ref_rate, 8);
  ELSE
    v_referrer := NULL;
    v_ref_share := 0;
  END IF;
  v_admin_share := v_company - v_ref_share;

  SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_share > 0 AND v_admin_id IS NOT NULL THEN
    UPDATE public.profiles SET fxu_balance = fxu_balance + v_admin_share WHERE id = v_admin_id;
  END IF;

  IF v_referrer IS NOT NULL AND v_ref_share > 0 THEN
    UPDATE public.profiles SET fxu_balance = fxu_balance + v_ref_share WHERE id = v_referrer;
    INSERT INTO public.referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer, v_loser, NULL, 'casino_battleship_referral', v_ref_share);
  END IF;

  UPDATE public.battleship_entries
     SET fee = v_fee, pool_share = v_pool, daily_pool_share = v_daily, company_share = v_admin_share,
         referrer_id = v_referrer, referrer_share = v_ref_share
   WHERE match_id = p_match_id AND user_id = v_loser;

  IF v_admin_share > 0 THEN
    -- record_admin_revenue reparte la parte de los accionistas
    PERFORM public.record_admin_revenue('casino_battleship', v_admin_share,
      'Batalla de Naves: comision del perdedor', v_loser, p_match_id);
  END IF;

  -- Pools normales: se acumula y se envia en multiplos de 10
  SELECT * INTO v_cfg FROM public.battleship_config WHERE id = 1 FOR UPDATE;
  v_pending := v_cfg.pool_pending + v_pool;
  v_flush := floor(v_pending / 10) * 10;
  IF v_flush > 0 THEN
    PERFORM public.contribute_to_jackpot(v_flush, 'casino_battleship', v_loser);
    v_pending := v_pending - v_flush;
  END IF;
  UPDATE public.battleship_config
     SET pool_pending        = v_pending,
         daily_pool          = daily_pool + v_daily,
         daily_pool_total_in = daily_pool_total_in + v_daily,
         total_fees          = total_fees + v_fee,
         total_paid          = total_paid + m.pot,
         updated_at          = now()
   WHERE id = 1;
END;
$function$;

-- ─── Reparto diario del pool al TOP 5 (solo cron / postgres) ───────
CREATE OR REPLACE FUNCTION public.battleship_daily_pool_payout()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nl       constant text := E'\n';
  c_url    constant text := 'https://falcoxnova.com/game/battleship';
  c_split  constant numeric[] := ARRAY[40, 25, 15, 12, 8];
  v_day    date := (now() AT TIME ZONE 'UTC')::date - 1;
  v_from   timestamptz;
  v_to     timestamptz;
  v_pool   numeric;
  v_price  numeric;
  v_amt    numeric;
  v_total  numeric := 0;
  v_n      integer := 0;
  v_lines  text := '';
  v_medal  text;
  v_body   text;
  r        record;
BEGIN
  IF session_user <> 'postgres' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('battleship_daily_pool_payout'));

  IF EXISTS (SELECT 1 FROM public.battleship_pool_payouts WHERE day = v_day) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya repartido', 'day', v_day);
  END IF;

  SELECT daily_pool INTO v_pool FROM public.battleship_config WHERE id = 1;
  IF v_pool IS NULL OR v_pool < 0.05 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool vacio', 'day', v_day, 'pool', v_pool);
  END IF;

  v_from  := v_day::timestamp AT TIME ZONE 'UTC';
  v_to    := v_from + interval '1 day';
  v_price := public._tgn_price(NULL);
  PERFORM public._internal_set_fxu_context();

  -- Mismo criterio que el ranking "Hoy": victorias, luego ganancia neta
  FOR r IN
    WITH plays AS (
      SELECT x.uid AS user_id, m.stake AS bet,
             CASE WHEN m.winner = x.uid THEN m.payout ELSE 0 END AS payout,
             (m.winner = x.uid) AS won
        FROM public.battleship_matches m
        CROSS JOIN LATERAL (VALUES (m.player1), (m.player2)) AS x(uid)
       WHERE m.status = 'finished' AND m.winner IS NOT NULL AND x.uid IS NOT NULL
         AND m.finished_at >= v_from AND m.finished_at < v_to
    ),
    agg AS (
      SELECT p.user_id, count(*) AS plays, count(*) FILTER (WHERE p.won) AS wins,
             round(sum(p.payout - p.bet), 2) AS net
        FROM plays p
        JOIN public.profiles pr ON pr.id = p.user_id
       WHERE NOT COALESCE(pr.is_hidden, false) AND NOT COALESCE(pr.is_banned, false)
       GROUP BY p.user_id
    )
    SELECT a.user_id, a.wins, a.net, COALESCE(NULLIF(btrim(pr.username), ''), 'Comandante') AS uname,
           (row_number() OVER (ORDER BY a.wins DESC, a.net DESC, a.plays ASC, a.user_id))::integer AS rnk
      FROM agg a JOIN public.profiles pr ON pr.id = a.user_id
     WHERE a.wins > 0
     ORDER BY rnk
     LIMIT 5
  LOOP
    v_amt := floor(v_pool * c_split[r.rnk] / 100 * 100) / 100;
    CONTINUE WHEN v_amt <= 0;

    UPDATE public.profiles SET fxu_balance = fxu_balance + v_amt WHERE id = r.user_id;
    INSERT INTO public.battleship_pool_payouts (day, rank, user_id, wins, net, pct, amount, pool_before, tung_price)
    VALUES (v_day, r.rnk, r.user_id, r.wins, r.net, c_split[r.rnk], v_amt, v_pool, v_price);

    v_body := '🏆 ¡Quedaste #' || r.rnk || ' en el ranking diario de la Batalla de Naves!' || nl || nl
           || '💰 Premio: ' || public._tgn_fmt(v_amt) || ' TUNG' || public._tgn_usdt(v_amt, v_price) || nl
           || '⚔️ Victorias del día: ' || r.wins || nl || nl
           || '🚀 El pool se reparte cada día entre el TOP 5. ¡Defiende tu puesto!';
    BEGIN
      INSERT INTO public.messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (r.user_id, NULL, '🏆 Premio diario Batalla de Naves · #' || r.rnk, v_body, 'system');
      PERFORM public._tgn_dm(r.user_id, '🏆 Premio diario Batalla de Naves', v_body || nl || nl || '👉 ' || c_url);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[BSPOOL1] aviso a % : %', r.user_id, SQLERRM;
    END;

    v_medal := CASE r.rnk WHEN 1 THEN '🥇' WHEN 2 THEN '🥈' WHEN 3 THEN '🥉' ELSE '🎖' END;
    v_lines := v_lines || v_medal || ' #' || r.rnk || ' ' || r.uname || ' · ' || r.wins
            || CASE WHEN r.wins = 1 THEN ' victoria' ELSE ' victorias' END
            || ' · ' || public._tgn_fmt(v_amt) || ' TUNG' || public._tgn_usdt(v_amt, v_price) || nl;
    v_total := v_total + v_amt;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sin ganadores ayer; el pool se acumula', 'day', v_day, 'pool', v_pool);
  END IF;

  UPDATE public.battleship_config
     SET daily_pool            = daily_pool - v_total,
         daily_pool_total_paid = daily_pool_total_paid + v_total,
         daily_pool_last_day   = v_day,
         updated_at            = now()
   WHERE id = 1;

  v_body := '💰 Pool repartido: ' || public._tgn_fmt(v_total) || ' TUNG' || public._tgn_usdt(v_total, v_price) || nl
         || '📅 Ranking del ' || to_char(v_day, 'DD/MM/YYYY') || nl || nl
         || '--- TOP 5 DEL DÍA ---' || nl
         || v_lines || nl
         || '⚓ El 5% de cada apuesta perdida alimenta este pool y se reparte cada día entre los 5 mejores.' || nl
         || '⚔️ ¡Gana batallas hoy y cobra mañana!' || nl
         || '👉 Juega en ' || c_url;
  PERFORM public._tgn_channel_post('⚓ BATALLA DE NAVES · PREMIOS DEL DÍA', v_body);

  RETURN jsonb_build_object('success', true, 'day', v_day, 'paid', v_total, 'winners', v_n);
END;
$function$;

REVOKE ALL ON FUNCTION public.battleship_daily_pool_payout() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._bs_settle(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.battleship_join(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_join(uuid, text) TO authenticated;

-- ─── Ajustes puntuales en funciones existentes ─────────────────────
DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  -- Estado: bote de espera a 1.8x
  v_src := pg_get_functiondef('public.battleship_state(uuid)'::regprocedure);
  v_new := replace(v_src, 'ELSE m.stake * 1.6 END', 'ELSE m.stake * 1.8 END');
  IF v_new = v_src THEN RAISE EXCEPTION 'battleship_state: patron no encontrado'; END IF;
  EXECUTE v_new;

  -- Lobby: multiplicador 1.8 + info del pool diario
  v_src := pg_get_functiondef('public.battleship_lobby()'::regprocedure);
  v_new := replace(v_src, $p$'payout_mult', 1.6,$p$, $p$'payout_mult', 1.8,
    'daily_pool', COALESCE(v_cfg.daily_pool, 0),
    'daily_pool_split', jsonb_build_array(40, 25, 15, 12, 8),
    'daily_pool_next', (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC',
    'daily_pool_last_day', (SELECT max(day) FROM public.battleship_pool_payouts),
    'daily_pool_last', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', x.rank, 'username', COALESCE(p.username, 'Comandante'),
               'wins', x.wins, 'amount', x.amount) ORDER BY x.rank), '[]'::jsonb)
        FROM public.battleship_pool_payouts x JOIN public.profiles p ON p.id = x.user_id
       WHERE x.day = (SELECT max(day) FROM public.battleship_pool_payouts)),$p$);
  IF v_new = v_src THEN RAISE EXCEPTION 'battleship_lobby: patron no encontrado'; END IF;
  EXECUTE v_new;

  -- Ranking "Hoy" de la Batalla de Naves = dia UTC en curso (el que se premia)
  v_src := pg_get_functiondef('public.casino_leaderboard(text, text)'::regprocedure);
  v_new := replace(v_src, $p$WHEN 'day'  THEN now() - interval '1 day'$p$,
    $p$WHEN 'day'  THEN CASE WHEN p_game = 'battleship' THEN date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ELSE now() - interval '1 day' END$p$);
  IF v_new = v_src THEN RAISE EXCEPTION 'casino_leaderboard: patron no encontrado'; END IF;
  EXECUTE v_new;
END
$mig$;

-- ─── Cron diario 00:01 UTC ─────────────────────────────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'battleship-daily-pool';
SELECT cron.schedule('battleship-daily-pool', '1 0 * * *', 'SELECT public.battleship_daily_pool_payout()');
