-- =====================================================
-- RESET + FIX: Lotería Galáctica - Empezar desde 0
-- + Corregir duración a 7 días (siempre cierra domingo)
-- =====================================================

-- 1. Borrar ganadores
DELETE FROM lottery_winners;

-- 2. Borrar tickets
DELETE FROM lottery_tickets;

-- 3. Borrar todos los sorteos
DELETE FROM lottery_draws;

-- 4. Resetear el serial de draw_number para que empiece en 1
ALTER SEQUENCE lottery_draws_draw_number_seq RESTART WITH 1;

-- 5. Actualizar execute_lottery_draw (cierre = próximo domingo, no 12+ días)
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
  v_winners_3 integer := 0;
  v_winners_2 integer := 0;
  v_next_draw_id uuid;
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

  v_winning := ARRAY[]::integer[];
  WHILE array_length(v_winning, 1) IS NULL OR array_length(v_winning, 1) < 4 LOOP
    v_num := FLOOR(random() * 30 + 1)::integer;
    IF NOT v_num = ANY(v_winning) THEN
      v_winning := v_winning || v_num;
    END IF;
  END LOOP;
  SELECT ARRAY(SELECT unnest(v_winning) ORDER BY 1) INTO v_winning;

  SELECT COALESCE(value::integer, 500) INTO v_prize_3match FROM game_settings WHERE key = 'lottery_3match_prize';
  SELECT COALESCE(value::integer, 50) INTO v_prize_2match FROM game_settings WHERE key = 'lottery_2match_prize';
  IF v_prize_3match IS NULL THEN v_prize_3match := 500; END IF;
  IF v_prize_2match IS NULL THEN v_prize_2match := 50; END IF;

  v_total_jackpot := COALESCE(v_draw.accumulated_jackpot, 0) + COALESCE(v_draw.prize_pool, 0);

  PERFORM _internal_set_fxu_context();

  FOR v_ticket IN SELECT * FROM lottery_tickets WHERE draw_id = v_draw.id LOOP
    SELECT COUNT(*) INTO v_match_count
    FROM unnest(v_ticket.numbers) n WHERE n = ANY(v_winning);

    UPDATE lottery_tickets SET matches = v_match_count WHERE id = v_ticket.id;

    IF v_match_count = 4 THEN
      v_jackpot_winners := v_jackpot_winners + 1;
    ELSIF v_match_count = 3 THEN
      v_winners_3 := v_winners_3 + 1;
      v_total_minor_prizes := v_total_minor_prizes + v_prize_3match;
      UPDATE profiles SET fxu_balance = fxu_balance + v_prize_3match WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_prize_3match WHERE id = v_ticket.id;
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 3, v_prize_3match, v_ticket.numbers, v_winning);
    ELSIF v_match_count = 2 THEN
      v_winners_2 := v_winners_2 + 1;
      v_total_minor_prizes := v_total_minor_prizes + v_prize_2match;
      UPDATE profiles SET fxu_balance = fxu_balance + v_prize_2match WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_prize_2match WHERE id = v_ticket.id;
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 2, v_prize_2match, v_ticket.numbers, v_winning);
    END IF;
  END LOOP;

  IF v_jackpot_winners > 0 THEN
    v_jackpot_per_winner := FLOOR(v_total_jackpot / v_jackpot_winners);
    v_remaining_jackpot := 0;

    FOR v_ticket IN SELECT * FROM lottery_tickets WHERE draw_id = v_draw.id AND matches = 4 LOOP
      UPDATE profiles SET fxu_balance = fxu_balance + v_jackpot_per_winner WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_jackpot_per_winner WHERE id = v_ticket.id;
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 4, v_jackpot_per_winner, v_ticket.numbers, v_winning);
    END LOOP;

    UPDATE lottery_draws SET
      jackpot_winner_id = (SELECT user_id FROM lottery_tickets WHERE draw_id = v_draw.id AND matches = 4 LIMIT 1),
      jackpot_amount = v_jackpot_per_winner * v_jackpot_winners
    WHERE id = v_draw.id;
  ELSE
    v_remaining_jackpot := v_total_jackpot;
  END IF;

  UPDATE lottery_draws SET
    status = 'completed',
    winning_numbers = v_winning,
    drawn_at = now()
  WHERE id = v_draw.id;

  -- ★ FIX: Próximo domingo 23:59 UTC (max 7 días, no 12+)
  INSERT INTO lottery_draws (
    status, opens_at, closes_at, accumulated_jackpot
  ) VALUES (
    'open',
    now(),
    (date_trunc('week', now() + interval '1 day') + interval '6 days 23 hours 59 minutes')::timestamptz,
    v_remaining_jackpot
  ) RETURNING id INTO v_next_draw_id;

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

-- 6. Actualizar create_lottery_draw (cierre = próximo domingo, no 12+ días)
CREATE OR REPLACE FUNCTION create_lottery_draw(p_closes_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_existing record;
  v_accumulated numeric := 0;
  v_draw_id uuid;
  v_close_date timestamptz;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT * INTO v_existing FROM lottery_draws WHERE status = 'open' LIMIT 1 FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya hay un sorteo activo (#' || v_existing.draw_number || '). Ciérralo primero.');
  END IF;

  SELECT COALESCE(accumulated_jackpot, 0) + COALESCE(prize_pool, 0)
  INTO v_accumulated
  FROM lottery_draws WHERE status = 'completed'
  AND jackpot_winner_id IS NULL
  ORDER BY drawn_at DESC LIMIT 1;

  IF v_accumulated IS NULL THEN v_accumulated := 0; END IF;

  -- ★ FIX: Próximo domingo 23:59 UTC (max 7 días, no 12+)
  v_close_date := COALESCE(p_closes_at,
    (date_trunc('week', now() + interval '1 day') + interval '6 days 23 hours 59 minutes')::timestamptz
  );

  INSERT INTO lottery_draws (status, opens_at, closes_at, accumulated_jackpot)
  VALUES ('open', now(), v_close_date, v_accumulated)
  RETURNING id INTO v_draw_id;

  RETURN jsonb_build_object(
    'success', true,
    'draw_id', v_draw_id,
    'closes_at', v_close_date,
    'accumulated_jackpot', v_accumulated
  );
END;
$$;

-- ✅ Listo. Ahora ve al Admin → Lotería → "Crear Nuevo Sorteo"
-- El countdown mostrará ~6-7 días (próximo domingo 23:59 UTC)
