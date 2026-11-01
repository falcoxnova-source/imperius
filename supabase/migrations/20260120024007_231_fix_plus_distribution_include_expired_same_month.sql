/*
  # Fix Plus Distribution - Include Recently Expired Subscriptions

  1. Problem
    - If a user has Plus for the entire month but it expires on the 31st
    - And the admin distributes on the 1st of the next month
    - The user would not receive their share (unfair!)

  2. Solution
    - Include subscriptions that were active during ANY part of the distribution month
    - Even if they expired, as long as they overlapped with the month being distributed

  3. Logic
    - A subscription qualifies if:
      - It started before or during the distribution month AND
      - It expired after the start of the distribution month (or is still active)
    - This ensures anyone who had Plus during the month gets their share

  4. Example
    - Distribution month: January 2026
    - User A: Plus from Jan 1 to Jan 31 (expired) - INCLUDED
    - User B: Plus from Jan 15 to Feb 15 (active) - INCLUDED
    - User C: Plus from Dec 1 to Dec 31 (expired in December) - NOT INCLUDED
    - User D: Plus from Feb 1 onwards - NOT INCLUDED (wasn't active in January)
*/

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
  v_month_start timestamptz;
  v_month_end timestamptz;
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

  -- Determine which month we're distributing for
  -- If we're in the first 5 days of the month, distribute for PREVIOUS month
  -- Otherwise distribute for current month
  IF EXTRACT(DAY FROM now()) <= 5 THEN
    v_distribution_month := (date_trunc('month', now()) - interval '1 month')::date;
  ELSE
    v_distribution_month := date_trunc('month', now())::date;
  END IF;
  
  v_month_start := v_distribution_month::timestamptz;
  v_month_end := (v_distribution_month + interval '1 month')::timestamptz;

  -- Check if already distributed for this month
  IF EXISTS (SELECT 1 FROM plus_commission_distributions WHERE distribution_month = v_distribution_month) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo para ' || to_char(v_distribution_month, 'Month YYYY'));
  END IF;

  -- Mark expired subscriptions as inactive
  UPDATE plus_subscriptions SET is_active = false WHERE expires_at < now() AND is_active = true;

  -- Count eligible subscribers: anyone who had Plus during the distribution month
  -- A subscription qualifies if it started before month end AND expired after month start (or is still active)
  SELECT COUNT(DISTINCT ps.user_id)
  INTO v_subscriber_count
  FROM plus_subscriptions ps
  WHERE ps.started_at < v_month_end
    AND ps.expires_at > v_month_start;

  IF v_subscriber_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay suscriptores Plus para ' || to_char(v_distribution_month, 'Month YYYY'));
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

  -- Distribute EQUAL shares to all eligible subscribers
  -- Use DISTINCT ON to handle users with multiple subscriptions (give them only one share)
  FOR v_subscriber IN 
    SELECT DISTINCT ON (ps.user_id) 
      ps.id as sub_id, 
      ps.user_id, 
      p.username
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    WHERE ps.started_at < v_month_end
      AND ps.expires_at > v_month_start
    ORDER BY ps.user_id, ps.expires_at DESC
  LOOP
    -- Add FXU to subscriber (same amount for everyone)
    UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_subscriber.user_id;
    
    -- Update subscription total received
    UPDATE plus_subscriptions 
    SET total_commissions_received = total_commissions_received + v_reward_amount 
    WHERE id = v_subscriber.sub_id;
    
    -- Record reward
    INSERT INTO plus_commission_rewards (distribution_id, user_id, subscription_id, share_percent, reward_amount)
    VALUES (v_distribution_id, v_subscriber.user_id, v_subscriber.sub_id, 100.0 / v_subscriber_count, v_reward_amount);
    
    -- Send notification
    INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
    VALUES (
      v_subscriber.user_id,
      'Sistema',
      'Comision Plus - ' || to_char(v_distribution_month, 'Month YYYY'),
      'Has recibido ' || v_reward_amount || ' FXU como comision de tu suscripcion Plus para ' || to_char(v_distribution_month, 'Month YYYY') || '. Hubo ' || v_subscriber_count || ' suscriptores elegibles.',
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
    'message', 'Comisiones Plus distribuidas para ' || to_char(v_distribution_month, 'Month YYYY'),
    'distribution_month', v_distribution_month,
    'total_distributed', v_total_distributed,
    'subscribers_paid', v_subscriber_count,
    'amount_per_subscriber', v_reward_amount,
    'distribution_id', v_distribution_id
  );
END;
$$;
