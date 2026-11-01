-- ============================================================
-- Fix: Prevent same user from buying duplicate number combinations
-- in the same lottery draw.
-- 
-- Different users CAN still pick the same numbers (normal lottery).
-- Same user CANNOT buy the same 4 numbers twice in one draw.
-- ============================================================

-- Step 1: Remove duplicate tickets (keep the oldest one per combo)
DELETE FROM lottery_tickets
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY draw_id, user_id, numbers ORDER BY created_at ASC) as rn
    FROM lottery_tickets
  ) dupes
  WHERE dupes.rn > 1
);

-- Step 2: Add unique constraint per user + draw + numbers (sorted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lottery_tickets_unique_combo 
ON lottery_tickets (draw_id, user_id, numbers);

-- Update buy_lottery_ticket with duplicate check
CREATE OR REPLACE FUNCTION buy_lottery_ticket(p_numbers integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_draw record;
  v_ticket_cost integer;
  v_max_tickets integer;
  v_user_ticket_count integer;
  v_user_fxu numeric;
  v_is_plus boolean;
  v_final_cost integer;
  v_prize_pct integer;
  v_admin_pct integer;
  v_pool_pct integer;
  v_prize_amount numeric;
  v_admin_amount numeric;
  v_pool_amount numeric;
  v_admin_id uuid;
  v_ticket_id uuid;
  v_num integer;
  v_sorted integer[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Validate numbers: exactly 4, all between 1-30, no duplicates
  IF array_length(p_numbers, 1) != 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes elegir exactamente 4 números');
  END IF;

  FOREACH v_num IN ARRAY p_numbers LOOP
    IF v_num < 1 OR v_num > 30 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Los números deben estar entre 1 y 30');
    END IF;
  END LOOP;

  -- Check duplicates within the 4 numbers
  SELECT ARRAY(SELECT DISTINCT unnest(p_numbers) ORDER BY 1) INTO v_sorted;
  IF array_length(v_sorted, 1) != 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes repetir números');
  END IF;
  p_numbers := v_sorted;

  -- Get active draw (FOR UPDATE serializes concurrent purchases)
  SELECT * INTO v_draw FROM lottery_draws
  WHERE status = 'open' AND closes_at > now()
  ORDER BY closes_at ASC LIMIT 1
  FOR UPDATE;

  IF v_draw.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay sorteo activo en este momento');
  END IF;

  -- Get config
  SELECT COALESCE(value::integer, 50) INTO v_ticket_cost FROM game_settings WHERE key = 'lottery_ticket_cost';
  SELECT COALESCE(value::integer, 10) INTO v_max_tickets FROM game_settings WHERE key = 'lottery_max_tickets';
  SELECT COALESCE(value::integer, 70) INTO v_prize_pct FROM game_settings WHERE key = 'lottery_prize_pool_pct';
  SELECT COALESCE(value::integer, 20) INTO v_admin_pct FROM game_settings WHERE key = 'lottery_admin_pct';
  SELECT COALESCE(value::integer, 10) INTO v_pool_pct FROM game_settings WHERE key = 'lottery_reward_pool_pct';
  IF v_ticket_cost IS NULL THEN v_ticket_cost := 50; END IF;
  IF v_max_tickets IS NULL THEN v_max_tickets := 10; END IF;
  IF v_prize_pct IS NULL THEN v_prize_pct := 70; END IF;
  IF v_admin_pct IS NULL THEN v_admin_pct := 20; END IF;
  IF v_pool_pct IS NULL THEN v_pool_pct := 10; END IF;

  -- Check ticket limit
  SELECT COUNT(*) INTO v_user_ticket_count
  FROM lottery_tickets WHERE draw_id = v_draw.id AND user_id = v_user_id;

  IF v_user_ticket_count >= v_max_tickets THEN
    RETURN jsonb_build_object('success', false, 'error', 'Has alcanzado el límite de ' || v_max_tickets || ' tickets para este sorteo');
  END IF;

  -- ========== NEW: Check duplicate combination for same user ==========
  IF EXISTS (
    SELECT 1 FROM lottery_tickets 
    WHERE draw_id = v_draw.id AND user_id = v_user_id AND numbers = p_numbers
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un ticket con estos números en este sorteo. Elige una combinación diferente.');
  END IF;

  -- VIP discount
  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_ticket_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_ticket_cost * 0.50);
  END IF;

  -- Check balance
  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  IF v_user_fxu < v_final_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente. Necesitas ' || v_final_cost || ' FXU, tienes ' || FLOOR(v_user_fxu) || ' FXU'
    );
  END IF;

  -- Charge user
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_final_cost WHERE id = v_user_id;

  -- Split revenue
  v_prize_amount := FLOOR(v_final_cost * v_prize_pct / 100.0);
  v_admin_amount := FLOOR(v_final_cost * v_admin_pct / 100.0);
  v_pool_amount := v_final_cost - v_prize_amount - v_admin_amount;

  -- Admin revenue
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
  END IF;
  PERFORM record_admin_revenue('lottery_fee', v_admin_amount, 'Lottery ticket #' || (v_user_ticket_count + 1) || ' draw #' || v_draw.draw_number, v_user_id, v_draw.id);

  -- Reward pools
  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'lottery', v_user_id);
  END IF;

  -- Create ticket
  INSERT INTO lottery_tickets (draw_id, user_id, numbers, cost)
  VALUES (v_draw.id, v_user_id, p_numbers, v_final_cost)
  RETURNING id INTO v_ticket_id;

  -- Update draw totals
  UPDATE lottery_draws SET
    total_tickets = total_tickets + 1,
    total_pool = total_pool + v_final_cost,
    prize_pool = prize_pool + v_prize_amount,
    admin_revenue = admin_revenue + v_admin_amount,
    reward_pool_share = reward_pool_share + v_pool_amount
  WHERE id = v_draw.id;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'numbers', p_numbers,
    'cost', v_final_cost,
    'draw_number', v_draw.draw_number,
    'tickets_remaining', v_max_tickets - v_user_ticket_count - 1,
    'vip_discount', v_is_plus
  );
END;
$$;
