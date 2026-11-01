SET client_encoding TO 'UTF8';
-- [TGNOTIFY1] Reportes + Telegram (DM personal y canales) para Apuestas Deportivas y Batalla de Naves.
--  * Reporte en Mensajes (tipo 'system') con formato atractivo y valor en USDT.
--  * DM de Telegram al jugador (notification_queue, ntype 'tg_text', solo si tiene Telegram vinculado).
--  * Post en los canales de Telegram (internal-telegram-broadcast) con ganadores y premios.
-- Todo va en triggers AFTER UPDATE y protegido con EXCEPTION: un fallo aqui nunca bloquea un pago.

-- 1) Utilidades
CREATE OR REPLACE FUNCTION public._tgn_fmt(p numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(to_char(round(COALESCE(p, 0), 2), 'FM999,999,999,990.00'));
$$;

CREATE OR REPLACE FUNCTION public._tgn_price(p_fallback numeric DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric;
BEGIN
  BEGIN
    v := public.get_live_tung_price_usd();
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;
  IF v IS NULL OR v <= 0 THEN
    v := CASE WHEN p_fallback > 0 THEN p_fallback END;
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public._tgn_usdt(p_tung numeric, p_price numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_price IS NULL OR p_price <= 0 OR p_tung IS NULL OR p_tung <= 0 THEN ''
    WHEN p_tung * p_price < 0.01 THEN ' (≈ ' || trim(to_char(p_tung * p_price, 'FM0.0000')) || ' USDT)'
    ELSE ' (≈ ' || trim(to_char(round(p_tung * p_price, 2), 'FM999,999,990.00')) || ' USDT)'
  END;
$$;

-- Post en todos los canales/grupos de Telegram activos (telegram_groups.is_enabled)
CREATE OR REPLACE FUNCTION public._tgn_channel_post(p_subject text, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok text;
BEGIN
  SELECT internal_broadcast_token INTO v_tok FROM public.market_notification_config WHERE id = 1;
  IF v_tok IS NULL OR v_tok = '' THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'http://172.18.0.1:9002/internal-telegram-broadcast',
    body := jsonb_build_object('token', v_tok, 'subject', left(p_subject, 200), 'body', left(p_body, 3700)),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[TGNOTIFY1] canal: %', SQLERRM;
END;
$$;

-- DM personal (solo si el jugador tiene Telegram vinculado)
CREATE OR REPLACE FUNCTION public._tgn_dm(p_user uuid, p_title text, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.telegram_links WHERE user_id = p_user AND telegram_id IS NOT NULL) THEN
    RETURN;
  END IF;
  -- El worker separa la salida de psql por '|': nunca debe aparecer en el payload
  INSERT INTO public.notification_queue (user_id, ntype, payload, channels)
  VALUES (p_user, 'tg_text',
          replace(jsonb_build_object('title', left(p_title, 200), 'body', left(p_body, 3500))::text, '|', '/')::jsonb,
          ARRAY['telegram']);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[TGNOTIFY1] dm: %', SQLERRM;
END;
$$;

-- 2) Apuestas deportivas: al liquidar (settled) o anular (void)
CREATE OR REPLACE FUNCTION public._trg_sports_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nl       constant text := E'\n';
  c_url    constant text := 'https://falcoxnova.com/game/sports';
  v_price  numeric;
  v_title  text;
  v_score  text;
  v_winner text;
  v_pot    numeric;
  v_paid   numeric;
  v_users  integer;
  v_nwin   integer;
  v_nlose  integer := 0;
  v_list   text := '';
  v_llist  text := '';
  v_i      integer := 0;
  v_j      integer := 0;
  v_subj   text;
  v_body   text;
  v_extra  text;
  r        record;
BEGIN
  BEGIN
    SELECT COALESCE(sum(amount), 0), COALESCE(sum(payout), 0), count(DISTINCT user_id)
      INTO v_pot, v_paid, v_users
      FROM public.sports_bets WHERE match_id = NEW.id;
    IF v_users = 0 THEN
      RETURN NULL;
    END IF;

    v_price := public._tgn_price(NULL);
    v_title := NEW.home_name || ' vs ' || NEW.away_name;
    v_score := CASE WHEN NEW.state = 'settled' AND NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL
                    THEN NEW.home_name || ' ' || NEW.score_home || ' - ' || NEW.score_away || ' ' || NEW.away_name
                    ELSE v_title END;
    v_winner := CASE
      WHEN NEW.state = 'void' THEN '🚫 Partido anulado: ' || COALESCE(NEW.void_reason, 'sin resultado oficial')
      WHEN NEW.result = 'H' THEN '🏁 Ganó: ' || NEW.home_name
      WHEN NEW.result = 'A' THEN '🏁 Ganó: ' || NEW.away_name
      ELSE '🤝 Resultado: Empate' END;

    -- Reporte (Mensajes) + DM por apostante
    FOR r IN
      SELECT b.user_id,
             sum(b.amount) AS staked,
             sum(b.payout) AS paid,
             bool_or(b.status = 'won') AS won,
             bool_and(b.status = 'refunded') AS refunded,
             string_agg(DISTINCT CASE b.pick WHEN 'H' THEN NEW.home_name WHEN 'A' THEN NEW.away_name ELSE 'Empate' END, ' + ') AS picks
        FROM public.sports_bets b
       WHERE b.match_id = NEW.id
       GROUP BY b.user_id
    LOOP
      IF r.won THEN
        v_subj := '🏆 Apuesta ganada: ' || v_title;
        v_body := '💰 Cobras: ' || public._tgn_fmt(r.paid) || ' TUNG' || public._tgn_usdt(r.paid, v_price) || nl || nl
               || '⚽ ' || v_score || nl
               || v_winner || nl
               || '🎯 Tu pronóstico: ' || r.picks || nl
               || '💵 Apostaste: ' || public._tgn_fmt(r.staked) || ' TUNG' || nl
               || '📈 Ganancia neta: ' || CASE WHEN r.paid >= r.staked THEN '+' ELSE '-' END
               || public._tgn_fmt(abs(r.paid - r.staked)) || ' TUNG' || public._tgn_usdt(abs(r.paid - r.staked), v_price) || nl || nl
               || CASE WHEN r.paid >= r.staked THEN '🎉 ¡Felicidades! El premio ya está en tu saldo.'
                       ELSE '✅ Acertaste parte de tu apuesta. El premio ya está en tu saldo.' END;
      ELSIF r.refunded THEN
        v_subj := '↩️ Apuesta devuelta: ' || v_title;
        v_body := '↩️ Te devolvemos: ' || public._tgn_fmt(r.paid) || ' TUNG' || public._tgn_usdt(r.paid, v_price) || nl || nl
               || '⚽ ' || v_score || nl
               || v_winner || nl
               || '🎯 Tu pronóstico: ' || r.picks || nl
               || '💵 Apostaste: ' || public._tgn_fmt(r.staked) || ' TUNG' || nl || nl
               || CASE WHEN NEW.state = 'void'
                       THEN 'Se devuelve el 100% de lo apostado, sin comisión.'
                       ELSE 'Nadie acertó el resultado: se devuelve lo apostado menos la comisión.' END;
      ELSE
        v_subj := '❌ Apuesta perdida: ' || v_title;
        v_body := '💸 Apostaste: ' || public._tgn_fmt(r.staked) || ' TUNG' || public._tgn_usdt(r.staked, v_price) || nl || nl
               || '⚽ ' || v_score || nl
               || v_winner || nl
               || '🎯 Tu pronóstico: ' || r.picks || nl || nl
               || 'Esta vez no hubo suerte. ¡La próxima es tuya! 💪';
      END IF;

      -- Sustituye el aviso simple que inserta _sports_settle/_sports_void en esta misma transaccion
      DELETE FROM public.messages
       WHERE recipient_id = r.user_id AND sender_id IS NULL AND message_type = 'system'
         AND created_at >= now() - interval '1 minute'
         AND subject IN ('Apuesta ganada: ' || v_title, 'Apuesta perdida: ' || v_title, 'Apuesta devuelta: ' || v_title);

      INSERT INTO public.messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (r.user_id, NULL, left(v_subj, 200), v_body, 'system');

      PERFORM public._tgn_dm(r.user_id, v_subj, v_body || nl || nl || '👉 ' || c_url);
    END LOOP;

    -- Post en los canales (solo partidos liquidados)
    IF NEW.state = 'settled' THEN
      SELECT count(DISTINCT user_id) INTO v_nwin
        FROM public.sports_bets WHERE match_id = NEW.id AND status = 'won';

      IF v_nwin > 0 THEN
        FOR r IN
          SELECT COALESCE(NULLIF(btrim(p.username), ''), 'Comandante') AS uname,
                 sum(b.amount) AS staked, sum(b.payout) AS paid
            FROM public.sports_bets b
            LEFT JOIN public.profiles p ON p.id = b.user_id
           WHERE b.match_id = NEW.id
           GROUP BY b.user_id, p.username
          HAVING bool_or(b.status = 'won')
           ORDER BY sum(b.payout) DESC
           LIMIT 15
        LOOP
          v_i := v_i + 1;
          v_list := v_list || CASE v_i WHEN 1 THEN '🥇 ' WHEN 2 THEN '🥈 ' WHEN 3 THEN '🥉 ' ELSE '🔹 ' END
                 || r.uname || ': apostó ' || public._tgn_fmt(r.staked) || ' → ganó '
                 || public._tgn_fmt(r.paid) || ' TUNG' || public._tgn_usdt(r.paid, v_price) || nl;
        END LOOP;
        IF v_nwin > v_i THEN
          v_list := v_list || '…y ' || (v_nwin - v_i) || ' ganadores más' || nl;
        END IF;
        v_extra := '🏆 GANADORES' || nl || v_list;

        SELECT count(*) INTO v_nlose FROM (
          SELECT 1 FROM public.sports_bets WHERE match_id = NEW.id
           GROUP BY user_id HAVING NOT bool_or(status = 'won')) z;
        IF v_nlose > 0 THEN
          FOR r IN
            SELECT COALESCE(NULLIF(btrim(p.username), ''), 'Comandante') AS uname,
                   sum(b.amount) AS staked,
                   string_agg(DISTINCT CASE b.pick WHEN 'H' THEN NEW.home_name WHEN 'A' THEN NEW.away_name ELSE 'Empate' END, ' + ') AS picks
              FROM public.sports_bets b
              LEFT JOIN public.profiles p ON p.id = b.user_id
             WHERE b.match_id = NEW.id
             GROUP BY b.user_id, p.username
            HAVING NOT bool_or(b.status = 'won')
             ORDER BY sum(b.amount) DESC
             LIMIT 15
          LOOP
            v_j := v_j + 1;
            v_llist := v_llist || '❌ ' || r.uname || ': apostó a ' || r.picks || ' → perdió '
                    || public._tgn_fmt(r.staked) || ' TUNG' || public._tgn_usdt(r.staked, v_price) || nl;
          END LOOP;
          IF v_nlose > v_j THEN
            v_llist := v_llist || '…y ' || (v_nlose - v_j) || ' perdedores más' || nl;
          END IF;
          v_extra := v_extra || nl || '💀 PERDEDORES' || nl || v_llist;
        END IF;
      ELSE
        v_extra := '😱 ¡Nadie acertó el resultado! Se devolvió lo apostado (menos comisión) a los '
                || v_users || ' apostantes.' || nl;
      END IF;

      v_body := '🏟 ' || NEW.competition_name || nl
             || '⚽ ' || v_score || nl
             || v_winner || nl || nl
             || v_extra || nl
             || '💰 Bote total: ' || public._tgn_fmt(v_pot) || ' TUNG' || public._tgn_usdt(v_pot, v_price) || nl
             || CASE WHEN v_nwin > 0 THEN '🎉 Repartido a ganadores: ' ELSE '↩️ Devuelto: ' END
             || public._tgn_fmt(v_paid) || ' TUNG' || public._tgn_usdt(v_paid, v_price) || nl
             || '👥 Apostantes: ' || v_users || '  ·  🏆 Ganadores: ' || v_nwin
             || CASE WHEN v_nlose > 0 THEN '  ·  ❌ Perdedores: ' || v_nlose ELSE '' END || nl || nl
             || '🔥 ¡El próximo ganador puedes ser tú!' || nl
             || '👉 Apuesta en ' || c_url;

      PERFORM public._tgn_channel_post('⚽ APUESTAS DEPORTIVAS · RESULTADO FINAL', v_body);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[TGNOTIFY1] sports % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sports_notify ON public.sports_matches;
CREATE TRIGGER trg_sports_notify
  AFTER UPDATE OF state ON public.sports_matches
  FOR EACH ROW
  WHEN (OLD.state IN ('open', 'closed') AND NEW.state IN ('settled', 'void'))
  EXECUTE FUNCTION public._trg_sports_notify();

-- 3) Batalla de Naves: al terminar con ganador
CREATE OR REPLACE FUNCTION public._trg_battleship_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nl       constant text := E'\n';
  c_url    constant text := 'https://falcoxnova.com/game/battleship';
  v_loser  uuid;
  v_wname  text;
  v_lname  text;
  v_price  numeric;
  v_hits   integer;
  v_shots  integer;
  v_acc    text;
  v_reason text;
  v_head   text;
  v_body   text;
BEGIN
  BEGIN
    v_loser := CASE WHEN NEW.winner = NEW.player1 THEN NEW.player2 ELSE NEW.player1 END;
    SELECT COALESCE(NULLIF(btrim(username), ''), 'Comandante') INTO v_wname FROM public.profiles WHERE id = NEW.winner;
    SELECT COALESCE(NULLIF(btrim(username), ''), 'Comandante') INTO v_lname FROM public.profiles WHERE id = v_loser;
    v_wname := COALESCE(v_wname, 'Comandante');
    v_lname := COALESCE(v_lname, 'Comandante');
    v_price := public._tgn_price(NEW.tung_price);

    IF NEW.winner = NEW.player1 THEN
      v_hits := NEW.p1_hits; v_shots := NEW.p1_shots;
    ELSE
      v_hits := NEW.p2_hits; v_shots := NEW.p2_shots;
    END IF;
    v_acc := v_hits || '/' || v_shots || ' disparos'
          || CASE WHEN v_shots > 0 THEN ' (' || round(100.0 * v_hits / v_shots) || '% de acierto)' ELSE '' END;
    v_reason := CASE NEW.end_reason
      WHEN 'fleet_destroyed' THEN '💥 Flota enemiga hundida por completo'
      WHEN 'surrender' THEN '🏳️ El rival se rindió'
      WHEN 'timeout' THEN '⏱ El rival se quedó sin tiempo'
      ELSE '🏁 Partida terminada' END;
    v_head := CASE NEW.end_reason
      WHEN 'fleet_destroyed' THEN '🏆 ' || v_wname || ' hundió toda la flota de ' || v_lname
      WHEN 'surrender' THEN '🏆 ' || v_wname || ' hizo rendirse a ' || v_lname
      ELSE '🏆 ' || v_wname || ' derrotó a ' || v_lname END;

    -- Ganador
    v_body := '💰 Premio: ' || public._tgn_fmt(NEW.payout) || ' TUNG' || public._tgn_usdt(NEW.payout, v_price) || nl || nl
           || '⚓ Has derrotado a ' || v_lname || nl
           || '💵 Apuesta: ' || public._tgn_fmt(NEW.stake) || ' TUNG' || nl
           || '🎯 Precisión: ' || v_acc || nl
           || v_reason || nl || nl
           || '🎉 ¡Victoria! El premio ya está en tu saldo.';
    INSERT INTO public.messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (NEW.winner, NULL, left('🏆 Victoria en Batalla de Naves vs ' || v_lname, 200), v_body, 'system');
    PERFORM public._tgn_dm(NEW.winner, '🏆 ¡Victoria en Batalla de Naves!', v_body || nl || nl || '👉 ' || c_url);

    -- Perdedor
    IF v_loser IS NOT NULL THEN
      v_body := '💸 Apostaste: ' || public._tgn_fmt(NEW.stake) || ' TUNG' || public._tgn_usdt(NEW.stake, v_price) || nl || nl
             || '⚓ Has perdido contra ' || v_wname || nl
             || CASE NEW.end_reason
                  WHEN 'fleet_destroyed' THEN '💥 Tu flota fue hundida'
                  WHEN 'surrender' THEN '🏳️ Te rendiste'
                  WHEN 'timeout' THEN '⏱ Se agotó tu tiempo'
                  ELSE '🏁 Partida terminada' END || nl || nl
             || '💪 ¡Pide la revancha y recupera tus TUNG!';
      INSERT INTO public.messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (v_loser, NULL, left('💥 Derrota en Batalla de Naves vs ' || v_wname, 200), v_body, 'system');
      PERFORM public._tgn_dm(v_loser, '💥 Derrota en Batalla de Naves', v_body || nl || nl || '👉 ' || c_url);
    END IF;

    -- Canales
    v_body := v_head || nl || nl
           || '💰 Premio: ' || public._tgn_fmt(NEW.payout) || ' TUNG' || public._tgn_usdt(NEW.payout, v_price) || nl
           || '🎲 Apuesta: ' || public._tgn_fmt(NEW.stake) || ' TUNG por jugador' || public._tgn_usdt(NEW.stake, v_price) || nl
           || '🎯 Precisión del ganador: ' || v_acc || nl
           || v_reason || nl || nl
           || '⚔️ ¿Te atreves a retar al campeón?' || nl
           || '👉 Juega en ' || c_url;
    PERFORM public._tgn_channel_post('⚓ BATALLA DE NAVES · NUEVO GANADOR', v_body);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[TGNOTIFY1] battleship % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_battleship_notify ON public.battleship_matches;
CREATE TRIGGER trg_battleship_notify
  AFTER UPDATE OF status ON public.battleship_matches
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'finished' AND NEW.status = 'finished' AND NEW.winner IS NOT NULL)
  EXECUTE FUNCTION public._trg_battleship_notify();

REVOKE ALL ON FUNCTION public._tgn_price(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tgn_channel_post(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tgn_dm(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._trg_sports_notify() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._trg_battleship_notify() FROM PUBLIC, anon, authenticated;
