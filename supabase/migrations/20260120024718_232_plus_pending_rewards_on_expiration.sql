/*
  # Plus Pending Rewards System

  1. New Approach
    - When a Plus subscription expires, calculate and lock their reward share
    - Store the pending reward amount
    - Admin distribution pays out all pending rewards

  2. New Table
    - `plus_pending_rewards` - Stores calculated rewards waiting for distribution

  3. New Function
    - `calculate_expired_plus_rewards()` - Runs periodically to calculate pending rewards
    - Modified `admin_distribute_plus_commissions()` - Pays out pending rewards

  4. How it works
    - When Plus expires, the system calculates their share based on current pool
    - That amount is reserved (deducted from pool) and stored as pending
    - When admin distributes, all pending rewards are paid out
    - This ensures users get their fair share even if distribution is delayed
*/

-- Table to store pending rewards for expired Plus subscriptions
CREATE TABLE IF NOT EXISTS plus_pending_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES plus_subscriptions(id) ON DELETE CASCADE,
  reward_amount numeric NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  subscription_month date NOT NULL,
  paid_out boolean NOT NULL DEFAULT false,
  paid_out_at timestamptz,
  distribution_id uuid REFERENCES plus_commission_distributions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plus_pending_rewards_user ON plus_pending_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_plus_pending_rewards_unpaid ON plus_pending_rewards(paid_out) WHERE paid_out = false;

ALTER TABLE plus_pending_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pending rewards"
  ON plus_pending_rewards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Add column to track if reward was already calculated for a subscription
ALTER TABLE plus_subscriptions ADD COLUMN IF NOT EXISTS reward_calculated boolean DEFAULT false;
ALTER TABLE plus_subscriptions ADD COLUMN IF NOT EXISTS pending_reward_amount numeric DEFAULT 0;

-- Function to calculate pending rewards for expired subscriptions
CREATE OR REPLACE FUNCTION calculate_expired_plus_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_sub RECORD;
  v_pool_balance numeric;
  v_active_count int;
  v_share_amount numeric;
  v_total_calculated numeric := 0;
  v_count int := 0;
  v_subscription_month date;
BEGIN
  -- Get current pool balance
  SELECT plus_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;
  
  IF v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', true, 'message', 'Pool vacio, nada que calcular', 'calculated', 0);
  END IF;

  -- Process each expired subscription that hasn't had rewards calculated
  FOR v_expired_sub IN 
    SELECT ps.id, ps.user_id, ps.expires_at, ps.started_at
    FROM plus_subscriptions ps
    WHERE ps.expires_at < now()
      AND ps.reward_calculated = false
    ORDER BY ps.expires_at ASC
  LOOP
    -- Determine which month this subscription covered
    v_subscription_month := date_trunc('month', v_expired_sub.expires_at - interval '1 day')::date;
    
    -- Check if we already calculated a reward for this user for this month
    IF EXISTS (
      SELECT 1 FROM plus_pending_rewards 
      WHERE user_id = v_expired_sub.user_id 
        AND subscription_month = v_subscription_month
    ) THEN
      -- Mark as calculated but don't create duplicate
      UPDATE plus_subscriptions SET reward_calculated = true WHERE id = v_expired_sub.id;
      CONTINUE;
    END IF;
    
    -- Re-fetch current pool balance (it might have changed)
    SELECT plus_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;
    
    IF v_pool_balance <= 0 THEN
      EXIT; -- No more balance to distribute
    END IF;
    
    -- Count total active/pending subscribers for fair share calculation
    -- Include: active subs + expired subs without calculated rewards
    SELECT COUNT(DISTINCT user_id) INTO v_active_count
    FROM plus_subscriptions
    WHERE (is_active = true OR (expires_at < now() AND reward_calculated = false));
    
    IF v_active_count <= 0 THEN
      v_active_count := 1;
    END IF;
    
    -- Calculate equal share
    v_share_amount := FLOOR(v_pool_balance / v_active_count);
    
    IF v_share_amount > 0 THEN
      -- Reserve this amount from the pool
      UPDATE jackpot_pools 
      SET plus_balance = plus_balance - v_share_amount,
          updated_at = now()
      WHERE id = 1;
      
      -- Also update main jackpot
      UPDATE jackpot SET balance = balance - v_share_amount WHERE id = 1;
      
      -- Store pending reward
      INSERT INTO plus_pending_rewards (user_id, subscription_id, reward_amount, subscription_month)
      VALUES (v_expired_sub.user_id, v_expired_sub.id, v_share_amount, v_subscription_month);
      
      -- Update subscription
      UPDATE plus_subscriptions 
      SET reward_calculated = true, 
          pending_reward_amount = v_share_amount 
      WHERE id = v_expired_sub.id;
      
      v_total_calculated := v_total_calculated + v_share_amount;
      v_count := v_count + 1;
    ELSE
      -- Mark as calculated even if no reward (pool empty)
      UPDATE plus_subscriptions SET reward_calculated = true WHERE id = v_expired_sub.id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'subscriptions_processed', v_count,
    'total_reserved', v_total_calculated
  );
END;
$$;

