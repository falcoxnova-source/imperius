/*
  # Transform Plus Pool → Social Ranking Pool

  ## Changes:
  - Pool percentages: 20% expedition (unchanged), 30% top 50 (was 30%), 30% social ranking (was 50% plus), 20% reserve (stays in jackpot)
  - The "plus" pool columns are reused for social ranking distribution
  - New function: admin_distribute_social_ranking_pool()
    - Distributes plus_balance with EXPONENTIAL weighting by position (base 1.5)
    - Players ranked by points; #1 receives exponentially more than #2, #2 more than #3, etc.
    - Resets twitter action points to 0 after distribution (new monthly cycle)
  - Updated contribute_to_jackpot fallback defaults to 20/40/40
  - Updated admin_update_jackpot_pools validation

  ## What is NOT touched:
  - Expedition pool (20%) - zero changes
  - Top 50 distribution function (admin_distribute_monthly_pool) - zero changes, only gets more money
  - Plus subscription system tables/functions - still exist, just no longer fed by jackpot
*/

-- ============================================================
-- 1. Update pool percentages: monthly 30→40, plus 50→40
-- ============================================================
UPDATE jackpot_pools
SET 
  monthly_percent = 30,
  plus_percent = 30,
  updated_at = now()
WHERE id = 1;

-- Balances are NOT touched - they grow organically from game fees via contribute_to_jackpot()

-- ============================================================
-- 2. Update contribute_to_jackpot fallback defaults
-- ============================================================
DROP FUNCTION IF EXISTS contribute_to_jackpot(numeric, text, uuid);

CREATE OR REPLACE FUNCTION contribute_to_jackpot(
  p_amount numeric, 
  p_source text, 
  p_user_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expedition_amount numeric;
  v_monthly_amount numeric;
  v_plus_amount numeric;
  v_expedition_percent int;
  v_monthly_percent int;
  v_plus_percent int;
  v_new_total numeric;
BEGIN
  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  SELECT expedition_percent, monthly_percent, plus_percent
  INTO v_expedition_percent, v_monthly_percent, v_plus_percent
  FROM jackpot_pools WHERE id = 1;

  IF v_expedition_percent IS NULL THEN
    v_expedition_percent := 20;
    v_monthly_percent := 30;
    v_plus_percent := 30;
  END IF;

  v_expedition_amount := FLOOR(p_amount * v_expedition_percent / 100);
  v_monthly_amount := FLOOR(p_amount * v_monthly_percent / 100);
  v_plus_amount := FLOOR(p_amount * v_plus_percent / 100);
  -- Remaining 20% stays as reserve in jackpot.balance (not allocated to any pool)

  UPDATE jackpot_pools
  SET 
    expedition_balance = expedition_balance + v_expedition_amount,
    expedition_total = expedition_total + v_expedition_amount,
    monthly_balance = monthly_balance + v_monthly_amount,
    monthly_total = monthly_total + v_monthly_amount,
    plus_balance = plus_balance + v_plus_amount,
    plus_total = plus_total + v_plus_amount,
    updated_at = now()
  WHERE id = 1;

  UPDATE jackpot
  SET 
    balance = balance + p_amount,
    total_contributed = total_contributed + p_amount,
    updated_at = now()
  WHERE id = 1;

  SELECT expedition_balance + monthly_balance + plus_balance 
  INTO v_new_total
  FROM jackpot_pools WHERE id = 1;

  INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
  VALUES (p_user_id, 'contribution', p_amount, p_source, v_new_total);

  RETURN v_new_total;
END;
$$;

GRANT EXECUTE ON FUNCTION contribute_to_jackpot(numeric, text, uuid) TO authenticated;

-- ============================================================
-- 3. Create social ranking distribution table
-- ============================================================
CREATE TABLE IF NOT EXISTS social_ranking_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_month date NOT NULL,
  total_pool_amount numeric NOT NULL,
  total_participants int NOT NULL DEFAULT 0,
  total_distributed numeric NOT NULL DEFAULT 0,
  distributed_at timestamptz DEFAULT now(),
  distributed_by uuid REFERENCES profiles(id)
);

ALTER TABLE social_ranking_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view social ranking distributions" ON social_ranking_distributions;
CREATE POLICY "Anyone can view social ranking distributions"
  ON social_ranking_distributions FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS social_ranking_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id uuid NOT NULL REFERENCES social_ranking_distributions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  points_at_distribution integer NOT NULL DEFAULT 0,
  reward_amount numeric NOT NULL DEFAULT 0,
  reward_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_ranking_rewards_user ON social_ranking_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_social_ranking_rewards_dist ON social_ranking_rewards(distribution_id);

ALTER TABLE social_ranking_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social ranking rewards" ON social_ranking_rewards;
CREATE POLICY "Users can view own social ranking rewards"
  ON social_ranking_rewards FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all social ranking rewards" ON social_ranking_rewards;
CREATE POLICY "Admins can view all social ranking rewards"
  ON social_ranking_rewards FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ============================================================
-- 4. Admin function to distribute social ranking pool
-- ============================================================
CREATE OR REPLACE FUNCTION admin_distribute_social_ranking_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Check if already distributed this month
  IF EXISTS (SELECT 1 FROM social_ranking_distributions WHERE distribution_month = v_distribution_month) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo el ranking social este mes');
  END IF;

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

  -- Reset all twitter action points to 0 (new monthly cycle)
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

GRANT EXECUTE ON FUNCTION admin_distribute_social_ranking_pool() TO authenticated;

