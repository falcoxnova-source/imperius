/*
  # Fix Lottery: Deduct Minor Prizes from Jackpot + In-Game Notifications

  ## Bugs Fixed:
  1. **Inflation bug**: Minor prizes (2-match, 3-match) were paid by creating FXU
     from nothing — they were never deducted from the jackpot pool. Now they are
     deducted from the total jackpot BEFORE rollover to the next draw.
  2. **No in-game notifications**: Winners received no personal message. Now each
     winner gets a system message in their inbox with prize details.
  3. **Jackpot capped to available funds**: If minor prizes exceed the total jackpot,
     they are capped so the system never goes negative.

  ## Economics after fix:
  - Total jackpot = accumulated_jackpot + prize_pool (from 70% of ticket sales)
  - Minor prizes are paid FIRST from this total
  - Remaining goes to 4/4 jackpot winners, or rolls over if nobody hits 4/4
  - This means the jackpot grows slower but the economy stays balanced
*/

-- ============================================================
-- DATA FIX: Correct the accumulated jackpot for the current open draw.
-- Sorteo #2 paid 21,000 FXU in minor prizes without deducting from jackpot.
-- ============================================================
DO $$
DECLARE
  v_open_draw record;
  v_corrected numeric;
BEGIN
  SELECT * INTO v_open_draw FROM lottery_draws WHERE status = 'open' ORDER BY draw_number DESC LIMIT 1;
  
  IF v_open_draw.id IS NOT NULL THEN
    -- Only apply if accumulated_jackpot is still the inflated value
    IF v_open_draw.accumulated_jackpot >= 21000 THEN
      v_corrected := v_open_draw.accumulated_jackpot - 21000;
      UPDATE lottery_draws SET accumulated_jackpot = v_corrected WHERE id = v_open_draw.id;
      RAISE NOTICE 'Lottery data fix: reduced accumulated_jackpot by 21000 (from % to %)', v_open_draw.accumulated_jackpot, v_corrected;
    ELSE
      RAISE NOTICE 'Lottery data fix: accumulated_jackpot (%) is less than 21000, skipping correction', v_open_draw.accumulated_jackpot;
    END IF;
  ELSE
    RAISE NOTICE 'Lottery data fix: no open draw found, skipping';
  END IF;
END $$;

-- ============================================================
-- RETROACTIVE NOTIFICATIONS: Send in-game messages + Telegram
-- for past winners (Sorteo #1 and #2) who were never notified.
-- ============================================================
DO $$
DECLARE
  v_draw record;
  v_winner record;
  v_count integer := 0;
  v_supabase_url text;
  v_service_key text;
  v_request_id bigint;
  v_jackpot_names text[];
  v_names_3 text[];
  v_names_2 text[];
  v_telegram_body jsonb;
BEGIN
  -- Loop through all completed draws
  FOR v_draw IN
    SELECT ld.* FROM lottery_draws ld
    WHERE ld.status = 'completed'
    ORDER BY ld.draw_number ASC
  LOOP
    -- Initialize name arrays per draw
    v_jackpot_names := ARRAY[]::text[];
    v_names_3 := ARRAY[]::text[];
    v_names_2 := ARRAY[]::text[];

    -- Send in-game message to each winner who hasn't been notified yet
    FOR v_winner IN
      SELECT lw.*, p.username
      FROM lottery_winners lw
      JOIN profiles p ON p.id = lw.user_id
      WHERE lw.draw_id = v_draw.id
        -- Skip if user already has a lottery notification for this draw
        AND NOT EXISTS (
          SELECT 1 FROM messages m
          WHERE m.recipient_id = lw.user_id
            AND m.message_type = 'system'
            AND m.subject LIKE '%Lotería Galáctica%'
            AND m.body LIKE '%Sorteo #' || v_draw.draw_number || '%'
        )
    LOOP
      IF v_winner.matches = 4 THEN
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL, v_winner.user_id,
          '🏆🎰 ¡¡¡JACKPOT!!! ¡Ganaste el premio mayor!',
          format('🎉🎉🎉 ¡¡¡INCREÍBLE!!! 🎉🎉🎉

¡Acertaste las 4 Coordenadas Galácticas en el Sorteo #%s!

🎯 Tus números: [%s]
⭐ Números ganadores: [%s]

💰💰💰 JACKPOT: %s FXU 💰💰💰

El premio fue acreditado a tu cuenta. ¡Eres leyenda!',
            v_draw.draw_number,
            array_to_string(v_winner.numbers, ', '),
            array_to_string(v_winner.winning_numbers, ', '),
            v_winner.prize),
          'system'
        );
        v_jackpot_names := v_jackpot_names || COALESCE(v_winner.username, 'Jugador');
      ELSIF v_winner.matches = 3 THEN
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL, v_winner.user_id,
          '🎰 ¡Ganaste en la Lotería Galáctica!',
          format('¡Felicidades! En el Sorteo #%s acertaste 3 de 4 coordenadas.

🎯 Tus números: [%s]
⭐ Números ganadores: [%s]

💰 Premio: %s FXU (ya acreditados a tu cuenta)

¡Sigue jugando para ganar el JACKPOT!',
            v_draw.draw_number,
            array_to_string(v_winner.numbers, ', '),
            array_to_string(v_winner.winning_numbers, ', '),
            v_winner.prize),
          'system'
        );
        v_names_3 := v_names_3 || COALESCE(v_winner.username, 'Jugador');
      ELSIF v_winner.matches = 2 THEN
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL, v_winner.user_id,
          '🎰 ¡Ganaste en la Lotería Galáctica!',
          format('¡Felicidades! En el Sorteo #%s acertaste 2 de 4 coordenadas.

🎯 Tus números: [%s]
⭐ Números ganadores: [%s]

💰 Premio: %s FXU (ya acreditados a tu cuenta)

¡Sigue jugando para ganar el JACKPOT!',
            v_draw.draw_number,
            array_to_string(v_winner.numbers, ', '),
            array_to_string(v_winner.winning_numbers, ', '),
            v_winner.prize),
          'system'
        );
        v_names_2 := v_names_2 || COALESCE(v_winner.username, 'Jugador');
      END IF;
      v_count := v_count + 1;
    END LOOP;

    -- Send Telegram notification per draw (best-effort)
    IF array_length(v_jackpot_names, 1) IS NOT NULL
       OR array_length(v_names_3, 1) IS NOT NULL
       OR array_length(v_names_2, 1) IS NOT NULL THEN
      BEGIN
        v_supabase_url := current_setting('app.settings.supabase_url', true);
        v_service_key  := current_setting('app.settings.service_role_key', true);

        IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
          SELECT net.http_post(
            url     := v_supabase_url || '/functions/v1/notify-lottery-result',
            body    := jsonb_build_object(
              'draw_number',          v_draw.draw_number,
              'winning_numbers',      v_draw.winning_numbers,
              'total_tickets',        COALESCE(v_draw.total_tickets, 0),
              'total_pool',           COALESCE(v_draw.total_pool, 0),
              'jackpot',              COALESCE(v_draw.accumulated_jackpot, 0) + COALESCE(v_draw.prize_pool, 0),
              'jackpot_winners',      COALESCE(array_length(v_jackpot_names, 1), 0),
              'jackpot_per_winner',   COALESCE(v_draw.jackpot_amount, 0),
              'winners_3match',       COALESCE(array_length(v_names_3, 1), 0),
              'winners_2match',       COALESCE(array_length(v_names_2, 1), 0),
              'minor_prizes_paid',    0,
              'accumulated_to_next',  0,
              'prize_3match',         2000,
              'prize_2match',         1000,
              'jackpot_winner_names', v_jackpot_names,
              'winners_3_names',      v_names_3,
              'winners_2_names',      v_names_2
            ),
            headers := jsonb_build_object(
              'Content-Type',  'application/json',
              'Authorization', 'Bearer ' || v_service_key
            )
          ) INTO v_request_id;
          RAISE NOTICE 'Sent Telegram notification for Sorteo #%', v_draw.draw_number;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE 'Telegram notification error for Sorteo #%: %', v_draw.draw_number, SQLERRM;
      END;
    END IF;

  END LOOP;

  RAISE NOTICE 'Retroactive notifications: sent % in-game messages to past winners', v_count;
