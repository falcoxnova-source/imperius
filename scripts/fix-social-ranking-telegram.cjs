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

  const sql = `
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
  v_rewards jsonb := '[]'::jsonb;
  v_first_user_id uuid;
  v_total_calculated numeric := 0;
  v_remainder numeric;
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

  -- First pass: calculate all rewards into jsonb array
  v_rank := 0;
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
    v_rank := v_rank + 1;

    IF v_rank = 1 THEN
      v_first_user_id := v_participant.user_id;
    END IF;

    v_weight := POWER(1.5, v_num_participants - v_rank);
    v_reward_percent := ROUND((v_weight / v_total_weight) * 100, 2);
    v_reward_amount := FLOOR(v_pool_balance * v_weight / v_total_weight);

    v_rewards := v_rewards || jsonb_build_object(
      'user_id', v_participant.user_id,
      'username', v_participant.username,
      'rank', v_rank,
      'points', v_participant.user_points,
      'amount', v_reward_amount,
      'percent', v_reward_percent
    );

    v_total_calculated := v_total_calculated + v_reward_amount;
  END LOOP;

  -- Give remainder to #1
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

    v_total_calculated := v_pool_balance;
  END IF;

  -- Set FXU context to allow balance updates
  PERFORM _internal_set_fxu_context();

  -- Second pass: distribute rewards
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

      -- Record reward
      INSERT INTO social_ranking_rewards (distribution_id, user_id, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_participant.user_id, v_participant.points, v_participant.amount, v_participant.percent);

      -- Send in-game notification to winner
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_participant.user_id,
        NULL,
        '🏆 Recompensa Ranking Social',
        'Felicidades! Puesto #' || v_participant.rank || ' - Has recibido ' || v_participant.amount || ' FXU (' || v_participant.percent || '% del pool) por tus ' || v_participant.points || ' puntos en el ranking social. Los puntos se han reiniciado.',
        'system'
      );

      v_participant_count := v_participant_count + 1;
      v_total_distributed := v_total_distributed + v_participant.amount;
    END IF;
  END LOOP;

  -- Build Telegram broadcast message with full ranking
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
        v_emoji := '🏆';
      ELSIF (v_rewards_elem->>'rank')::int <= 3 THEN
        v_emoji := '🥇';
      ELSIF (v_rewards_elem->>'rank')::int <= 10 THEN
        v_emoji := '🎖️';
      ELSE
        v_emoji := '⭐';
      END IF;
      v_rewards_list_text := v_rewards_list_text || v_emoji || ' #' || (v_rewards_elem->>'rank') || ' ' || (v_rewards_elem->>'username') || ' - ' || (v_rewards_elem->>'amount') || ' FXU (' || (v_rewards_elem->>'percent') || '%)' || chr(10);
    END LOOP;

    v_rewards_list_text := '📱 RANKING SOCIAL (Twitter) - REPARTO 📱' || chr(10) || chr(10)
      || '💰 Pool total: ' || v_pool_balance || ' FXU' || chr(10) || chr(10)
      || v_rewards_list_text || chr(10)
      || '¡Felicidades a los mas activos en redes sociales!' || chr(10)
      || '¿Quieres ganar FXU? ¡Completa las tareas de Twitter!' || chr(10)
      || 'Unete: https://t.me/+1Oo1iGBuQ-xjY2Zh';

    -- Send in-game message to all players NOT in the ranking
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    SELECT p.id, NULL, 'Ranking Social - Reparto', v_rewards_list_text, 'system'
    FROM profiles p
    WHERE p.id NOT IN (SELECT (elem->>'user_id')::uuid FROM jsonb_array_elements(v_rewards) elem) AND p.is_admin = false;

    -- Send to Telegram channel via edge function
    BEGIN
      SELECT anon_key INTO v_anon_key FROM market_notification_config WHERE id = 1;

      IF v_anon_key IS NOT NULL THEN
        SELECT net.http_post(
          url := 'https://hhrgcnvydmjqcevgmlhj.supabase.co/functions/v1/send-telegram-broadcast',
          body := jsonb_build_object(
            'subject', 'Ranking Social (Twitter) - Reparto',
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
  console.log('✅ Function updated with Telegram broadcast + in-game message to all players');

  // Verify
  const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'admin_distribute_social_ranking_pool'`);
  const src = res.rows[0].prosrc;
  const hasTelegram = src.includes('send-telegram-broadcast');
  const hasInGame = src.includes('Ranking Social - Reparto');
  const hasEmojis = src.includes('🏆') && src.includes('🥇');
  console.log(`  Telegram broadcast: ${hasTelegram ? '✅' : '❌'}`);
  console.log(`  In-game message to all: ${hasInGame ? '✅' : '❌'}`);
  console.log(`  Emojis in ranking: ${hasEmojis ? '✅' : '❌'}`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
