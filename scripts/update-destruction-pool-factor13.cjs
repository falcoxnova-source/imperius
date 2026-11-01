const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Conectado a la base de datos...');

  const sql = `
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
  v_base numeric := 1.3;
  v_i int;
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

  -- Get destruction ranking data into a temp table for processing (TOP 10 only)
  CREATE TEMP TABLE temp_dest_dist (
    rank_num int,
    uid uuid,
    uname text,
    dpoints bigint
  ) ON COMMIT DROP;

  INSERT INTO temp_dest_dist (rank_num, uid, uname, dpoints)
  SELECT
    ROW_NUMBER() OVER (ORDER BY dr.destruction_points DESC)::int,
    dr.user_id,
    dr.username,
    dr.destruction_points
  FROM get_destruction_ranking() dr
  LIMIT 10;

  SELECT COUNT(*) INTO v_num_participants FROM temp_dest_dist;

  IF v_num_participants = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay jugadores con puntos de destruccion');
  END IF;

  -- Calcular peso total con factor 1.3 para los participantes reales
  -- Posicion 1: 1.3^(n-1), Posicion 2: 1.3^(n-2), ..., Posicion n: 1.3^0
  FOR v_i IN 1..v_num_participants LOOP
    v_total_weight := v_total_weight + power(v_base, v_num_participants - v_i);
  END LOOP;

  INSERT INTO destruction_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  ON CONFLICT (distribution_month) DO UPDATE SET
    total_pool_amount = EXCLUDED.total_pool_amount,
    distributed_by = EXCLUDED.distributed_by,
    distributed_at = now()
  RETURNING id INTO v_distribution_id;

  FOR v_player IN
    SELECT rank_num, uid, uname, dpoints FROM temp_dest_dist ORDER BY rank_num
  LOOP
    v_rank := v_player.rank_num;

    IF v_rank = 1 THEN
      v_first_player_id := v_player.uid;
    END IF;

    -- Factor exponencial 1.3: posicion 1 = 1.3^(n-1), posicion n = 1.3^0
    v_weight := power(v_base, v_num_participants - v_rank);
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
        'Recompensa Ranking Destruccion TOP 10',
        'Felicidades Destructor! Puesto #' || v_player.rank || ' - Has recibido ' || v_player.amount || ' FXU (' || v_player.percent || '% del pool de destruccion).',
        'system'
      );

      v_distributed_count := v_distributed_count + 1;
    END IF;
  END LOOP;

  -- Generar mensaje con nombres y montos para Telegram y jugadores
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
      ELSE
        v_emoji := '🔥';
      END IF;
      v_rewards_list_text := v_rewards_list_text || v_emoji || ' #' || (v_rewards_elem->>'rank') || ' ' || (v_rewards_elem->>'username') || ' - ' || (v_rewards_elem->>'amount') || ' FXU (' || (v_rewards_elem->>'percent') || '%)' || chr(10);
    END LOOP;

    v_rewards_list_text := '🔥 RANKING DESTRUCCION TOP 10 - REPARTO 🔥' || chr(10) || chr(10) 
      || '💰 Pool total: ' || v_pool_balance || ' FXU' || chr(10) || chr(10)
      || v_rewards_list_text || chr(10)
      || '¡Felicidades a todos los destructores!' || chr(10)
      || '¿Quieres estar en el TOP? ¡Destruye y conquista!' || chr(10)
      || 'Únete: https://t.me/+1Oo1iGBuQ-xjY2Zh';

    -- Enviar mensaje in-game a todos los jugadores que no están en el top
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    SELECT p.id, NULL, 'Ranking Destruccion - Reparto TOP 10', v_rewards_list_text, 'system'
    FROM profiles p
    WHERE p.id NOT IN (SELECT (elem->>'user_id')::uuid FROM jsonb_array_elements(v_rewards) elem) AND p.is_admin = false;

    -- Enviar al canal de Telegram via edge function
    BEGIN
      SELECT anon_key INTO v_anon_key FROM market_notification_config WHERE id = 1;
      
      IF v_anon_key IS NOT NULL THEN
        SELECT net.http_post(
          url := 'https://hhrgcnvydmjqcevgmlhj.supabase.co/functions/v1/send-telegram-broadcast',
          body := jsonb_build_object(
            'subject', 'Ranking Destruccion TOP 10 - Reparto',
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

  -- Reset destruction pool balance
  UPDATE jackpot_pools 
  SET destruction_balance = 0,
      updated_at = now()
  WHERE id = 1;

  -- Reset destruction points for all players (new period starts)
  UPDATE battle_reports SET counted_for_ranking = true WHERE counted_for_ranking = false;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pool de destruccion distribuido correctamente a TOP 10',
    'pool_original', v_pool_balance,
    'total_distributed', v_total_calculated,
    'players_rewarded', v_distributed_count,
    'distribution_id', v_distribution_id
  );
END;
$$;
`;

  await client.query(sql);
  console.log('✅ admin_distribute_destruction_pool actualizado a TOP 10 con factor 1.3');
  console.log('');
  console.log('Distribución con factor 1.3 (misma que mensual):');
  console.log('  🏆 #1:  19.50%');
  console.log('  🥇 #2:  15.00%');
  console.log('  🥇 #3:  11.54%');
  console.log('  🔥 #4:   8.88%');
  console.log('  🔥 #5:   6.83%');
  console.log('  🔥 #6:   5.26%');
  console.log('  🔥 #7:   4.04%');
  console.log('  🔥 #8:   3.11%');
  console.log('  🔥 #9:   2.39%');
  console.log('  🔥 #10:  1.84%');
  
  await client.end();
}

main().catch(console.error);
