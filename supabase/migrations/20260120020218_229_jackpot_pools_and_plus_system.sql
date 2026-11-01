/*
  # Jackpot Pools and Plus Subscription System

  1. New Structure
    - Split jackpot into 3 pools:
      - 20% Expedition pool (current expedition logic)
      - 20% Monthly ranking pool (distributed to top 50 monthly)
      - 50% Plus pool (commissions for Plus subscribers)

  2. New Tables
    - `jackpot_pools` - Separate balance tracking for each pool
    - `plus_plans` - Subscription plan pricing (monthly, 6-month, annual)
    - `plus_subscriptions` - User Plus subscriptions
    - `monthly_ranking_distributions` - History of monthly pool distributions
    - `plus_commission_distributions` - History of Plus commissions

  3. Admin Features
    - Configure Plus plan prices
    - Distribute monthly pool to top 50
    - Distribute Plus commissions

  4. Security
    - RLS enabled on all tables
    - Admin-only access for sensitive operations
*/

-- Jackpot pools table to track separate balances
CREATE TABLE IF NOT EXISTS jackpot_pools (
  id int PRIMARY KEY DEFAULT 1,
  expedition_balance numeric DEFAULT 0 NOT NULL,
  expedition_total numeric DEFAULT 0 NOT NULL,
  monthly_balance numeric DEFAULT 0 NOT NULL,
  monthly_total numeric DEFAULT 0 NOT NULL,
  plus_balance numeric DEFAULT 0 NOT NULL,
  plus_total numeric DEFAULT 0 NOT NULL,
  expedition_percent int DEFAULT 20 NOT NULL CHECK (expedition_percent >= 0 AND expedition_percent <= 100),
  monthly_percent int DEFAULT 20 NOT NULL CHECK (monthly_percent >= 0 AND monthly_percent <= 100),
  plus_percent int DEFAULT 50 NOT NULL CHECK (plus_percent >= 0 AND plus_percent <= 100),
  updated_at timestamptz DEFAULT now()
);

-- Initialize jackpot pools with current balance distributed
INSERT INTO jackpot_pools (id, expedition_balance, expedition_total, monthly_balance, monthly_total, plus_balance, plus_total)
SELECT 
  1,
  FLOOR(balance * 0.20),
  FLOOR(total_contributed * 0.20),
  FLOOR(balance * 0.20),
  FLOOR(total_contributed * 0.20),
  FLOOR(balance * 0.50),
  FLOOR(total_contributed * 0.50)
FROM jackpot WHERE id = 1
ON CONFLICT (id) DO NOTHING;

ALTER TABLE jackpot_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view jackpot pools"
  ON jackpot_pools FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only system can modify jackpot pools"
  ON jackpot_pools FOR UPDATE
  TO authenticated
  USING (false);

-- Plus subscription plans
CREATE TABLE IF NOT EXISTS plus_plans (
  id serial PRIMARY KEY,
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  duration_months int NOT NULL,
  price_fxu numeric NOT NULL,
  price_usdt numeric NOT NULL,
  commission_share_percent numeric DEFAULT 1 NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default plans
INSERT INTO plus_plans (name, code, duration_months, price_fxu, price_usdt, commission_share_percent) VALUES
  ('Plus Mensual', 'plus_monthly', 1, 100, 10, 1),
  ('Plus Semestral', 'plus_6months', 6, 500, 50, 1.2),
  ('Plus Anual', 'plus_annual', 12, 800, 80, 1.5)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE plus_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plus plans"
  ON plus_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage plus plans"
  ON plus_plans FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- User Plus subscriptions
CREATE TABLE IF NOT EXISTS plus_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id int NOT NULL REFERENCES plus_plans(id),
  payment_type text NOT NULL CHECK (payment_type IN ('fxu', 'usdt')),
  amount_paid numeric NOT NULL,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  commission_share_percent numeric NOT NULL,
  total_commissions_received numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_plus_subscriptions_user ON plus_subscriptions(user_id);
CREATE INDEX idx_plus_subscriptions_active ON plus_subscriptions(is_active, expires_at);

ALTER TABLE plus_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON plus_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all subscriptions"
  ON plus_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Monthly ranking distributions history
CREATE TABLE IF NOT EXISTS monthly_ranking_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_month date NOT NULL,
  total_pool_amount numeric NOT NULL,
  distributed_at timestamptz DEFAULT now(),
  distributed_by uuid REFERENCES profiles(id)
);

ALTER TABLE monthly_ranking_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view distribution history"
  ON monthly_ranking_distributions FOR SELECT
  TO authenticated
  USING (true);

