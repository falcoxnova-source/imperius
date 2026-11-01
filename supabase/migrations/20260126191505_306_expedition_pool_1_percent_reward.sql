/*
  # Cambiar recompensa del Pool de Expediciones a 1%

  ## Cambios
  - Cuando un jugador gana del pool de expediciones, ahora recibe el 1% fijo
  - Antes era 10-30% aleatorio
  - La probabilidad de ganar se mantiene igual (5% en eventos positivos, 100% en tesoro legendario)
*/

CREATE OR REPLACE FUNCTION attempt_expedition_pool_win(p_user_id uuid, p_guaranteed boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_balance numeric;
  v_roll numeric;
  v_win_chance numeric := 5;
  v_won boolean := false;
  v_win_amount numeric := 0;
  v_win_percent numeric;
  v_new_balance numeric;
BEGIN
  SELECT expedition_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;
  
  IF v_pool_balance IS NULL OR v_pool_balance < 10 THEN
    RETURN jsonb_build_object(
      'won', false,
      'amount', 0,
      'reason', 'pool_too_small',
      'current_pool', COALESCE(v_pool_balance, 0)
    );
  END IF;
  
  v_roll := random() * 100;
  
  IF p_guaranteed OR v_roll < v_win_chance THEN
    v_won := true;
    
    -- Ahora es 1% fijo del pool (antes era 10-30% aleatorio)
    v_win_percent := 1;
    v_win_amount := floor(v_pool_balance * (v_win_percent / 100));
    
    IF v_win_amount < 1 THEN
      v_win_amount := 1;
    END IF;
    
    UPDATE jackpot_pools
    SET 
      expedition_balance = expedition_balance - v_win_amount,
      updated_at = now()
    WHERE id = 1
    RETURNING expedition_balance INTO v_new_balance;
    
    UPDATE jackpot
    SET 
      balance = balance - v_win_amount,
      total_won = total_won + v_win_amount,
      last_winner_id = p_user_id,
      last_won_at = now(),
      last_won_amount = v_win_amount,
      updated_at = now()
    WHERE id = 1;
    
    PERFORM _internal_set_fxu_context();
    
    UPDATE profiles
    SET fxu_balance = fxu_balance + v_win_amount
    WHERE id = p_user_id;
    
    INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
    VALUES (p_user_id, 'win', v_win_amount, 'expedition_pool', v_new_balance);
  END IF;
  
  RETURN jsonb_build_object(
    'won', v_won,
    'amount', v_win_amount,
    'current_pool', CASE WHEN v_won THEN v_new_balance ELSE v_pool_balance END
  );
END;
$$;
