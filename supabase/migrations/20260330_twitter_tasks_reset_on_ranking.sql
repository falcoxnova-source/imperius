-- =====================================================
-- MIGRACIÓN: Filtrar tareas de Twitter por fecha de reinicio del ranking
-- =====================================================
-- Cuando se reinicia el ranking social, las tareas/misiones antiguas
-- ya no aparecen. Solo se muestran tweets creados después del último reinicio.
-- =====================================================

-- 1. Agregar columna ranking_reset_at a twitter_social_config
ALTER TABLE twitter_social_config 
ADD COLUMN IF NOT EXISTS ranking_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Inicializar con la fecha actual (todas las misiones existentes se consideran "actuales")
UPDATE twitter_social_config SET ranking_reset_at = NOW() WHERE ranking_reset_at IS NULL;

-- =====================================================
-- 2. Actualizar get_active_twitter_missions para filtrar por fecha de reinicio
-- =====================================================
CREATE OR REPLACE FUNCTION get_active_twitter_missions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_missions jsonb;
  v_reset_at timestamptz;
BEGIN
  v_user_id := auth.uid();

  -- Obtener fecha del último reinicio del ranking
  SELECT ranking_reset_at INTO v_reset_at FROM twitter_social_config LIMIT 1;
  
  -- Si no hay fecha, usar epoch (mostrar todo)
  IF v_reset_at IS NULL THEN
    v_reset_at := '1970-01-01'::timestamptz;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'tweet_id', m.tweet_id,
      'tweet_url', m.tweet_url,
      'description', m.description,
      'hashtag', m.hashtag,
      'created_at', m.created_at,
      'user_quote_tweet', (
        SELECT jsonb_build_object('validated', ta.validated, 'user_tweet_url', ta.user_tweet_url, 'points', ta.points_awarded)
        FROM twitter_actions ta
        WHERE ta.mission_id = m.id AND ta.user_id = v_user_id AND ta.action_type = 'quote_tweet'
      ),
      'user_comment', (
        SELECT jsonb_build_object('validated', ta.validated, 'user_tweet_url', ta.user_tweet_url, 'points', ta.points_awarded)
        FROM twitter_actions ta
        WHERE ta.mission_id = m.id AND ta.user_id = v_user_id AND ta.action_type = 'comment'
      )
    ) ORDER BY m.created_at DESC
  )
  INTO v_missions
  FROM twitter_missions m
  WHERE m.is_active = true
    AND m.created_at >= v_reset_at;  -- Solo misiones creadas después del último reinicio

  RETURN jsonb_build_object(
    'success', true,
    'missions', COALESCE(v_missions, '[]'::jsonb)
  );
END;
$$;

-- =====================================================
-- 3. Actualizar get_twitter_social_ranking para filtrar por fecha de reinicio
-- =====================================================
CREATE OR REPLACE FUNCTION get_twitter_social_ranking(p_limit integer DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ranking jsonb;
  v_reset_at timestamptz;
BEGIN
  -- Obtener fecha del último reinicio del ranking
  SELECT ranking_reset_at INTO v_reset_at FROM twitter_social_config LIMIT 1;
  
  IF v_reset_at IS NULL THEN
    v_reset_at := '1970-01-01'::timestamptz;
  END IF;

  SELECT jsonb_agg(row_data ORDER BY total_points DESC)
  INTO v_ranking
  FROM (
    SELECT jsonb_build_object(
      'user_id', tl.user_id,
      'twitter_username', tl.twitter_username,
      'username', p.username,
      'total_points', COALESCE(SUM(ta.points_awarded), 0),
      'total_actions', COUNT(ta.id) FILTER (WHERE ta.points_awarded > 0),
      'quote_tweets', COUNT(ta.id) FILTER (WHERE ta.action_type = 'quote_tweet' AND ta.points_awarded > 0),
      'comments', COUNT(ta.id) FILTER (WHERE ta.action_type = 'comment' AND ta.points_awarded > 0)
    ) as row_data,
    COALESCE(SUM(ta.points_awarded), 0) as total_points
    FROM twitter_links tl
    INNER JOIN profiles p ON p.id = tl.user_id
    LEFT JOIN twitter_actions ta ON ta.user_id = tl.user_id 
      AND ta.validated = true
      AND ta.created_at >= v_reset_at  -- Solo acciones del período actual
    GROUP BY tl.user_id, tl.twitter_username, p.username
    HAVING COALESCE(SUM(ta.points_awarded), 0) > 0
    ORDER BY total_points DESC
    LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'ranking', COALESCE(v_ranking, '[]'::jsonb)
  );
END;
$$;

-- =====================================================
-- 4. Actualizar get_twitter_task_status para contar solo puntos del período actual
-- =====================================================
CREATE OR REPLACE FUNCTION get_twitter_task_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_link twitter_links%ROWTYPE;
  v_total_points bigint;
  v_total_actions bigint;
  v_config twitter_social_config%ROWTYPE;
  v_reset_at timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_config FROM twitter_social_config LIMIT 1;
  SELECT * INTO v_link FROM twitter_links WHERE user_id = v_user_id;

  -- Obtener fecha del último reinicio
  v_reset_at := COALESCE(v_config.ranking_reset_at, '1970-01-01'::timestamptz);

  IF v_link IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'twitter_linked', false,
      'total_points', 0,
      'total_actions', 0,
      'link_reward_fxu', COALESCE(v_config.link_reward_fxu, 20)
    );
  END IF;

  -- Solo contar puntos/acciones del período actual
  SELECT COALESCE(SUM(points_awarded), 0), COUNT(*)
  INTO v_total_points, v_total_actions
  FROM twitter_actions
  WHERE user_id = v_user_id 
    AND validated = true
    AND created_at >= v_reset_at;

  RETURN jsonb_build_object(
    'success', true,
    'twitter_linked', true,
    'twitter_username', v_link.twitter_username,
    'link_reward_claimed', v_link.link_reward_claimed,
    'link_reward_fxu', COALESCE(v_config.link_reward_fxu, 20),
    'total_points', v_total_points,
    'total_actions', v_total_actions,
    'quote_tweet_points', COALESCE(v_config.quote_tweet_points, 10),
    'comment_points', COALESCE(v_config.comment_points, 5)
  );