-- Monthly ranking distribution details
CREATE TABLE IF NOT EXISTS monthly_ranking_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id uuid NOT NULL REFERENCES monthly_ranking_distributions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  rank_position int NOT NULL,
  points_at_distribution bigint NOT NULL,
  reward_amount numeric NOT NULL,
  reward_percent numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_monthly_rewards_user ON monthly_ranking_rewards(user_id);
CREATE INDEX idx_monthly_rewards_distribution ON monthly_ranking_rewards(distribution_id);

ALTER TABLE monthly_ranking_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rewards"
  ON monthly_ranking_rewards FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all rewards"
  ON monthly_ranking_rewards FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Plus commission distribution history
CREATE TABLE IF NOT EXISTS plus_commission_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_month date NOT NULL,
  total_pool_amount numeric NOT NULL,
  total_subscribers int NOT NULL,
  distributed_at timestamptz DEFAULT now(),
  distributed_by uuid REFERENCES profiles(id)
);

ALTER TABLE plus_commission_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view plus distribution history"
  ON plus_commission_distributions FOR SELECT
  TO authenticated
  USING (true);

-- Plus commission details per user
CREATE TABLE IF NOT EXISTS plus_commission_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id uuid NOT NULL REFERENCES plus_commission_distributions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  subscription_id uuid NOT NULL REFERENCES plus_subscriptions(id),
  share_percent numeric NOT NULL,
  reward_amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_plus_rewards_user ON plus_commission_rewards(user_id);
CREATE INDEX idx_plus_rewards_distribution ON plus_commission_rewards(distribution_id);

ALTER TABLE plus_commission_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plus rewards"
  ON plus_commission_rewards FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all plus rewards"
  ON plus_commission_rewards FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Update contribute_to_jackpot to split into 3 pools
CREATE OR REPLACE FUNCTION contribute_to_jackpot(
  p_user_id uuid,
  p_amount numeric,
  p_source text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expedition_amount numeric;
  v_monthly_amount numeric;
  v_plus_amount numeric;
  v_expedition_percent int;
  v_monthly_percent int;
  v_plus_percent int;
  v_new_total numeric;
BEGIN
  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Get pool percentages
  SELECT expedition_percent, monthly_percent, plus_percent
  INTO v_expedition_percent, v_monthly_percent, v_plus_percent
  FROM jackpot_pools WHERE id = 1;

  -- Calculate amounts for each pool
  v_expedition_amount := FLOOR(p_amount * v_expedition_percent / 100);
  v_monthly_amount := FLOOR(p_amount * v_monthly_percent / 100);
  v_plus_amount := p_amount - v_expedition_amount - v_monthly_amount; -- Rest goes to plus

  -- Update pool balances
  UPDATE jackpot_pools
  SET 
    expedition_balance = expedition_balance + v_expedition_amount,
    expedition_total = expedition_total + v_expedition_amount,
    monthly_balance = monthly_balance + v_monthly_amount,
    monthly_total = monthly_total + v_monthly_amount,
    plus_balance = plus_balance + v_plus_amount,
    plus_total = plus_total + v_plus_amount,
    updated_at = now()
  WHERE id = 1;

  -- Also update main jackpot for backward compatibility
  UPDATE jackpot
  SET 
    balance = balance + p_amount,
    total_contributed = total_contributed + p_amount,
    updated_at = now()
  WHERE id = 1;

  SELECT expedition_balance + monthly_balance + plus_balance INTO v_new_total
  FROM jackpot_pools WHERE id = 1;

  -- Record history
  INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
  VALUES (p_user_id, 'contribution', p_amount, p_source, v_new_total);

  RETURN v_new_total;
END;
$$;

-- Function to purchase Plus subscription
CREATE OR REPLACE FUNCTION purchase_plus_subscription(
  p_plan_code text,
  p_payment_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_plan plus_plans%ROWTYPE;
  v_price numeric;
  v_current_fxu numeric;
  v_current_usdt numeric;
  v_expires_at timestamptz;
  v_existing_sub plus_subscriptions%ROWTYPE;
  v_sub_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Get plan details
  SELECT * INTO v_plan FROM plus_plans WHERE code = p_plan_code AND is_active = true;
  
  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan no encontrado');
  END IF;

  -- Check for active subscription
  SELECT * INTO v_existing_sub 
  FROM plus_subscriptions 
  WHERE user_id = v_user_id AND is_active = true AND expires_at > now();
  
  IF v_existing_sub.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Ya tienes una suscripcion Plus activa hasta ' || to_char(v_existing_sub.expires_at, 'DD/MM/YYYY')
    );
  END IF;

  -- Determine price based on payment type
  IF p_payment_type = 'fxu' THEN
    v_price := v_plan.price_fxu;
    
    SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
    
    IF v_current_fxu IS NULL OR v_current_fxu < v_price THEN
      RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_price || ' FXU');
    END IF;
    
    -- Deduct FXU
    UPDATE profiles SET fxu_balance = fxu_balance - v_price WHERE id = v_user_id;
    
    -- Record as revenue
    INSERT INTO admin_revenue (type, amount, user_id, description)
    VALUES ('plus_subscription', v_price, v_user_id, 'Plus ' || v_plan.name || ' (FXU)');
    
  ELSIF p_payment_type = 'usdt' THEN
    v_price := v_plan.price_usdt;
    
    SELECT usdt_balance INTO v_current_usdt FROM profiles WHERE id = v_user_id;
    
    IF v_current_usdt IS NULL OR v_current_usdt < v_price THEN
      RETURN jsonb_build_object('success', false, 'error', 'USDT insuficiente. Necesitas ' || v_price || ' USDT');
    END IF;
    
    -- Deduct USDT
    UPDATE profiles SET usdt_balance = usdt_balance - v_price WHERE id = v_user_id;
    
    -- Record as revenue
    INSERT INTO admin_revenue (type, amount, user_id, description)
    VALUES ('plus_subscription_usdt', v_price, v_user_id, 'Plus ' || v_plan.name || ' (USDT)');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de pago invalido');
  END IF;

  -- Calculate expiration
  v_expires_at := now() + (v_plan.duration_months || ' months')::interval;

  -- Create subscription
  INSERT INTO plus_subscriptions (user_id, plan_id, payment_type, amount_paid, expires_at, commission_share_percent)
  VALUES (v_user_id, v_plan.id, p_payment_type, v_price, v_expires_at, v_plan.commission_share_percent)
  RETURNING id INTO v_sub_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Suscripcion Plus activada hasta ' || to_char(v_expires_at, 'DD/MM/YYYY'),
    'subscription_id', v_sub_id,
    'expires_at', v_expires_at
  );
