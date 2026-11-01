-- [TOP100] Reparto diario del pool: TOP 50 -> TOP 100.
-- Importes con 2 decimales (con 100 puestos y FLOOR entero los ultimos cobraban 0).
-- Telegram: lista en 2 mensajes (1-50 y 51-100) por el limite de 4096 caracteres.
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
  -- [TG v26] comunicado en Telegram (best-effort, no afecta al reparto)
  v_tg_body text;
  v_tg_top text := '';
  v_tg_top2 text := '';
  v_internal_token text;
  v_request_id bigint;
  v_tung_price numeric;
  v_medal text;
BEGIN
  v_admin_id := auth.uid();

  -- [DIARIO v25] session_user = postgres => llamada del cron / conexion directa (no pasa por PostgREST)
  IF session_user <> 'postgres'
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT monthly_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance IS NULL OR v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool mensual vacio');
  END IF;

  -- [DIARIO v25] reparto DIARIO: la clave pasa a ser el dia actual
  v_distribution_month := CURRENT_DATE;

  IF EXISTS (SELECT 1 FROM monthly_ranking_distributions WHERE distribution_month = v_distribution_month) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo hoy');
  END IF;

  -- TOP 100 players by ranking points (non-admin)
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
  LIMIT 100;

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

  -- [TG v26] precio TUNG en vivo. Si falla queda NULL y no se muestra USDT.
  BEGIN
    v_tung_price := public.get_live_tung_price_usd();
  EXCEPTION WHEN OTHERS THEN
    v_tung_price := NULL;
  END;

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
    v_reward_amount := ROUND(FLOOR(v_pool_balance * v_weight / v_total_weight * 100) / 100, 2);

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
        '🏆 Recompensa diaria del TOP 100',
        '🏆 ¡Estas en el puesto #' || v_participant.rank || ' del TOP 100!' || E'\n\n' ||
        '💰 Has recibido ' || v_participant.amount || ' TUNG' || public.format_usd_suffix(v_participant.amount, v_tung_price) ||
        ' (' || v_participant.percent || '% del pool).' || E'\n\n' ||
        '⭐ Puntos: ' || v_participant.points || E'\n\n' ||
        '⚔️ El pool del TOP 100 se reparte AUTOMATICAMENTE cada 24 horas. Sube de puesto y cobra mas manana.',
        'system'
      );

      -- [TG v27] lista COMPLETA de los 100 para Telegram (1-50 y 51-100 en mensajes separados)
      v_medal := CASE v_participant.rank
                   WHEN 1 THEN '🥇'
                   WHEN 2 THEN '🥈'
                   WHEN 3 THEN '🥉'
                   ELSE '🔹' END;
      IF v_participant.rank <= 50 THEN
        v_tg_top := v_tg_top
          || v_medal || ' #' || v_participant.rank || ' ' || COALESCE(v_participant.username, 'Comandante')
          || ' - ' || v_participant.amount || ' TUNG'
          || public.format_usd_suffix(v_participant.amount, v_tung_price)
          || chr(10);
      ELSE
        v_tg_top2 := v_tg_top2
          || v_medal || ' #' || v_participant.rank || ' ' || COALESCE(v_participant.username, 'Comandante')
          || ' - ' || v_participant.amount || ' TUNG'
          || public.format_usd_suffix(v_participant.amount, v_tung_price)
          || chr(10);
      END IF;

      v_distributed_count := v_distributed_count + 1;
      v_total_distributed := v_total_distributed + v_participant.amount;
    END IF;
  END LOOP;

  -- Deduct distributed amount from the monthly pool
  UPDATE jackpot_pools
  SET monthly_balance = monthly_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  -- [TG v26] Comunicado en Telegram (best-effort; el reparto ya esta cerrado)
  BEGIN
    IF v_total_distributed > 0 THEN
      v_tg_body :=
           '🏆 ¡Reparto DIARIO del TOP 100 completado!' || chr(10) || chr(10)
        || '💰 Total repartido: ' || v_total_distributed || ' TUNG'
        || public.format_usd_suffix(v_total_distributed, v_tung_price) || chr(10)
        || '👥 Comandantes premiados: ' || v_distributed_count || chr(10) || chr(10)
        || '--- REPARTO ENTRE EL TOP 100 (puestos 1-50) ---' || chr(10)
        || v_tg_top || chr(10)
        || '⚔️ El pool del TOP 100 se reparte AUTOMATICAMENTE cada 24 horas entre los 100 mejores del ranking.' || chr(10)
        || '🚀 Sube de puesto, gana puntos y cobra TUNG todos los dias.' || chr(10)
        || '👉 Unete: https://t.me/TrungTungMeme' || chr(10) || '💚 WhatsApp: https://chat.whatsapp.com/GU9awkTSFXSLDWBMQW8XHo';

      SELECT internal_broadcast_token INTO v_internal_token
      FROM market_notification_config WHERE id = 1;

      IF v_internal_token IS NOT NULL AND v_internal_token <> '' THEN
        SELECT net.http_post(
          url := 'http://172.18.0.1:9002/internal-telegram-broadcast',
          body := jsonb_build_object(
            'token', v_internal_token,
            'subject', 'Reparto diario del TOP 100',
            'body', v_tg_body
          ),
          headers := jsonb_build_object('Content-Type', 'application/json')
        ) INTO v_request_id;

        IF v_tg_top2 <> '' THEN
          SELECT net.http_post(
            url := 'http://172.18.0.1:9002/internal-telegram-broadcast',
            body := jsonb_build_object(
              'token', v_internal_token,
              'subject', 'Reparto diario del TOP 100 (puestos 51-100)',
              'body', v_tg_top2
            ),
            headers := jsonb_build_object('Content-Type', 'application/json')
          ) INTO v_request_id;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Telegram broadcast (top 100) fallo: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pool mensual distribuido',
    'total_distributed', v_total_distributed,
    'players_rewarded', v_distributed_count,
    'distribution_id', v_distribution_id
  );
END;
$function$;

