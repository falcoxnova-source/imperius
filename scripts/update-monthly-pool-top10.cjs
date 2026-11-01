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
  v_weight numeric;
  v_total_weight numeric := 0;
  v_reward_percent numeric;
  v_reward_amount numeric;
  v_total_calculated numeric := 0;
  v_remainder numeric;
  v_distribution_month date;
  v_rewards jsonb := '[]'::jsonb;
  v_first_player_id uuid;
  v_base numeric := 1.3;
  v_i int;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT monthly_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance IS NULL OR v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool mensual vacio o sin fondos');
  END IF;

  -- Calcular peso total con factor 1.3 para TOP 10
  -- Posicion 1: 1.3^9, Posicion 2: 1.3^8, ..., Posicion 10: 1.3^0
  FOR v_i IN 0..9 LOOP
    v_total_weight := v_total_weight + power(v_base, 9 - v_i);
  END LOOP;

  v_distribution_month := date_trunc('month', now())::date;

  INSERT INTO monthly_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  FOR v_player IN 
    SELECT p.id, p.username, p.points_total
    FROM profiles p
    WHERE p.points_total > 0 AND p.is_admin = false
    ORDER BY p.points_total DESC
    LIMIT 10
  LOOP
    v_rank := v_rank + 1;

    IF v_rank = 1 THEN
      v_first_player_id := v_player.id;
    END IF;

    -- Factor exponencial 1.3: posicion 1 = 1.3^9, posicion 10 = 1.3^0
    v_weight := power(v_base, 10 - v_rank);
    v_reward_percent := ROUND((v_weight / v_total_weight) * 100, 2);
    v_reward_amount := FLOOR(v_pool_balance * v_weight / v_total_weight);

    v_rewards := v_rewards || jsonb_build_object(
      'user_id', v_player.id,
      'username', v_player.username,
      'rank', v_rank,
      'points', v_player.points_total,
      'amount', v_reward_amount,
      'percent', v_reward_percent
    );

    v_total_calculated := v_total_calculated + v_reward_amount;
  END LOOP;

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

  PERFORM _internal_set_fxu_context();

  FOR v_player IN 
    SELECT 
      (elem->>'user_id')::uuid as user_id,
      (elem->>'rank')::int as rank,
      (elem->>'points')::numeric as points,
      (elem->>'amount')::numeric as amount,
      (elem->>'percent')::numeric as percent
    FROM jsonb_array_elements(v_rewards) elem
  LOOP
    IF v_player.amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_player.amount WHERE id = v_player.user_id;

      INSERT INTO monthly_ranking_rewards (distribution_id, user_id, rank_position, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_player.user_id, v_player.rank, v_player.points, v_player.amount, v_player.percent);

      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_player.user_id,
        NULL,
        'Recompensa Ranking Mensual TOP 10',
        'Felicidades! Puesto #' || v_player.rank || ' - Has recibido ' || v_player.amount || ' FXU (' || v_player.percent || '% del pool).',
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
        v_emoji := '🎖️';
      END IF;
      v_rewards_list_text := v_rewards_list_text || v_emoji || ' #' || (v_rewards_elem->>'rank') || ' ' || (v_rewards_elem->>'username') || ' - ' || (v_rewards_elem->>'amount') || ' FXU (' || (v_rewards_elem->>'percent') || '%)' || chr(10);
    END LOOP;

    v_rewards_list_text := '🌟 RANKING MENSUAL TOP 10 - REPARTO 🌟' || chr(10) || chr(10) 
      || '💰 Pool total: ' || v_pool_balance || ' FXU' || chr(10) || chr(10)
      || v_rewards_list_text || chr(10)
      || '¡Felicidades a todos los ganadores!' || chr(10)
      || '¿Quieres estar en el TOP? ¡Juega y sube en el ranking!' || chr(10)
      || 'Únete: https://t.me/+1Oo1iGBuQ-xjY2Zh';

    -- Enviar mensaje in-game a todos los jugadores que no están en el top
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    SELECT p.id, NULL, 'Ranking Mensual - Reparto TOP 10', v_rewards_list_text, 'system'
    FROM profiles p
    WHERE p.id NOT IN (SELECT (elem->>'user_id')::uuid FROM jsonb_array_elements(v_rewards) elem) AND p.is_admin = false;

    -- Enviar al canal de Telegram via edge function
    BEGIN
      SELECT anon_key INTO v_anon_key FROM market_notification_config WHERE id = 1;
      
      IF v_anon_key IS NOT NULL THEN
        SELECT net.http_post(
          url := 'https://hhrgcnvydmjqcevgmlhj.supabase.co/functions/v1/send-telegram-broadcast',
          body := jsonb_build_object(
            'subject', 'Ranking Mensual TOP 10 - Reparto',
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

  UPDATE jackpot_pools 
  SET monthly_balance = 0,
      updated_at = now()
  WHERE id = 1;

  UPDATE jackpot SET balance = balance - v_total_calculated WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pool distribuido correctamente a TOP 10',
    'pool_original', v_pool_balance,
    'total_distributed', v_total_calculated,
    'players_rewarded', v_distributed_count,
    'distribution_id', v_distribution_id
  );
END;
$$;
`;

  await client.query(sql);
  console.log('✅ admin_distribute_monthly_pool actualizado a TOP 10 con factor 1.3');
  console.log('');
  console.log('Distribución con factor 1.3:');
  console.log('  #1:  19.50%');
  console.log('  #2:  15.00%');
  console.log('  #3:  11.54%');
  console.log('  #4:   8.88%');
  console.log('  #5:   6.83%');
  console.log('  #6:   5.26%');
  console.log('  #7:   4.04%');
  console.log('  #8:   3.11%');
  console.log('  #9:   2.39%');
  console.log('  #10:  1.84%');
  
  await client.end();
}

main().catch(console.error);