END;
$$;

-- Admin function to update Plus plan prices
CREATE OR REPLACE FUNCTION admin_update_plus_plan(
  p_plan_code text,
  p_price_fxu numeric DEFAULT NULL,
  p_price_usdt numeric DEFAULT NULL,
  p_commission_share_percent numeric DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  UPDATE plus_plans
  SET 
    price_fxu = COALESCE(p_price_fxu, price_fxu),
    price_usdt = COALESCE(p_price_usdt, price_usdt),
    commission_share_percent = COALESCE(p_commission_share_percent, commission_share_percent),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE code = p_plan_code;

  RETURN jsonb_build_object('success', true, 'message', 'Plan actualizado');
END;
$$;

-- Admin function to distribute monthly pool to top 50
CREATE OR REPLACE FUNCTION admin_distribute_monthly_pool()
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
  v_reward_percent numeric;
  v_reward_amount numeric;
  v_total_distributed numeric := 0;
  v_distribution_month date;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Get current monthly pool balance
  SELECT monthly_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;
  
  IF v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool mensual vacio');
  END IF;

  v_distribution_month := date_trunc('month', now())::date;

  -- Check if already distributed this month
  IF EXISTS (SELECT 1 FROM monthly_ranking_distributions WHERE distribution_month = v_distribution_month) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo este mes');
  END IF;

  -- Create distribution record
  INSERT INTO monthly_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  -- Distribute to top 50 with decreasing percentages
  -- Top 1: 15%, Top 2: 10%, Top 3: 7%, Top 4-10: 4% each, Top 11-20: 2% each, Top 21-50: 1% each
  FOR v_player IN 
    SELECT p.id, p.username, p.total_points
    FROM profiles p
    WHERE p.total_points > 0 AND p.is_admin = false
    ORDER BY p.total_points DESC
    LIMIT 50
  LOOP
    v_rank := v_rank + 1;
    
    -- Calculate reward percentage based on rank
    v_reward_percent := CASE
      WHEN v_rank = 1 THEN 15
      WHEN v_rank = 2 THEN 10
      WHEN v_rank = 3 THEN 7
      WHEN v_rank <= 10 THEN 4
      WHEN v_rank <= 20 THEN 2
      ELSE 1
    END;
    
    v_reward_amount := FLOOR(v_pool_balance * v_reward_percent / 100);
    
    IF v_reward_amount > 0 THEN
      -- Add FXU to player
      UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_player.id;
      
      -- Record reward
      INSERT INTO monthly_ranking_rewards (distribution_id, user_id, rank_position, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_player.id, v_rank, v_player.total_points, v_reward_amount, v_reward_percent);
      
      -- Send notification
      INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
      VALUES (
        v_player.id,
        'Sistema',
        'Recompensa Ranking Mensual',
        'Felicidades! Has recibido ' || v_reward_amount || ' FXU por estar en el puesto #' || v_rank || ' del ranking mensual.',
        'system'
      );
      
      v_distributed_count := v_distributed_count + 1;
      v_total_distributed := v_total_distributed + v_reward_amount;
    END IF;
  END LOOP;

  -- Deduct from monthly pool
  UPDATE jackpot_pools 
  SET monthly_balance = monthly_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  -- Also update main jackpot
  UPDATE jackpot SET balance = balance - v_total_distributed WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pool mensual distribuido',
    'total_distributed', v_total_distributed,
    'players_rewarded', v_distributed_count,
    'distribution_id', v_distribution_id
  );
