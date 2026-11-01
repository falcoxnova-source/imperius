/*
  # Admin function to restore telegram rewards

  1. New Functions
    - admin_restore_telegram_reward: Allows admin to manually restore a revoked reward

  2. Security
    - Only admins can call this function
*/

CREATE OR REPLACE FUNCTION admin_restore_telegram_reward(p_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_reward telegram_task_rewards%ROWTYPE;
  v_link telegram_links%ROWTYPE;
  v_old_balance numeric;
  v_new_balance numeric;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  SELECT * INTO v_reward 
  FROM telegram_task_rewards 
  WHERE telegram_id = p_telegram_id AND task_type = 'join_group';

  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No reward record found for this telegram ID');
  END IF;

  IF NOT v_reward.reward_revoked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward is not revoked');
  END IF;

  SELECT * INTO v_link FROM telegram_links WHERE telegram_id = p_telegram_id;

  IF v_link IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No linked account found');
  END IF;

  SELECT fxu_balance INTO v_old_balance FROM profiles WHERE id = v_link.user_id;
  v_new_balance := v_old_balance + v_reward.reward_amount;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  UPDATE profiles 
  SET fxu_balance = v_new_balance,
      updated_at = now()
  WHERE id = v_link.user_id;
  PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

  UPDATE telegram_task_rewards
  SET reward_revoked = false,
      is_member = true,
      updated_at = now()
  WHERE id = v_reward.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Reward restored successfully',
    'amount', v_reward.reward_amount,
    'old_balance', v_old_balance,
    'new_balance', v_new_balance,
    'telegram_username', v_link.telegram_username
  );
END;
$$;
