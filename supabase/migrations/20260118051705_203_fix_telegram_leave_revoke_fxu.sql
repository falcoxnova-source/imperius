/*
  # Fix Telegram Leave - FXU Revocation

  Fixes the process_telegram_leave function to properly deduct FXU when user leaves.
  Allows negative balances (debt) if user spent the FXU already.
*/

CREATE OR REPLACE FUNCTION process_telegram_leave(
  p_telegram_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward telegram_task_rewards%ROWTYPE;
  v_link telegram_links%ROWTYPE;
  v_user_id uuid;
  v_old_balance numeric;
  v_new_balance numeric;
  v_reward_amount integer;
BEGIN
  -- Get reward record
  SELECT * INTO v_reward 
  FROM telegram_task_rewards 
  WHERE telegram_id = p_telegram_id AND task_type = 'join_group';

  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'No reward record found');
  END IF;

  -- Get link to find user_id
  SELECT * INTO v_link FROM telegram_links WHERE telegram_id = p_telegram_id;
  
  IF v_link IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked account found');
  END IF;

  v_user_id := v_link.user_id;
  v_reward_amount := v_reward.reward_amount;

  -- Check if we need to revoke (reward was claimed and not already revoked)
  IF v_reward.reward_claimed AND NOT v_reward.reward_revoked THEN
    -- Get current balance
    SELECT fxu_balance INTO v_old_balance FROM profiles WHERE id = v_user_id;
    
    -- Calculate new balance (can go negative)
    v_new_balance := v_old_balance - v_reward_amount;
    
    -- Enable FXU update
    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    
    -- Deduct FXU (allows negative balance)
    UPDATE profiles 
    SET fxu_balance = v_new_balance,
        updated_at = now()
    WHERE id = v_user_id;
    
    -- Disable FXU update
    PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);
    
    -- Mark reward as revoked
    UPDATE telegram_task_rewards
    SET is_member = false,
        last_leave_at = now(),
        updated_at = now(),
        reward_revoked = true
    WHERE id = v_reward.id;

    RETURN jsonb_build_object(
      'success', true,
      'reward_revoked', true,
      'amount', v_reward_amount,
      'old_balance', v_old_balance,
      'new_balance', v_new_balance,
      'message', 'Reward revoked, FXU deducted'
    );
  END IF;

  -- Just update membership status (no revocation needed)
  UPDATE telegram_task_rewards
  SET is_member = false,
      last_leave_at = now(),
      updated_at = now()
  WHERE id = v_reward.id;

  RETURN jsonb_build_object(
    'success', true,
    'reward_revoked', false,
    'message', 'User left group, no revocation needed'
  );
END;
$$;
