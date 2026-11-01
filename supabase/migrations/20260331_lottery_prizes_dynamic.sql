-- ============================================================
-- Fix: Lottery prize table shows dynamic values from admin config
--
-- Problem: Client LotteryPage had hardcoded "500 FXU" for 3 matches
--          and "50 FXU" for 2 matches. When admin changed the values,
--          the client still showed the old amounts.
--
-- Fix: get_lottery_info() now reads lottery_3match_prize and
--      lottery_2match_prize from game_settings and returns them.
-- ============================================================

CREATE OR REPLACE FUNCTION get_lottery_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_active_draw record;
  v_user_tickets jsonb;
  v_user_ticket_count integer;
  v_ticket_cost integer;
  v_max_tickets integer;
  v_is_plus boolean;
  v_final_cost integer;
  v_accumulated numeric;
  v_past_draws jsonb;
  v_past_winners jsonb;
  v_enabled boolean;
  v_prize_3match integer;
  v_prize_2match integer;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if enabled
  SELECT COALESCE(value::boolean, true) INTO v_enabled
  FROM game_settings WHERE key = 'lottery_enabled';
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  -- Get config
  SELECT COALESCE(value::integer, 50) INTO v_ticket_cost FROM game_settings WHERE key = 'lottery_ticket_cost';
  SELECT COALESCE(value::integer, 10) INTO v_max_tickets FROM game_settings WHERE key = 'lottery_max_tickets';
  IF v_ticket_cost IS NULL THEN v_ticket_cost := 50; END IF;
  IF v_max_tickets IS NULL THEN v_max_tickets := 10; END IF;

  -- Prize amounts from config
  v_prize_3match := COALESCE((SELECT value::integer FROM game_settings WHERE key = 'lottery_3match_prize'), 500);
  v_prize_2match := COALESCE((SELECT value::integer FROM game_settings WHERE key = 'lottery_2match_prize'), 50);

  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_ticket_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_ticket_cost * 0.50);
  END IF;

  -- Get active draw
  SELECT * INTO v_active_draw FROM lottery_draws
  WHERE status = 'open'
  ORDER BY closes_at ASC LIMIT 1;

  -- Count user tickets for active draw
  v_user_ticket_count := 0;
  v_user_tickets := '[]'::jsonb;
  IF v_active_draw.id IS NOT NULL AND v_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_ticket_count
    FROM lottery_tickets WHERE draw_id = v_active_draw.id AND user_id = v_user_id;
    
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'numbers', numbers, 'cost', cost, 'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_user_tickets
    FROM lottery_tickets WHERE draw_id = v_active_draw.id AND user_id = v_user_id;
  END IF;

  -- Calculate accumulated jackpot
  v_accumulated := COALESCE(v_active_draw.accumulated_jackpot, 0) + COALESCE(v_active_draw.prize_pool, 0);

  -- Past draws (last 10)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'draw_number', d.draw_number,
    'winning_numbers', d.winning_numbers,
    'total_tickets', d.total_tickets,
    'jackpot_amount', d.jackpot_amount,
    'jackpot_winner', CASE WHEN d.jackpot_winner_id IS NOT NULL THEN (
      SELECT username FROM profiles WHERE id = d.jackpot_winner_id
    ) ELSE NULL END,
    'drawn_at', d.drawn_at,
    'total_pool', d.total_pool
  ) ORDER BY d.drawn_at DESC), '[]'::jsonb)
  INTO v_past_draws
  FROM (SELECT * FROM lottery_draws WHERE status = 'completed' ORDER BY drawn_at DESC LIMIT 10) d;

  -- Recent winners (last 20)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'username', sub.username,
    'matches', sub.matches,
    'prize', sub.prize,
    'numbers', sub.numbers,
    'winning_numbers', sub.winning_numbers,
    'created_at', sub.created_at
  ) ORDER BY sub.created_at DESC), '[]'::jsonb)
  INTO v_past_winners
  FROM (
    SELECT w.matches, w.prize, w.numbers, w.winning_numbers, w.created_at, p.username
    FROM lottery_winners w JOIN profiles p ON p.id = w.user_id
    ORDER BY w.created_at DESC LIMIT 20
  ) sub;

  RETURN jsonb_build_object(
    'enabled', true,
    'active_draw', CASE WHEN v_active_draw.id IS NOT NULL THEN jsonb_build_object(
      'id', v_active_draw.id,
      'draw_number', v_active_draw.draw_number,
      'status', v_active_draw.status,
      'total_tickets', v_active_draw.total_tickets,
      'prize_pool', v_accumulated,
      'accumulated_jackpot', v_active_draw.accumulated_jackpot,
      'opens_at', v_active_draw.opens_at,
      'closes_at', v_active_draw.closes_at
    ) ELSE NULL END,
    'can_buy_tickets', CASE WHEN v_active_draw.id IS NOT NULL AND v_active_draw.closes_at > now() THEN true ELSE false END,
    'ticket_cost', v_ticket_cost,
    'ticket_cost_vip', CEIL(v_ticket_cost * 0.50),
    'final_cost', v_final_cost,
    'is_vip', v_is_plus,
    'max_tickets', v_max_tickets,
    'user_tickets', v_user_tickets,
    'user_ticket_count', v_user_ticket_count,
    'past_draws', v_past_draws,
    'past_winners', v_past_winners,
    'prize_3match', v_prize_3match,
    'prize_2match', v_prize_2match
  );
END;
$$;
