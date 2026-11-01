-- Recreate admin_distribute_monthly_pool() (was missing from production -> RPC 404).
-- Distributes the monthly jackpot pool (jackpot_pools.monthly_balance) to the
-- TOP 50 players by ranking points (profiles.points_total, non-admin).
-- Modeled on the existing, working admin_distribute_social_ranking_pool /
-- admin_distribute_destruction_pool functions: normalized exponential weights
-- (base 1.03) with the remainder going to #1, so the total distributed never
-- exceeds the pool. Uses _internal_set_fxu_context() so the fxu_balance updates
-- pass the protect_fxu_balance trigger, and the current messages(sender_id) shape.
CREATE OR REPLACE FUNCTION public.admin_distribute_monthly_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_pool_balance numeric;
  v_distribution_id uuid;
  v_distributed_count int := 0;
  v_participant RECORD;
  v_rank int := 0;
  v_weight numeric;
  v_total_weight numeric := 0;
  v_num_participants int := 0;
  v_reward_percent numeric;
  v_reward_amount numeric;
  v_total_distributed numeric := 0;
  v_total_calculated numeric := 0;
  v_distribution_month date;
  v_rewards jsonb := '[]'::jsonb;
  v_first_user_id uuid;
  v_remainder numeric;
  v_base numeric := 1.03;
  v_i int;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT monthly_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance IS NULL OR v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool mensual vacio');
  END IF;

  v_distribution_month := date_trunc('month', now())::date;

  IF EXISTS (SELECT 1 FROM monthly_ranking_distributions WHERE distribution_month = v_distribution_month) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo este mes');
  END IF;

  -- TOP 50 players by ranking points (non-admin)
  CREATE TEMP TABLE temp_monthly_dist (
    rank_num int,
    uid uuid,
    uname text,
    ppoints bigint
  ) ON COMMIT DROP;

  INSERT INTO temp_monthly_dist (rank_num, uid, uname, ppoints)
  SELECT
    ROW_NUMBER() OVER (ORDER BY p.points_total DESC)::int,
    p.id,
    p.username,
    p.points_total
  FROM profiles p
  WHERE p.points_total > 0 AND p.is_admin = false
  ORDER BY p.points_total DESC
  LIMIT 50;

  SELECT COUNT(*) INTO v_num_participants FROM temp_monthly_dist;

  IF v_num_participants = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay jugadores con puntos en el ranking');
  END IF;

  -- Total exponential weight (base 1.03)
  FOR v_i IN 1..v_num_participants LOOP
    v_total_weight := v_total_weight + power(v_base, v_num_participants - v_i);
  END LOOP;

  INSERT INTO monthly_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  -- First pass: calculate rewards
  FOR v_participant IN
    SELECT rank_num, uid, uname, ppoints FROM temp_monthly_dist ORDER BY rank_num
  LOOP
    v_rank := v_participant.rank_num;

    IF v_rank = 1 THEN
      v_first_user_id := v_participant.uid;
    END IF;

    v_weight := power(v_base, v_num_participants - v_rank);
    v_reward_percent := ROUND((v_weight / v_total_weight) * 100, 2);
    v_reward_amount := FLOOR(v_pool_balance * v_weight / v_total_weight);

    v_rewards := v_rewards || jsonb_build_object(
      'user_id', v_participant.uid,
      'username', v_participant.uname,
      'rank', v_rank,
      'points', v_participant.ppoints,
      'amount', v_reward_amount,
      'percent', v_reward_percent
    );

    v_total_calculated := v_total_calculated + v_reward_amount;
  END LOOP;

  -- Give remainder to #1 so total distributed == pool (never exceeds it)
  v_remainder := v_pool_balance - v_total_calculated;
  IF v_remainder > 0 AND v_first_user_id IS NOT NULL THEN
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'user_id')::uuid = v_first_user_id
        THEN jsonb_set(elem, '{amount}', to_jsonb((elem->>'amount')::numeric + v_remainder))
        ELSE elem
      END
    ) INTO v_rewards
    FROM jsonb_array_elements(v_rewards) elem;
  END IF;

  -- Allow fxu_balance updates (protect_fxu_balance trigger)
  PERFORM _internal_set_fxu_context();

  -- Second pass: distribute
  FOR v_participant IN
    SELECT
      (elem->>'user_id')::uuid as user_id,
      (elem->>'username')::text as username,
      (elem->>'rank')::int as rank,
      (elem->>'points')::bigint as points,
      (elem->>'amount')::numeric as amount,
      (elem->>'percent')::numeric as percent
    FROM jsonb_array_elements(v_rewards) elem
  LOOP
    IF v_participant.amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_participant.amount WHERE id = v_participant.user_id;

      INSERT INTO monthly_ranking_rewards (distribution_id, user_id, rank_position, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_participant.user_id, v_participant.rank, v_participant.points, v_participant.amount, v_participant.percent);

      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_participant.user_id,
        NULL,
        'Recompensa Ranking Mensual',
        'Felicidades! Has recibido ' || v_participant.amount || ' FXU por estar en el puesto #' || v_participant.rank || ' del ranking mensual (' || v_participant.percent || '% del pool).',
        'system'
      );

      v_distributed_count := v_distributed_count + 1;
      v_total_distributed := v_total_distributed + v_participant.amount;
    END IF;
  END LOOP;

  -- Deduct distributed amount from the monthly pool
  UPDATE jackpot_pools
  SET monthly_balance = monthly_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pool mensual distribuido',
    'total_distributed', v_total_distributed,
    'players_rewarded', v_distributed_count,
    'distribution_id', v_distribution_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_distribute_monthly_pool() TO authenticated;

-- Reload PostgREST schema cache so the RPC is found (fixes the 404)
NOTIFY pgrst, 'reload schema';