-- Updated distribution function - now just pays out pending rewards
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
  v_pending RECORD;
  v_total_distributed numeric := 0;
  v_count int := 0;
  v_distribution_month date;
  v_active_sub RECORD;
  v_active_count int;
  v_share_amount numeric;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- First, calculate any pending rewards for expired subscriptions
  PERFORM calculate_expired_plus_rewards();

  -- Determine distribution month
  IF EXTRACT(DAY FROM now()) <= 5 THEN
    v_distribution_month := (date_trunc('month', now()) - interval '1 month')::date;
  ELSE
    v_distribution_month := date_trunc('month', now())::date;
  END IF;

  -- Create distribution record
  INSERT INTO plus_commission_distributions (distribution_month, total_pool_amount, total_subscribers, distributed_by)
  VALUES (v_distribution_month, 0, 0, v_admin_id)
  RETURNING id INTO v_distribution_id;

  -- Pay out all pending rewards (from expired subscriptions)
  FOR v_pending IN 
    SELECT ppr.id, ppr.user_id, ppr.subscription_id, ppr.reward_amount, p.username
    FROM plus_pending_rewards ppr
    JOIN profiles p ON p.id = ppr.user_id
    WHERE ppr.paid_out = false
  LOOP
    -- Add FXU to user
    UPDATE profiles SET fxu_balance = fxu_balance + v_pending.reward_amount WHERE id = v_pending.user_id;
    
    -- Update subscription total received
    UPDATE plus_subscriptions 
    SET total_commissions_received = total_commissions_received + v_pending.reward_amount 
    WHERE id = v_pending.subscription_id;
    
    -- Mark as paid
    UPDATE plus_pending_rewards 
    SET paid_out = true, 
        paid_out_at = now(),
        distribution_id = v_distribution_id
    WHERE id = v_pending.id;
    
    -- Record reward
    INSERT INTO plus_commission_rewards (distribution_id, user_id, subscription_id, share_percent, reward_amount)
    VALUES (v_distribution_id, v_pending.user_id, v_pending.subscription_id, 0, v_pending.reward_amount);
    
    -- Send notification
    INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
    VALUES (
      v_pending.user_id,
      'Sistema',
      'Comision Plus Entregada',
      'Has recibido ' || v_pending.reward_amount || ' FXU de tu suscripcion Plus. Esta recompensa estaba pendiente de entrega.',
      'system'
    );
    
    v_total_distributed := v_total_distributed + v_pending.reward_amount;
    v_count := v_count + 1;
  END LOOP;

  -- Now also calculate and pay active subscribers their share of remaining pool
  SELECT plus_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;
  
  IF v_pool_balance > 0 THEN
    -- Count active subscribers
    SELECT COUNT(DISTINCT user_id) INTO v_active_count
    FROM plus_subscriptions
    WHERE is_active = true AND expires_at > now();
    
    IF v_active_count > 0 THEN
      v_share_amount := FLOOR(v_pool_balance / v_active_count);
      
      IF v_share_amount > 0 THEN
        FOR v_active_sub IN 
          SELECT DISTINCT ON (ps.user_id) ps.id, ps.user_id, p.username
          FROM plus_subscriptions ps
          JOIN profiles p ON p.id = ps.user_id
          WHERE ps.is_active = true AND ps.expires_at > now()
          ORDER BY ps.user_id, ps.expires_at DESC
        LOOP
          -- Add FXU to user
          UPDATE profiles SET fxu_balance = fxu_balance + v_share_amount WHERE id = v_active_sub.user_id;
          
          -- Update subscription
          UPDATE plus_subscriptions 
          SET total_commissions_received = total_commissions_received + v_share_amount 
          WHERE id = v_active_sub.id;
          
          -- Record reward
          INSERT INTO plus_commission_rewards (distribution_id, user_id, subscription_id, share_percent, reward_amount)
          VALUES (v_distribution_id, v_active_sub.user_id, v_active_sub.id, 100.0 / v_active_count, v_share_amount);
          
          -- Send notification
          INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
          VALUES (
            v_active_sub.user_id,
            'Sistema',
            'Comision Plus Mensual',
            'Has recibido ' || v_share_amount || ' FXU como comision mensual de tu suscripcion Plus activa.',
            'system'
          );
          
          v_total_distributed := v_total_distributed + v_share_amount;
          v_count := v_count + 1;
        END LOOP;
        
        -- Deduct from pool
        UPDATE jackpot_pools 
        SET plus_balance = plus_balance - (v_share_amount * v_active_count),
            updated_at = now()
        WHERE id = 1;
        
        UPDATE jackpot SET balance = balance - (v_share_amount * v_active_count) WHERE id = 1;
      END IF;
    END IF;
  END IF;

  -- Update distribution record with totals
  UPDATE plus_commission_distributions 
  SET total_pool_amount = v_total_distributed,
      total_subscribers = v_count
  WHERE id = v_distribution_id;

  IF v_count = 0 THEN
    -- Delete empty distribution
    DELETE FROM plus_commission_distributions WHERE id = v_distribution_id;
    RETURN jsonb_build_object('success', false, 'error', 'No hay suscriptores Plus para distribuir');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Comisiones Plus distribuidas',
    'total_distributed', v_total_distributed,
    'subscribers_paid', v_count,
    'distribution_id', v_distribution_id
  );
END;
$$;

-- Function users can call to see their pending rewards
CREATE OR REPLACE FUNCTION get_my_pending_plus_rewards()
RETURNS TABLE (
  reward_amount numeric,
  subscription_month date,
  calculated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT reward_amount, subscription_month, calculated_at
  FROM plus_pending_rewards
  WHERE user_id = auth.uid() AND paid_out = false
  ORDER BY calculated_at DESC;
$$;
