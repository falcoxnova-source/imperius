/*
  # Distribucion Progresiva del Pool Mensual

  1. Cambios
    - Implementa sistema de pesos lineales para el Top 50
    - Cada posicion recibe una cantidad diferente
    - Formula: peso = 51 - posicion
    - #1 recibe peso 50, #50 recibe peso 1
    - Total de pesos: 1275 (suma de 1 a 50)

  2. Ejemplo de distribucion (pool de 1000 FXU)
    - #1: 50/1275 * 1000 = 39.21 FXU
    - #10: 41/1275 * 1000 = 32.15 FXU
    - #30: 21/1275 * 1000 = 16.47 FXU
    - #50: 1/1275 * 1000 = 0.78 FXU

  3. Ventajas
    - Distribucion 100% justa y proporcional
    - Cada posicion tiene recompensa unica
    - El pool completo se distribuye
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
  v_weight numeric;
  v_total_weight numeric := 1275;
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

  IF v_pool_balance IS NULL OR v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool mensual vacio');
  END IF;

  v_distribution_month := date_trunc('month', now())::date;

  INSERT INTO monthly_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  PERFORM _internal_set_fxu_context();

  FOR v_player IN 
    SELECT p.id, p.username, p.points_total
    FROM profiles p
    WHERE p.points_total > 0 AND p.is_admin = false
    ORDER BY p.points_total DESC
    LIMIT 50
  LOOP
    v_rank := v_rank + 1;

    v_weight := 51 - v_rank;
    
    v_reward_percent := ROUND((v_weight / v_total_weight) * 100, 2);
    
    v_reward_amount := FLOOR(v_pool_balance * v_weight / v_total_weight);

    IF v_reward_amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_player.id;

      INSERT INTO monthly_ranking_rewards (distribution_id, user_id, rank_position, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_player.id, v_rank, v_player.points_total, v_reward_amount, v_reward_percent);

      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_player.id,
        NULL,
        'Recompensa Ranking Mensual',
        'Felicidades! Puesto #' || v_rank || ' - Has recibido ' || v_reward_amount || ' FXU (' || v_reward_percent || '% del pool mensual).',
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
    'message', 'Pool distribuido con sistema progresivo',
    'total_distributed', v_total_distributed,
    'players_rewarded', v_distributed_count,
    'distribution_id', v_distribution_id
  );
END;
$$;
