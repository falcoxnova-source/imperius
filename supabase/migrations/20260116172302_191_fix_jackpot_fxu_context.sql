/*
  # Fix Jackpot FXU Context Security
  
  Updates attempt_jackpot_win function to properly set FXU context
  before modifying user's fxu_balance.
  
  This ensures the trigger protection is properly bypassed through
  the authorized channel.
*/

CREATE OR REPLACE FUNCTION attempt_jackpot_win(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jackpot_config%ROWTYPE;
  v_jackpot jackpot%ROWTYPE;
  v_roll numeric;
  v_won boolean := false;
  v_win_amount numeric := 0;
  v_win_percent numeric;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_config FROM jackpot_config WHERE id = 1;
  SELECT * INTO v_jackpot FROM jackpot WHERE id = 1;
  
  IF v_jackpot.balance < v_config.min_jackpot_for_win THEN
    RETURN jsonb_build_object(
      'won', false,
      'amount', 0,
      'reason', 'jackpot_too_small',
      'current_jackpot', v_jackpot.balance
    );
  END IF;

  v_roll := random() * 100;
  
  IF v_roll < v_config.win_chance THEN
    v_won := true;
    
    v_win_percent := v_config.min_win_percent + 
      (random() * (v_config.max_win_percent - v_config.min_win_percent));
    
    v_win_amount := floor(v_jackpot.balance * (v_win_percent / 100));
    
    UPDATE jackpot
    SET 
      balance = balance - v_win_amount,
      total_won = total_won + v_win_amount,
      last_winner_id = p_user_id,
      last_won_at = now(),
      last_won_amount = v_win_amount,
      updated_at = now()
    WHERE id = 1
    RETURNING balance INTO v_new_balance;
    
    PERFORM _internal_set_fxu_context();
    
    UPDATE profiles
    SET fxu_balance = fxu_balance + v_win_amount
    WHERE id = p_user_id;
    
    INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
    VALUES (p_user_id, 'win', v_win_amount, 'expedition', v_new_balance);
    
    INSERT INTO messages (recipient_id, sender_name, subject, content, message_type)
    VALUES (
      p_user_id,
      'Jackpot System',
      'JACKPOT WINNER!',
      'Congratulations! Your expedition discovered the legendary treasure! You won ' || 
        floor(v_win_amount)::text || ' FXU from the jackpot!',
      'system'
    );
  END IF;

  RETURN jsonb_build_object(
    'won', v_won,
    'amount', v_win_amount,
    'current_jackpot', CASE WHEN v_won THEN v_new_balance ELSE v_jackpot.balance END
  );
END;
$$;
