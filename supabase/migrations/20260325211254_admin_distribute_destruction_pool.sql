/*
  # Admin Distribute Destruction Pool

  1. New Tables
    - `destruction_ranking_distributions` - Tracks each distribution event
      - `id` (uuid, primary key)
      - `distribution_month` (date, unique)
      - `total_pool_amount` (numeric)
      - `total_participants` (int)
      - `total_distributed` (numeric)
      - `distributed_at` (timestamptz)
      - `distributed_by` (uuid)
    - `destruction_ranking_rewards` - Individual rewards per distribution
      - `id` (uuid, primary key)
      - `distribution_id` (uuid, FK)
      - `user_id` (uuid, FK)
      - `rank_position` (int)
      - `destruction_points` (bigint)
      - `reward_amount` (numeric)
      - `reward_percent` (numeric)
      - `created_at` (timestamptz)

  2. New Functions
    - `admin_distribute_destruction_pool` - Distributes destruction_balance to top 50 players
      based on get_destruction_ranking, using same weighted formula as monthly pool

  3. Security
    - RLS enabled on both tables
    - Only admins can insert/manage distributions
    - Users can read their own rewards
*/

-- Distribution tracking table
CREATE TABLE IF NOT EXISTS destruction_ranking_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_month date NOT NULL UNIQUE,
  total_pool_amount numeric NOT NULL DEFAULT 0,
  total_participants int NOT NULL DEFAULT 0,
  total_distributed numeric NOT NULL DEFAULT 0,
  distributed_at timestamptz NOT NULL DEFAULT now(),
  distributed_by uuid REFERENCES profiles(id)
);