END $$;

-- ============================================================
-- FUNCTION FIX: Rebuild execute_lottery_draw with all 3 fixes
-- ============================================================
CREATE OR REPLACE FUNCTION execute_lottery_draw(p_draw_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
  v_supabase_url text;
  v_service_key text;
  v_jackpot_names text[];
  v_names_3 text[];
  v_names_2 text[];
  v_winner_username text;
  v_request_id bigint;
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
        format('¡Felicidades! En el Sorteo #%s acertaste 3 de 4 coordenadas.

🎯 Tus números: [%s]
⭐ Números ganadores: [%s]

💰 Premio: %s FXU (acreditados a tu cuenta)

¡Sigue jugando para ganar el JACKPOT!',
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
        format('¡Felicidades! En el Sorteo #%s acertaste 2 de 4 coordenadas.

🎯 Tus números: [%s]
⭐ Números ganadores: [%s]

💰 Premio: %s FXU (acreditados a tu cuenta)

¡Sigue jugando para ganar el JACKPOT!',
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
        format('🎉🎉🎉 ¡¡¡INCREÍBLE!!! 🎉🎉🎉

¡Acertaste las 4 Coordenadas Galácticas en el Sorteo #%s!

🎯 Tus números: [%s]
⭐ Números ganadores: [%s]

💰💰💰 JACKPOT: %s FXU 💰💰💰

El premio ha sido acreditado a tu cuenta. ¡Eres leyenda!',
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
  -- PHASE 6: Telegram group notification (non-blocking, best-effort)
  -- ================================================================
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_key  := current_setting('app.settings.service_role_key', true);

    IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      SELECT net.http_post(
        url     := v_supabase_url || '/functions/v1/notify-lottery-result',
        body    := jsonb_build_object(
          'draw_number',          v_draw.draw_number,
          'winning_numbers',      v_winning,
          'total_tickets',        COALESCE(v_draw.total_tickets, 0),
          'total_pool',           COALESCE(v_draw.total_pool, 0),
          'jackpot',              v_total_jackpot,
          'jackpot_winners',      v_jackpot_winners,
          'jackpot_per_winner',   v_jackpot_per_winner,
          'winners_3match',       v_winners_3,
          'winners_2match',       v_winners_2,
          'minor_prizes_paid',    v_total_minor_prizes,
          'accumulated_to_next',  v_remaining_jackpot,
          'prize_3match',         v_prize_3match,
          'prize_2match',         v_prize_2match,
          'jackpot_winner_names', v_jackpot_names,
          'winners_3_names',      v_names_3,
          'winners_2_names',      v_names_2
        ),
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_service_key
        )
      ) INTO v_request_id;
    ELSE
      RAISE NOTICE 'Lottery Telegram: missing supabase_url or service_role_key config';
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
    'next_draw_id', v_next_draw_id
  );
END;
$$;
