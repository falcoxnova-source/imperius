/*
  # Fix Loteria: notificacion Telegram real (broadcast interno)

  ## Problema detectado en produccion
  - La FASE 6 de `execute_lottery_draw` llamaba a la edge function
    `/functions/v1/notify-lottery-result`, que NO EXISTE en este servidor
    (no hay runtime Deno). Ademas dependia de `app.settings.supabase_url` y
    `app.settings.service_role_key`, que estan VACIOS => el `IF` se saltaba
    en silencio y NUNCA se envio una sola notificacion de loteria a Telegram.

  ## Solucion
  - Se reemplaza la FASE 6 por el microservicio interno que SI funciona:
    POST http://172.18.0.1:9002/internal-telegram-broadcast
    con {token, subject, body} y token de market_notification_config.
  - Difunde a TODOS los canales activos de public.telegram_groups
    (TUNG y FalcoX Universe).
  - El mensaje lista CADA ganador con su nombre y los TUNG exactos que gano.
  - Si NO hay ganadores igualmente se publica el resultado y el bote acumulado
    (requisito: "siempre informa, todos deben saber").

  ## NO se modifica la logica de premios (FASES 1-5). Solo la notificacion.
*/

SET client_encoding TO 'UTF8';

CREATE OR REPLACE FUNCTION public.execute_lottery_draw(p_draw_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_is_admin boolean;
  v_draw record;
  v_winning integer[];
  v_num integer;
  v_ticket record;
  v_match_count integer;
  v_prize_3match integer;
  v_prize_2match integer;
  v_total_minor_prizes numeric := 0;
  v_jackpot_winners integer := 0;
  v_jackpot_per_winner numeric := 0;
  v_remaining_jackpot numeric := 0;
  v_total_jackpot numeric := 0;
  v_jackpot_after_minors numeric := 0;
  v_winners_3 integer := 0;
  v_winners_2 integer := 0;
  v_next_draw_id uuid;
  -- Telegram notification vars
  v_jackpot_names text[];
  v_names_3 text[];
  v_names_2 text[];
  v_winner_username text;
  v_request_id bigint;
  v_tg_token text;
  v_tg_subject text;
  v_tg_body text;
  v_i integer;
  v_shown integer;
  v_total_paid numeric := 0;
  v_next_draw_number integer;
  -- In-game message vars
  v_msg_subject text;
  v_msg_body text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF p_draw_id IS NOT NULL THEN
    SELECT * INTO v_draw FROM lottery_draws WHERE id = p_draw_id AND status IN ('open', 'closed') FOR UPDATE;
  ELSE
    SELECT * INTO v_draw FROM lottery_draws WHERE status = 'open' ORDER BY closes_at ASC LIMIT 1 FOR UPDATE;
  END IF;

  IF v_draw.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay sorteo pendiente');
  END IF;

  -- Generate 4 unique winning numbers from 1-30
  v_winning := ARRAY[]::integer[];
  WHILE array_length(v_winning, 1) IS NULL OR array_length(v_winning, 1) < 4 LOOP
    v_num := FLOOR(random() * 30 + 1)::integer;
    IF NOT v_num = ANY(v_winning) THEN
      v_winning := v_winning || v_num;
    END IF;
  END LOOP;
  SELECT ARRAY(SELECT unnest(v_winning) ORDER BY 1) INTO v_winning;

  -- Read prize config from game_settings
  SELECT COALESCE(value::integer, 500) INTO v_prize_3match FROM game_settings WHERE key = 'lottery_3match_prize';
  SELECT COALESCE(value::integer, 50)  INTO v_prize_2match FROM game_settings WHERE key = 'lottery_2match_prize';
  IF v_prize_3match IS NULL THEN v_prize_3match := 500; END IF;
  IF v_prize_2match IS NULL THEN v_prize_2match := 50;  END IF;

  v_total_jackpot := COALESCE(v_draw.accumulated_jackpot, 0) + COALESCE(v_draw.prize_pool, 0);

  PERFORM _internal_set_fxu_context();

  -- Initialize winner name arrays
  v_jackpot_names := ARRAY[]::text[];
  v_names_3 := ARRAY[]::text[];
  v_names_2 := ARRAY[]::text[];

  -- ================================================================
  -- PHASE 1: Score all tickets and count winners (no payments yet)
  -- ================================================================
  FOR v_ticket IN SELECT * FROM lottery_tickets WHERE draw_id = v_draw.id LOOP
    SELECT COUNT(*) INTO v_match_count
    FROM unnest(v_ticket.numbers) n WHERE n = ANY(v_winning);

    UPDATE lottery_tickets SET matches = v_match_count WHERE id = v_ticket.id;

    IF v_match_count = 4 THEN
      v_jackpot_winners := v_jackpot_winners + 1;
    ELSIF v_match_count = 3 THEN
      v_winners_3 := v_winners_3 + 1;
      v_total_minor_prizes := v_total_minor_prizes + v_prize_3match;
    ELSIF v_match_count = 2 THEN
      v_winners_2 := v_winners_2 + 1;
      v_total_minor_prizes := v_total_minor_prizes + v_prize_2match;
    END IF;
  END LOOP;

  -- ================================================================
  -- PHASE 2: Cap minor prizes to available jackpot (prevent inflation)
  -- ================================================================
  IF v_total_minor_prizes > v_total_jackpot THEN
    v_total_minor_prizes := v_total_jackpot;
  END IF;

  -- Jackpot available for 4/4 winners AFTER paying minor prizes
  v_jackpot_after_minors := v_total_jackpot - v_total_minor_prizes;

  -- ================================================================
  -- PHASE 3: Pay minor prize winners (2 and 3 match)
  -- ================================================================
  -- Pay 3-match winners
  IF v_winners_3 > 0 THEN
    FOR v_ticket IN SELECT lt.*, p.username
      FROM lottery_tickets lt
      JOIN profiles p ON p.id = lt.user_id
      WHERE lt.draw_id = v_draw.id AND lt.matches = 3
    LOOP
      UPDATE profiles SET fxu_balance = fxu_balance + v_prize_3match WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_prize_3match WHERE id = v_ticket.id;
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 3, v_prize_3match, v_ticket.numbers, v_winning);

      v_winner_username := COALESCE(v_ticket.username, 'Jugador');
      v_names_3 := v_names_3 || v_winner_username;

      -- Send in-game notification
      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      VALUES (
        NULL,
        v_ticket.user_id,
        '🎰 ¡Ganaste en la Lotería Galáctica!',
        format(E'¡Felicidades! En el Sorteo #%s acertaste 3 de 4 coordenadas.\n\n🎯 Tus números: [%s]\n⭐ Números ganadores: [%s]\n\n💰 Premio: %s FXU (acreditados a tu cuenta)\n\n¡Sigue jugando para ganar el JACKPOT!',
          v_draw.draw_number,
          array_to_string(v_ticket.numbers, ', '),
          array_to_string(v_winning, ', '),
          v_prize_3match),
        'system'
      );
    END LOOP;
  END IF;

  -- Pay 2-match winners
  IF v_winners_2 > 0 THEN
    FOR v_ticket IN SELECT lt.*, p.username
      FROM lottery_tickets lt
      JOIN profiles p ON p.id = lt.user_id
      WHERE lt.draw_id = v_draw.id AND lt.matches = 2
    LOOP
      UPDATE profiles SET fxu_balance = fxu_balance + v_prize_2match WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_prize_2match WHERE id = v_ticket.id;
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 2, v_prize_2match, v_ticket.numbers, v_winning);

      v_winner_username := COALESCE(v_ticket.username, 'Jugador');
      v_names_2 := v_names_2 || v_winner_username;

      -- Send in-game notification
      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      VALUES (
        NULL,
        v_ticket.user_id,
        '🎰 ¡Ganaste en la Lotería Galáctica!',
        format(E'¡Felicidades! En el Sorteo #%s acertaste 2 de 4 coordenadas.\n\n🎯 Tus números: [%s]\n⭐ Números ganadores: [%s]\n\n💰 Premio: %s FXU (acreditados a tu cuenta)\n\n¡Sigue jugando para ganar el JACKPOT!',
          v_draw.draw_number,
          array_to_string(v_ticket.numbers, ', '),
          array_to_string(v_winning, ', '),
          v_prize_2match),
        'system'
      );
    END LOOP;
  END IF;

  -- ================================================================
  -- PHASE 4: Pay jackpot winners (4/4 match) from remaining pool
  -- ================================================================
  IF v_jackpot_winners > 0 THEN
    v_jackpot_per_winner := FLOOR(v_jackpot_after_minors / v_jackpot_winners);
    v_remaining_jackpot := 0;

    FOR v_ticket IN SELECT lt.*, p.username
      FROM lottery_tickets lt
      JOIN profiles p ON p.id = lt.user_id
      WHERE lt.draw_id = v_draw.id AND lt.matches = 4
    LOOP
      UPDATE profiles SET fxu_balance = fxu_balance + v_jackpot_per_winner WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_jackpot_per_winner WHERE id = v_ticket.id;
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 4, v_jackpot_per_winner, v_ticket.numbers, v_winning);

      v_winner_username := COALESCE(v_ticket.username, 'Jugador');
      v_jackpot_names := v_jackpot_names || v_winner_username;

      -- Send in-game notification for JACKPOT winner
      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      VALUES (
        NULL,
        v_ticket.user_id,
        '🏆🎰 ¡¡¡JACKPOT!!! ¡Ganaste el premio mayor!',
        format(E'🎉🎉🎉 ¡¡¡INCREÍBLE!!! 🎉🎉🎉\n\n¡Acertaste las 4 Coordenadas Galácticas en el Sorteo #%s!\n\n🎯 Tus números: [%s]\n⭐ Números ganadores: [%s]\n\n🏆💰🏆 JACKPOT: %s FXU 🏆💰🏆\n\nEl premio ha sido acreditado a tu cuenta. ¡Eres leyenda!',
          v_draw.draw_number,
          array_to_string(v_ticket.numbers, ', '),
          array_to_string(v_winning, ', '),
          v_jackpot_per_winner),
        'system'
      );
    END LOOP;

    UPDATE lottery_draws SET
      jackpot_winner_id = (SELECT user_id FROM lottery_tickets WHERE draw_id = v_draw.id AND matches = 4 LIMIT 1),
      jackpot_amount = v_jackpot_per_winner * v_jackpot_winners
    WHERE id = v_draw.id;
  ELSE
    -- No jackpot winner: rollover remaining (total - minor prizes paid)
    v_remaining_jackpot := v_jackpot_after_minors;
  END IF;

  -- ================================================================
  -- PHASE 5: Complete draw and create next one
  -- ================================================================
  UPDATE lottery_draws SET
    status = 'completed',
    winning_numbers = v_winning,
    drawn_at = now()
  WHERE id = v_draw.id;

  -- Next draw closes next Sunday 23:59 UTC (max 7 days)
  INSERT INTO lottery_draws (status, opens_at, closes_at, accumulated_jackpot)
  VALUES (
    'open',
    now(),
    (date_trunc('week', now() + interval '1 day') + interval '6 days 23 hours 59 minutes')::timestamptz,
    v_remaining_jackpot
  ) RETURNING id INTO v_next_draw_id;

  -- ================================================================
  -- PHASE 6: Telegram broadcast (internal service, non-blocking)
  -- Envia SIEMPRE, haya o no ganadores. Detalla nombre + TUNG de cada uno.
  -- ================================================================
  BEGIN
    v_total_paid := (v_winners_3 * v_prize_3match)
                  + (v_winners_2 * v_prize_2match)
                  + (v_jackpot_per_winner * v_jackpot_winners);

    SELECT draw_number INTO v_next_draw_number FROM lottery_draws WHERE id = v_next_draw_id;

    v_tg_subject := format('🎰 LOTERÍA GALÁCTICA — RESULTADO SORTEO #%s', v_draw.draw_number);

    v_tg_body := format(E'⭐ Números ganadores: %s\n\n🎫 Tickets vendidos: %s\n💰 Bote en juego: %s TUNG\n',
      array_to_string(v_winning, ' · '),
      COALESCE(v_draw.total_tickets, 0),
      trim(to_char(v_total_jackpot, 'FM999999999990')));

    IF v_jackpot_winners = 0 AND v_winners_3 = 0 AND v_winners_2 = 0 THEN
      v_tg_body := v_tg_body || format(E'\n😱 ¡NADIE acertó esta vez!\n\n🔥 El bote SUBE y se acumula para el Sorteo #%s:\n💎 %s TUNG en juego\n',
        COALESCE(v_next_draw_number, v_draw.draw_number + 1),
        trim(to_char(v_remaining_jackpot, 'FM999999999990')));
    ELSE
      -- JACKPOT 4/4
      IF v_jackpot_winners > 0 THEN
        v_tg_body := v_tg_body || E'\n🏆🎰 ¡¡¡JACKPOT!!! — 4 de 4 aciertos\n';
        v_shown := LEAST(COALESCE(array_length(v_jackpot_names, 1), 0), 15);
        FOR v_i IN 1..v_shown LOOP
          v_tg_body := v_tg_body || format(E'   🥇 %s → %s TUNG\n',
            v_jackpot_names[v_i], trim(to_char(v_jackpot_per_winner, 'FM999999999990')));
        END LOOP;
        IF COALESCE(array_length(v_jackpot_names, 1), 0) > v_shown THEN
          v_tg_body := v_tg_body || format(E'   …y %s más\n', array_length(v_jackpot_names, 1) - v_shown);
        END IF;
      END IF;

      -- 3 aciertos
      IF v_winners_3 > 0 THEN
        v_tg_body := v_tg_body || format(E'\n🥈 3 de 4 aciertos — %s TUNG cada uno\n',
          trim(to_char(v_prize_3match::numeric, 'FM999999999990')));
        v_shown := LEAST(COALESCE(array_length(v_names_3, 1), 0), 15);
        FOR v_i IN 1..v_shown LOOP
          v_tg_body := v_tg_body || format(E'   • %s → %s TUNG\n',
            v_names_3[v_i], trim(to_char(v_prize_3match::numeric, 'FM999999999990')));
        END LOOP;
        IF COALESCE(array_length(v_names_3, 1), 0) > v_shown THEN
          v_tg_body := v_tg_body || format(E'   …y %s más\n', array_length(v_names_3, 1) - v_shown);
        END IF;
      END IF;

      -- 2 aciertos
      IF v_winners_2 > 0 THEN
        v_tg_body := v_tg_body || format(E'\n🥉 2 de 4 aciertos — %s TUNG cada uno\n',
          trim(to_char(v_prize_2match::numeric, 'FM999999999990')));
        v_shown := LEAST(COALESCE(array_length(v_names_2, 1), 0), 15);
        FOR v_i IN 1..v_shown LOOP
          v_tg_body := v_tg_body || format(E'   • %s → %s TUNG\n',
            v_names_2[v_i], trim(to_char(v_prize_2match::numeric, 'FM999999999990')));
        END LOOP;
        IF COALESCE(array_length(v_names_2, 1), 0) > v_shown THEN
          v_tg_body := v_tg_body || format(E'   …y %s más\n', array_length(v_names_2, 1) - v_shown);
        END IF;
      END IF;

      v_tg_body := v_tg_body || format(E'\n💸 TOTAL REPARTIDO: %s TUNG entre %s ganador(es)\n',
        trim(to_char(v_total_paid, 'FM999999999990')),
        v_jackpot_winners + v_winners_3 + v_winners_2);

      v_tg_body := v_tg_body || format(E'🔥 Bote acumulado para el Sorteo #%s: %s TUNG\n',
        COALESCE(v_next_draw_number, v_draw.draw_number + 1),
        trim(to_char(v_remaining_jackpot, 'FM999999999990')));
    END IF;

    v_tg_body := v_tg_body || E'\n🎟️ Compra tus tickets en https://tung.xnova.xyz y gana TUNG cada semana. ¡Suerte, comandante! 🚀';

    SELECT internal_broadcast_token INTO v_tg_token
    FROM market_notification_config WHERE id = 1;

    IF v_tg_token IS NULL OR length(v_tg_token) = 0 THEN
      RAISE NOTICE 'Lottery Telegram: internal_broadcast_token no configurado';
    ELSE
      SELECT net.http_post(
        url     := 'http://172.18.0.1:9002/internal-telegram-broadcast',
        body    := jsonb_build_object(
          'token',   v_tg_token,
          'subject', v_tg_subject,
          'body',    v_tg_body
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
      ) INTO v_request_id;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Lottery Telegram notification error: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'draw_number', v_draw.draw_number,
    'winning_numbers', v_winning,
    'total_tickets', v_draw.total_tickets,
    'total_pool', v_draw.total_pool,
    'jackpot', v_total_jackpot,
    'jackpot_winners', v_jackpot_winners,
    'jackpot_per_winner', v_jackpot_per_winner,
    'winners_3match', v_winners_3,
    'winners_2match', v_winners_2,
    'minor_prizes_paid', v_total_minor_prizes,
    'accumulated_to_next', v_remaining_jackpot,
    'next_draw_id', v_next_draw_id,
    'telegram_request_id', v_request_id
  );
END;
$fn$;

NOTIFY pgrst, 'reload schema';
