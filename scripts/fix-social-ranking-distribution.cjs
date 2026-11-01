const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  console.log('Connected\n');

  // Replace the function WITHOUT the monthly restriction
  const sql = `
CREATE OR REPLACE FUNCTION admin_distribute_social_ranking_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
  v_pool_balance numeric;
  v_distribution_id uuid;
  v_total_points bigint := 0;
  v_participant RECORD;
  v_reward_amount numeric;
  v_reward_percent numeric;
  v_total_distributed numeric := 0;
  v_participant_count int := 0;
  v_distribution_month date;
  v_rank int := 0;
  v_weight numeric;
  v_total_weight numeric := 0;
  v_num_participants int := 0;
  i int;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Get current social ranking pool balance (stored in plus_balance)
  SELECT plus_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool de ranking social vacio');
  END IF;

  v_distribution_month := date_trunc('month', now())::date;

  -- NO monthly restriction: admin can distribute whenever they want

  -- Calculate total points from all validated twitter actions
  SELECT COALESCE(SUM(ta.points_awarded), 0)
  INTO v_total_points
  FROM twitter_actions ta
  WHERE ta.validated = true AND ta.points_awarded > 0;

  IF v_total_points <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay participantes con puntos de tareas sociales');
  END IF;

  -- Count participants for exponential weight calculation
  SELECT COUNT(*) INTO v_num_participants
  FROM (
    SELECT ta.user_id
    FROM twitter_actions ta
    WHERE ta.validated = true AND ta.points_awarded > 0
    GROUP BY ta.user_id
    HAVING SUM(ta.points_awarded) > 0
  ) sub;

  -- Pre-calculate total exponential weight: sum of 1.5^(N-rank) for rank 1..N
  -- #1 gets weight 1.5^(N-1), #2 gets 1.5^(N-2), ..., #N gets 1.5^0 = 1
  FOR i IN 1..v_num_participants LOOP
    v_total_weight := v_total_weight + POWER(1.5, v_num_participants - i);
  END LOOP;

  -- Create distribution record
  INSERT INTO social_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  -- Distribute proportionally based on points
  FOR v_participant IN
    SELECT
      ta.user_id,
      p.username,
      SUM(ta.points_awarded) as user_points
    FROM twitter_actions ta
    JOIN profiles p ON p.id = ta.user_id
    WHERE ta.validated = true AND ta.points_awarded > 0
    GROUP BY ta.user_id, p.username
    HAVING SUM(ta.points_awarded) > 0
    ORDER BY SUM(ta.points_awarded) DESC
  LOOP
    -- Calculate exponential reward by position (higher rank = exponentially more)
    v_rank := v_rank + 1;
    v_weight := POWER(1.5, v_num_participants - v_rank);
    v_reward_percent := ROUND((v_weight / v_total_weight) * 100, 2);
    v_reward_amount := FLOOR(v_pool_balance * v_weight / v_total_weight);

    IF v_reward_amount > 0 THEN
      -- Add FXU to participant
      PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
      UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_participant.user_id;
      PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

      -- Record reward
      INSERT INTO social_ranking_rewards (distribution_id, user_id, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_participant.user_id, v_participant.user_points, v_reward_amount, v_reward_percent);

      -- Send notification
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_participant.user_id,
        NULL,
        '🏆 Recompensa Ranking Social',
        'Felicidades! Puesto #' || v_rank || ' - Has recibido ' || v_reward_amount || ' FXU (' || v_reward_percent || '% del pool) por tus ' || v_participant.user_points || ' puntos en el ranking social. Los puntos se han reiniciado.',
        'system'
      );

      v_participant_count := v_participant_count + 1;
      v_total_distributed := v_total_distributed + v_reward_amount;
    END IF;
  END LOOP;

  -- Update distribution record
  UPDATE social_ranking_distributions
  SET total_participants = v_participant_count,
      total_distributed = v_total_distributed
  WHERE id = v_distribution_id;

  -- Deduct from social pool (plus_balance)
  UPDATE jackpot_pools
  SET plus_balance = plus_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  -- Also update main jackpot
  UPDATE jackpot SET balance = balance - v_total_distributed WHERE id = 1;

  -- Reset all twitter action points to 0 (new cycle)
  UPDATE twitter_actions
  SET points_awarded = 0
  WHERE validated = true AND points_awarded > 0;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Ranking social distribuido y puntos reiniciados',
    'total_distributed', v_total_distributed,
    'participants_rewarded', v_participant_count,
    'total_points_reset', v_total_points,
    'distribution_id', v_distribution_id
  );
END;
$$;
  `;

  await c.query(sql);
  console.log('✅ Function updated - monthly restriction REMOVED');
  console.log('Admin can now distribute social ranking whenever they want.');

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
