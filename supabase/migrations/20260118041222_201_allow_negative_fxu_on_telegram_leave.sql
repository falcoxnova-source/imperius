/*
  # Allow Negative FXU Balance When Leaving Telegram Group

  1. Changes
    - Modify `process_telegram_leave` function to allow negative FXU balance
    - If user spent their reward FXU and then leaves, balance goes negative

  2. Security
    - No RLS changes
    - Function remains SECURITY DEFINER
*/

-- Update process_telegram_leave to allow negative balance
CREATE OR REPLACE FUNCTION process_telegram_leave(p_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward telegram_task_rewards%ROWTYPE;
  v_link telegram_links%ROWTYPE;
BEGIN
  SELECT * INTO v_reward 
  FROM telegram_task_rewards 
  WHERE telegram_id = p_telegram_id AND task_type = 'join_group';

  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'No reward record found');
  END IF;

  SELECT * INTO v_link FROM telegram_links WHERE telegram_id = p_telegram_id;

  UPDATE telegram_task_rewards
  SET is_member = false,
      last_leave_at = now(),
      updated_at = now(),
      reward_revoked = CASE WHEN reward_claimed AND NOT reward_revoked THEN true ELSE reward_revoked END
  WHERE id = v_reward.id;

  IF v_reward.reward_claimed AND NOT v_reward.reward_revoked AND v_link IS NOT NULL THEN
    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    UPDATE profiles 
    SET fxu_balance = fxu_balance - v_reward.reward_amount
    WHERE id = v_link.user_id;
    PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

    RETURN jsonb_build_object(
      'success', true,
      'reward_revoked', true,
      'amount', v_reward.reward_amount,
      'message', 'User left group, reward revoked (balance may be negative)'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reward_revoked', false,
    'message', 'User left group'
  );
END;
$$;
