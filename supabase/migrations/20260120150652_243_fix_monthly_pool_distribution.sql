/*
  # Fix Monthly Pool Distribution Function

  1. Bug Fix
    - Column name is 'points_total' not 'total_points'

  2. Change
    - Remove monthly restriction - admin can distribute whenever they want
    - Track distributions by timestamp instead of restricting to once per month
*/

CREATE OR REPLACE FUNCTION admin_distribute_monthly_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_pool_balance numeric;
  v_distribution_id uuid;
  v_distributed_count int := 0;
  v_player RECORD;
  v_rank int := 0;
  v_reward_percent numeric;
  v_reward_amount numeric;
  v_total_distributed numeric := 0;
  v_distribution_month date;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT monthly_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool mensual vacio');
  END IF;

  v_distribution_month := date_trunc('month', now())::date;

  INSERT INTO monthly_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  FOR v_player IN 
    SELECT p.id, p.username, p.points_total
    FROM profiles p
    WHERE p.points_total > 0 AND p.is_admin = false
    ORDER BY p.points_total DESC
    LIMIT 50
  LOOP
    v_rank := v_rank + 1;

    v_reward_percent := CASE
      WHEN v_rank = 1 THEN 15
      WHEN v_rank = 2 THEN 10
      WHEN v_rank = 3 THEN 7
      WHEN v_rank <= 10 THEN 4
      WHEN v_rank <= 20 THEN 2
      ELSE 1
    END;

    v_reward_amount := FLOOR(v_pool_balance * v_reward_percent / 100);

    IF v_reward_amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_player.id;

      INSERT INTO monthly_ranking_rewards (distribution_id, user_id, rank_position, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_player.id, v_rank, v_player.points_total, v_reward_amount, v_reward_percent);

      INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
      VALUES (
        v_player.id,
        'Sistema',
        'Recompensa Ranking',
        'Felicidades! Has recibido ' || v_reward_amount || ' FXU por estar en el puesto #' || v_rank || ' del ranking.',
        'system'
      );

      v_distributed_count := v_distributed_count + 1;
      v_total_distributed := v_total_distributed + v_reward_amount;
    END IF;
  END LOOP;

  UPDATE jackpot_pools 
  SET monthly_balance = monthly_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  UPDATE jackpot SET balance = balance - v_total_distributed WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pool distribuido exitosamente',
    'total_distributed', v_total_distributed,
    'players_rewarded', v_distributed_count,
    'distribution_id', v_distribution_id
  );
END;
$$;
