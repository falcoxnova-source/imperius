/*
  # Simplify Plus Distribution - Equal Shares

  1. Changes
    - Change monthly pool percentage from 20% to 30%
    - New distribution: Expedition 20%, Monthly 30%, Plus 50%
    - Simplify Plus commission distribution to be EQUAL among all subscribers
    - Remove commission_share_percent from distribution logic
    - Each Plus subscriber gets an equal share regardless of plan tier

  2. How it works now
    - If pool has 1000 FXU and there are 10 Plus subscribers
    - Each subscriber gets 1000 / 10 = 100 FXU
    - Plan tier (monthly, 6-month, annual) does NOT affect the share

  3. Notes
    - The % Comision field in admin is no longer used for distribution
    - All Plus subscribers are treated equally for commission purposes
*/

-- Update monthly percentage to 30%
UPDATE jackpot_pools
SET 
  monthly_percent = 30,
  updated_at = now()
WHERE id = 1;

-- Update the function to distribute Plus commissions EQUALLY
CREATE OR REPLACE FUNCTION admin_distribute_plus_commissions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_pool_balance numeric;
  v_distribution_id uuid;
  v_subscriber RECORD;
  v_reward_amount numeric;
  v_total_distributed numeric := 0;
  v_subscriber_count int := 0;
  v_distribution_month date;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Get current Plus pool balance
  SELECT plus_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;
  
  IF v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool Plus vacio');
  END IF;

  v_distribution_month := date_trunc('month', now())::date;

  -- Check if already distributed this month
  IF EXISTS (SELECT 1 FROM plus_commission_distributions WHERE distribution_month = v_distribution_month) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo este mes');
  END IF;

  -- Expire old subscriptions
  UPDATE plus_subscriptions SET is_active = false WHERE expires_at < now() AND is_active = true;

  -- Count active subscribers
  SELECT COUNT(*)
  INTO v_subscriber_count
  FROM plus_subscriptions
  WHERE is_active = true AND expires_at > now();

  IF v_subscriber_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay suscriptores Plus activos');
  END IF;

  -- Calculate EQUAL share for each subscriber
  v_reward_amount := FLOOR(v_pool_balance / v_subscriber_count);

  IF v_reward_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool muy pequeno para distribuir');
  END IF;

  -- Create distribution record
  INSERT INTO plus_commission_distributions (distribution_month, total_pool_amount, total_subscribers, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_subscriber_count, v_admin_id)
  RETURNING id INTO v_distribution_id;

  -- Distribute EQUAL shares to all subscribers
  FOR v_subscriber IN 
    SELECT ps.id as sub_id, ps.user_id, ps.commission_share_percent, p.username
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    WHERE ps.is_active = true AND ps.expires_at > now()
  LOOP
    -- Add FXU to subscriber (same amount for everyone)
    UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_subscriber.user_id;
    
    -- Update subscription total received
    UPDATE plus_subscriptions 
    SET total_commissions_received = total_commissions_received + v_reward_amount 
    WHERE id = v_subscriber.sub_id;
    
    -- Record reward (share_percent is now 100/subscriber_count for reference)
    INSERT INTO plus_commission_rewards (distribution_id, user_id, subscription_id, share_percent, reward_amount)
    VALUES (v_distribution_id, v_subscriber.user_id, v_subscriber.sub_id, 100.0 / v_subscriber_count, v_reward_amount);
    
    -- Send notification
    INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
    VALUES (
      v_subscriber.user_id,
      'Sistema',
      'Comision Plus Mensual',
      'Has recibido ' || v_reward_amount || ' FXU como comision de tu suscripcion Plus. Este mes habia ' || v_subscriber_count || ' suscriptores activos.',
      'system'
    );
    
    v_total_distributed := v_total_distributed + v_reward_amount;
  END LOOP;

  -- Deduct from Plus pool
  UPDATE jackpot_pools 
  SET plus_balance = plus_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  -- Also update main jackpot
  UPDATE jackpot SET balance = balance - v_total_distributed WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Comisiones Plus distribuidas equitativamente',
    'total_distributed', v_total_distributed,
    'subscribers_paid', v_subscriber_count,
    'amount_per_subscriber', v_reward_amount,
    'distribution_id', v_distribution_id
  );
END;
$$;

-- Update validation function for pool percentages (now must sum to 100)
CREATE OR REPLACE FUNCTION admin_update_jackpot_pools(
  p_expedition_percent int DEFAULT NULL,
  p_monthly_percent int DEFAULT NULL,
  p_plus_percent int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_total int;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Get current values to calculate total
  SELECT 
    COALESCE(p_expedition_percent, expedition_percent) +
    COALESCE(p_monthly_percent, monthly_percent) +
    COALESCE(p_plus_percent, plus_percent)
  INTO v_total
  FROM jackpot_pools WHERE id = 1;

  IF v_total != 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los porcentajes deben sumar 100%');
  END IF;

  UPDATE jackpot_pools
  SET 
    expedition_percent = COALESCE(p_expedition_percent, expedition_percent),
    monthly_percent = COALESCE(p_monthly_percent, monthly_percent),
    plus_percent = COALESCE(p_plus_percent, plus_percent),
    updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'message', 'Porcentajes actualizados');
END;
$$;