END;
$$;

-- =====================================================
-- 5. Actualizar admin_distribute_social_ranking_pool para guardar la fecha de reinicio
--    y también solo contar puntos del período actual
-- =====================================================
CREATE OR REPLACE FUNCTION admin_distribute_social_ranking_pool()
RETURNS JSONB
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
  v_rewards jsonb := '[]'::jsonb;
  v_first_user_id uuid;
  v_total_calculated numeric := 0;
  v_remainder numeric;
  v_reset_at timestamptz;
  i int;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Get current social ranking pool balance
  SELECT plus_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool de ranking social vacio');
  END IF;

  v_distribution_month := date_trunc('month', now())::date;

  -- Obtener fecha del último reinicio
  SELECT ranking_reset_at INTO v_reset_at FROM twitter_social_config LIMIT 1;
  IF v_reset_at IS NULL THEN
    v_reset_at := '1970-01-01'::timestamptz;
  END IF;

  -- Calculate total points from validated actions del período actual
  SELECT COALESCE(SUM(ta.points_awarded), 0)
  INTO v_total_points
  FROM twitter_actions ta
  WHERE ta.validated = true 
    AND ta.points_awarded > 0
    AND ta.created_at >= v_reset_at;

  IF v_total_points <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay participantes con puntos de tareas sociales en este periodo');
  END IF;

  -- Count participants
  SELECT COUNT(*) INTO v_num_participants
  FROM (
    SELECT ta.user_id
    FROM twitter_actions ta
    WHERE ta.validated = true 
      AND ta.points_awarded > 0
      AND ta.created_at >= v_reset_at
    GROUP BY ta.user_id
    HAVING SUM(ta.points_awarded) > 0
  ) sub;

  -- Pre-calculate total exponential weight (base 1.03)
  FOR i IN 1..v_num_participants LOOP
    v_total_weight := v_total_weight + POWER(1.03, v_num_participants - i);
  END LOOP;

  -- Create distribution record
  INSERT INTO social_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  -- First pass: calculate all rewards
  v_rank := 0;
  FOR v_participant IN
    SELECT
      ta.user_id,
      p.username,
      SUM(ta.points_awarded) as user_points
    FROM twitter_actions ta
    JOIN profiles p ON p.id = ta.user_id
    WHERE ta.validated = true 
      AND ta.points_awarded > 0
      AND ta.created_at >= v_reset_at
    GROUP BY ta.user_id, p.username
    HAVING SUM(ta.points_awarded) > 0
    ORDER BY SUM(ta.points_awarded) DESC
  LOOP
    v_rank := v_rank + 1;

    IF v_rank = 1 THEN
      v_first_user_id := v_participant.user_id;
    END IF;

    v_weight := POWER(1.03, v_num_participants - v_rank);
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

  -- Set FXU context
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

      INSERT INTO social_ranking_rewards (distribution_id, user_id, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_participant.user_id, v_participant.points, v_participant.amount, v_participant.percent);

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

  -- Telegram broadcast
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

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    SELECT p.id, NULL, 'Ranking Social - Reparto', v_rewards_list_text, 'system'
    FROM profiles p
    WHERE p.id NOT IN (SELECT (elem->>'user_id')::uuid FROM jsonb_array_elements(v_rewards) elem) AND p.is_admin = false;

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

  -- Deduct from pool
  UPDATE jackpot_pools
  SET plus_balance = plus_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  UPDATE jackpot SET balance = balance - v_total_distributed WHERE id = 1;

  -- Reset points to 0 (for audit trail)
  UPDATE twitter_actions
  SET points_awarded = 0
  WHERE validated = true AND points_awarded > 0;

  -- *** CLAVE: Guardar la fecha de reinicio para que las misiones viejas no aparezcan ***
  UPDATE twitter_social_config SET ranking_reset_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Ranking social distribuido y puntos reiniciados. Las tareas antiguas ya no apareceran.',
    'total_distributed', v_total_distributed,
    'participants_rewarded', v_participant_count,
    'total_points_reset', v_total_points,
    'distribution_id', v_distribution_id
  );
END;
$$;