ALTER TABLE destruction_ranking_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage destruction distributions"
  ON destruction_ranking_distributions
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Individual rewards table
CREATE TABLE IF NOT EXISTS destruction_ranking_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id uuid NOT NULL REFERENCES destruction_ranking_distributions(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  rank_position int NOT NULL,
  destruction_points bigint NOT NULL DEFAULT 0,
  reward_amount numeric NOT NULL DEFAULT 0,
  reward_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE destruction_ranking_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own destruction rewards"
  ON destruction_ranking_rewards
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage destruction rewards"
  ON destruction_ranking_rewards
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Main distribution function
CREATE OR REPLACE FUNCTION admin_distribute_destruction_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_pool_balance numeric;
  v_distribution_id uuid;
  v_distributed_count int := 0;
  v_player RECORD;
  v_rank int := 0;
  v_weight numeric;
  v_total_weight numeric := 0;
  v_num_participants int;
  v_reward_percent numeric;
  v_reward_amount numeric;
  v_total_distributed numeric := 0;
  v_distribution_month date;
  v_rewards jsonb := '[]'::jsonb;
  v_first_player_id uuid;
  v_total_calculated numeric := 0;
  v_remainder numeric;
  i int;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT destruction_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance IS NULL OR v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool de destruccion vacio o sin fondos');
  END IF;

  v_distribution_month := date_trunc('month', now())::date;

  IF EXISTS (SELECT 1 FROM destruction_ranking_distributions WHERE distribution_month = v_distribution_month) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo el pool de destruccion este mes');
  END IF;

  -- Get destruction ranking data into a temp table for processing
  CREATE TEMP TABLE IF NOT EXISTS temp_dest_dist (
    rank_num int,
    uid uuid,
    uname text,
    dpoints bigint
  ) ON COMMIT DROP;

  DELETE FROM temp_dest_dist;

  INSERT INTO temp_dest_dist (rank_num, uid, uname, dpoints)
  SELECT
    ROW_NUMBER() OVER (ORDER BY dr.destruction_points DESC)::int,
    dr.user_id,
    dr.username,
    dr.destruction_points
  FROM get_destruction_ranking() dr
  LIMIT 50;

  SELECT COUNT(*) INTO v_num_participants FROM temp_dest_dist;

  IF v_num_participants = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay jugadores con puntos de destruccion');
  END IF;

  -- Calculate total weight using same formula as monthly pool: weight = (N+1 - rank)
  -- #1 gets N, #2 gets N-1, ..., #N gets 1
  -- total_weight = N*(N+1)/2
  v_total_weight := (v_num_participants * (v_num_participants + 1)) / 2.0;

  INSERT INTO destruction_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  FOR v_player IN
    SELECT rank_num, uid, uname, dpoints FROM temp_dest_dist ORDER BY rank_num
  LOOP
    v_rank := v_player.rank_num;

    IF v_rank = 1 THEN
      v_first_player_id := v_player.uid;
    END IF;

    v_weight := (v_num_participants + 1) - v_rank;
    v_reward_percent := ROUND((v_weight / v_total_weight) * 100, 2);
    v_reward_amount := FLOOR(v_pool_balance * v_weight / v_total_weight);

    v_rewards := v_rewards || jsonb_build_object(
      'user_id', v_player.uid,
      'username', v_player.uname,
      'rank', v_rank,
      'points', v_player.dpoints,
      'amount', v_reward_amount,
      'percent', v_reward_percent
    );

    v_total_calculated := v_total_calculated + v_reward_amount;
  END LOOP;

  -- Give remainder to #1
  v_remainder := v_pool_balance - v_total_calculated;
  IF v_remainder > 0 AND v_first_player_id IS NOT NULL THEN
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'user_id')::uuid = v_first_player_id
        THEN jsonb_set(elem, '{amount}', to_jsonb((elem->>'amount')::numeric + v_remainder))
        ELSE elem
      END
    ) INTO v_rewards
    FROM jsonb_array_elements(v_rewards) elem;

    v_total_calculated := v_pool_balance;
  END IF;

  -- Set FXU context to allow balance updates
  PERFORM _internal_set_fxu_context();

  -- Distribute rewards
  FOR v_player IN
    SELECT
      (elem->>'user_id')::uuid as user_id,
      (elem->>'username')::text as username,
      (elem->>'rank')::int as rank,
      (elem->>'points')::bigint as points,
      (elem->>'amount')::numeric as amount,
      (elem->>'percent')::numeric as percent
    FROM jsonb_array_elements(v_rewards) elem
  LOOP
    IF v_player.amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_player.amount WHERE id = v_player.user_id;

      INSERT INTO destruction_ranking_rewards (distribution_id, user_id, rank_position, destruction_points, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_player.user_id, v_player.rank, v_player.points, v_player.amount, v_player.percent);

      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_player.user_id,
        NULL,
        'Recompensa Ranking Destruccion',
        'Felicidades! Puesto #' || v_player.rank || ' en destruccion - Has recibido ' || v_player.amount || ' FXU (' || v_player.percent || '% del pool) por ' || v_player.points || ' puntos de destruccion.',
        'system'
      );

      v_distributed_count := v_distributed_count + 1;
    END IF;
  END LOOP;

  -- Build telegram broadcast message
  DECLARE
    v_rewards_list_text text := '';
    v_rewards_elem jsonb;
    v_emoji text;
    v_anon_key text;
    v_request_id bigint;
  BEGIN
    FOR v_rewards_elem IN SELECT * FROM jsonb_array_elements(v_rewards)
    LOOP
      IF (v_rewards_elem->>'rank')::int = 1 THEN
        v_emoji := '💀';
      ELSIF (v_rewards_elem->>'rank')::int <= 3 THEN
        v_emoji := '🔥';
      ELSIF (v_rewards_elem->>'rank')::int <= 10 THEN
        v_emoji := '⚔️';
      ELSE
        v_emoji := '💥';
      END IF;
      v_rewards_list_text := v_rewards_list_text || v_emoji || ' #' || (v_rewards_elem->>'rank') || ' ' || (v_rewards_elem->>'username') || ' - ' || (v_rewards_elem->>'amount') || ' FXU (' || (v_rewards_elem->>'percent') || '%)' || chr(10);
    END LOOP;

    v_rewards_list_text := '🔥 RANKING DESTRUCCION TOP 50 - REPARTO 🔥' || chr(10) || chr(10)
      || '💰 Pool total: ' || v_pool_balance || ' FXU' || chr(10) || chr(10)
      || v_rewards_list_text || chr(10)
      || '¡Felicidades a los guerreros mas destructivos!' || chr(10)
      || '¿Quieres ganar FXU? ¡Ataca y destruye flotas enemigas!' || chr(10)
      || 'Unete: https://t.me/+1Oo1iGBuQ-xjY2Zh';

    -- Send in-game to players not in the top
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    SELECT p.id, NULL, 'Ranking Destruccion - Reparto', v_rewards_list_text, 'system'
    FROM profiles p
    WHERE p.id NOT IN (SELECT (elem->>'user_id')::uuid FROM jsonb_array_elements(v_rewards) elem) AND p.is_admin = false;

    -- Send to Telegram channel
    BEGIN
      SELECT anon_key INTO v_anon_key FROM market_notification_config WHERE id = 1;

      IF v_anon_key IS NOT NULL THEN
        SELECT net.http_post(
          url := 'https://hhrgcnvydmjqcevgmlhj.supabase.co/functions/v1/send-telegram-broadcast',
          body := jsonb_build_object(
            'subject', 'Ranking Destruccion TOP 50 - Reparto',
            'body', v_rewards_list_text
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_anon_key,
            'apikey', v_anon_key
          )
        ) INTO v_request_id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Telegram broadcast error: %', SQLERRM;
    END;
  END;

  -- Update distribution record
  UPDATE destruction_ranking_distributions
  SET total_participants = v_distributed_count,
      total_distributed = v_total_calculated
  WHERE id = v_distribution_id;

  -- Deduct from destruction pool
  UPDATE jackpot_pools
  SET destruction_balance = destruction_balance - v_total_calculated,
      updated_at = now()
  WHERE id = 1;

  -- Also update main jackpot
  UPDATE jackpot SET balance = balance - v_total_calculated WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pool de destruccion distribuido correctamente',
    'pool_original', v_pool_balance,
    'total_distributed', v_total_calculated,
    'players_rewarded', v_distributed_count,
    'distribution_id', v_distribution_id
  );
END;
$$;