END;
$$;

-- Admin function to distribute Plus commissions
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
  v_total_shares numeric := 0;
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

  -- Calculate total shares from active subscribers
  SELECT COALESCE(SUM(commission_share_percent), 0), COUNT(*)
  INTO v_total_shares, v_subscriber_count
  FROM plus_subscriptions
  WHERE is_active = true AND expires_at > now();

  IF v_total_shares <= 0 OR v_subscriber_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay suscriptores Plus activos');
  END IF;

  -- Create distribution record
  INSERT INTO plus_commission_distributions (distribution_month, total_pool_amount, total_subscribers, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_subscriber_count, v_admin_id)
  RETURNING id INTO v_distribution_id;

  -- Distribute based on share percentage
  FOR v_subscriber IN 
    SELECT ps.id as sub_id, ps.user_id, ps.commission_share_percent, p.username
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    WHERE ps.is_active = true AND ps.expires_at > now()
  LOOP
    v_reward_amount := FLOOR(v_pool_balance * v_subscriber.commission_share_percent / v_total_shares);
    
    IF v_reward_amount > 0 THEN
      -- Add FXU to subscriber
      UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_subscriber.user_id;
      
      -- Update subscription total received
      UPDATE plus_subscriptions 
      SET total_commissions_received = total_commissions_received + v_reward_amount 
      WHERE id = v_subscriber.sub_id;
      
      -- Record reward
      INSERT INTO plus_commission_rewards (distribution_id, user_id, subscription_id, share_percent, reward_amount)
      VALUES (v_distribution_id, v_subscriber.user_id, v_subscriber.sub_id, v_subscriber.commission_share_percent, v_reward_amount);
      
      -- Send notification
      INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
      VALUES (
        v_subscriber.user_id,
        'Sistema',
        'Comision Plus Mensual',
        'Has recibido ' || v_reward_amount || ' FXU como comision de tu suscripcion Plus.',
        'system'
      );
      
      v_total_distributed := v_total_distributed + v_reward_amount;
    END IF;
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
    'message', 'Comisiones Plus distribuidas',
    'total_distributed', v_total_distributed,
    'subscribers_paid', v_subscriber_count,
    'distribution_id', v_distribution_id
  );
END;
$$;

-- Function to get user's Plus status
CREATE OR REPLACE FUNCTION get_plus_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_subscription plus_subscriptions%ROWTYPE;
  v_plan plus_plans%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('is_plus', false);
  END IF;

  SELECT * INTO v_subscription 
  FROM plus_subscriptions 
  WHERE user_id = v_user_id AND is_active = true AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_subscription.id IS NULL THEN
    RETURN jsonb_build_object('is_plus', false);
  END IF;

  SELECT * INTO v_plan FROM plus_plans WHERE id = v_subscription.plan_id;

  RETURN jsonb_build_object(
    'is_plus', true,
    'plan_name', v_plan.name,
    'expires_at', v_subscription.expires_at,
    'commission_share', v_subscription.commission_share_percent,
    'total_earned', v_subscription.total_commissions_received
  );
END;
$$;

-- Function to update jackpot pool percentages (admin)
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

  IF v_total != 90 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los porcentajes deben sumar 90% (el 10% restante es para expediciones inmediatas)');
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION purchase_plus_subscription(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_plus_status() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_plus_plan(text, numeric, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_distribute_monthly_pool() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_distribute_plus_commissions() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_jackpot_pools(int, int, int) TO authenticated;
