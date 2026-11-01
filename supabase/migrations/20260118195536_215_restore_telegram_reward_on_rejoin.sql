/*
  # Restore Telegram reward on rejoin

  1. Changes
    - Update process_telegram_join to restore revoked rewards when user rejoins
    - This fixes false positives from verification where user never actually left

  2. Notes
    - If a user's reward was revoked (possibly by error) and they rejoin the group,
      their reward will be restored
    - This is fair because if they're verified as being in the group, they deserve the reward
*/

CREATE OR REPLACE FUNCTION process_telegram_join(p_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link telegram_links%ROWTYPE;
  v_reward telegram_task_rewards%ROWTYPE;
  v_reward_amount integer := 50;
  v_old_balance numeric;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_link FROM telegram_links WHERE telegram_id = p_telegram_id;

  IF v_link IS NULL OR v_link.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Telegram account not linked to any game account'
    );
  END IF;

  SELECT * INTO v_reward 
  FROM telegram_task_rewards 
  WHERE telegram_id = p_telegram_id AND task_type = 'join_group';

  IF v_reward IS NULL THEN
    INSERT INTO telegram_task_rewards (
      user_id, telegram_id, task_type, reward_amount, 
      reward_claimed, first_join_at, is_member, updated_at
    )
    VALUES (
      v_link.user_id, p_telegram_id, 'join_group', v_reward_amount,
      true, now(), true, now()
    );

    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_link.user_id;
    PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

    RETURN jsonb_build_object(
      'success', true,
      'reward_given', true,
      'amount', v_reward_amount,
      'message', 'Welcome! You received ' || v_reward_amount || ' FXU!'
    );

  ELSE
    UPDATE telegram_task_rewards
    SET is_member = true,
        updated_at = now()
    WHERE id = v_reward.id;

    IF v_reward.reward_claimed AND v_reward.reward_revoked THEN
      SELECT fxu_balance INTO v_old_balance FROM profiles WHERE id = v_link.user_id;
      v_new_balance := v_old_balance + v_reward_amount;

      PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
      UPDATE profiles 
      SET fxu_balance = v_new_balance,
          updated_at = now()
      WHERE id = v_link.user_id;
      PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

      UPDATE telegram_task_rewards
      SET reward_revoked = false,
          updated_at = now()
      WHERE id = v_reward.id;

      RETURN jsonb_build_object(
        'success', true,
        'reward_given', true,
        'reward_restored', true,
        'amount', v_reward_amount,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'message', 'Welcome back! Your ' || v_reward_amount || ' FXU reward has been restored!'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', true,
        'reward_given', false,
        'message', 'Welcome back!'
      );
    END IF;
  END IF;
END;
$$;
