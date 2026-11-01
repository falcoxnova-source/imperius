/*
  # Jackpot System
  
  1. New Tables
    - `jackpot` - Stores the current jackpot balance
      - `id` (int, primary key)
      - `balance` (numeric) - Current FXU in jackpot
      - `total_contributed` (numeric) - Total FXU ever contributed
      - `total_won` (numeric) - Total FXU ever won
      - `last_winner_id` (uuid) - Last winner's user ID
      - `last_won_at` (timestamptz) - When last won
      - `last_won_amount` (numeric) - Amount last won
      - `updated_at` (timestamptz)
    
    - `jackpot_config` - Admin configuration
      - `contribution_rate` (numeric) - % of market fee going to jackpot (default 10%)
      - `win_chance` (numeric) - % chance to win on expedition (default 1%)
      - `min_win_percent` (numeric) - Minimum % of jackpot won (default 10%)
      - `max_win_percent` (numeric) - Maximum % of jackpot won (default 50%)
      - `min_jackpot_for_win` (numeric) - Minimum jackpot balance to allow wins
    
    - `jackpot_history` - History of contributions and wins
      - `id` (uuid, primary key)
      - `user_id` (uuid) - User involved
      - `type` (text) - 'contribution' or 'win'
      - `amount` (numeric) - FXU amount
      - `source` (text) - 'market_fee', 'expedition', etc.
      - `jackpot_balance_after` (numeric) - Balance after transaction
      - `created_at` (timestamptz)
  
  2. Security
    - RLS enabled on all tables
    - Users can view jackpot balance (public info)
    - Users can view their own history
    - Only system functions can modify jackpot
*/

-- Jackpot balance table (singleton)
CREATE TABLE IF NOT EXISTS jackpot (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_contributed numeric NOT NULL DEFAULT 0,
  total_won numeric NOT NULL DEFAULT 0,
  last_winner_id uuid REFERENCES profiles(id),
  last_won_at timestamptz,
  last_won_amount numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Initialize jackpot if not exists
INSERT INTO jackpot (id, balance) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- Jackpot configuration (singleton)
CREATE TABLE IF NOT EXISTS jackpot_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  contribution_rate numeric NOT NULL DEFAULT 10 CHECK (contribution_rate >= 0 AND contribution_rate <= 100),
  win_chance numeric NOT NULL DEFAULT 1 CHECK (win_chance >= 0 AND win_chance <= 100),
  min_win_percent numeric NOT NULL DEFAULT 10 CHECK (min_win_percent >= 1 AND min_win_percent <= 100),
  max_win_percent numeric NOT NULL DEFAULT 50 CHECK (max_win_percent >= 1 AND max_win_percent <= 100),
  min_jackpot_for_win numeric NOT NULL DEFAULT 1000,
  updated_at timestamptz DEFAULT now()
);

-- Initialize config
INSERT INTO jackpot_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Jackpot history table
CREATE TABLE IF NOT EXISTS jackpot_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  type text NOT NULL CHECK (type IN ('contribution', 'win')),
  amount numeric NOT NULL,
  source text NOT NULL,
  jackpot_balance_after numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jackpot_history_user ON jackpot_history(user_id);
CREATE INDEX IF NOT EXISTS idx_jackpot_history_type ON jackpot_history(type);
CREATE INDEX IF NOT EXISTS idx_jackpot_history_created ON jackpot_history(created_at DESC);

-- Enable RLS
ALTER TABLE jackpot ENABLE ROW LEVEL SECURITY;
ALTER TABLE jackpot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE jackpot_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Jackpot: Anyone can read (public info)
CREATE POLICY "Anyone can view jackpot balance"
  ON jackpot FOR SELECT
  TO authenticated
  USING (true);

-- Jackpot config: Anyone can read
CREATE POLICY "Anyone can view jackpot config"
  ON jackpot_config FOR SELECT
  TO authenticated
  USING (true);

-- Jackpot history: Users can view their own history
CREATE POLICY "Users can view own jackpot history"
  ON jackpot_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin can view all history
CREATE POLICY "Admins can view all jackpot history"
  ON jackpot_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Function to contribute to jackpot (called by market function)
CREATE OR REPLACE FUNCTION contribute_to_jackpot(
  p_amount numeric,
  p_source text,
  p_user_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Update jackpot balance
  UPDATE jackpot
  SET 
    balance = balance + p_amount,
    total_contributed = total_contributed + p_amount,
    updated_at = now()
  WHERE id = 1
  RETURNING balance INTO v_new_balance;

  -- Record history
  INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
  VALUES (p_user_id, 'contribution', p_amount, p_source, v_new_balance);

  RETURN v_new_balance;
END;
$$;

-- Function to attempt jackpot win (called during expedition)
CREATE OR REPLACE FUNCTION attempt_jackpot_win(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jackpot_config%ROWTYPE;
  v_jackpot jackpot%ROWTYPE;
  v_roll numeric;
  v_won boolean := false;
  v_win_amount numeric := 0;
  v_win_percent numeric;
  v_new_balance numeric;
BEGIN
  -- Get config
  SELECT * INTO v_config FROM jackpot_config WHERE id = 1;
  
  -- Get current jackpot
  SELECT * INTO v_jackpot FROM jackpot WHERE id = 1;
  
  -- Check if jackpot is large enough
  IF v_jackpot.balance < v_config.min_jackpot_for_win THEN
    RETURN jsonb_build_object(
      'won', false,
      'amount', 0,
      'reason', 'jackpot_too_small',
      'current_jackpot', v_jackpot.balance
    );
  END IF;

  -- Roll for win
  v_roll := random() * 100;
  
  IF v_roll < v_config.win_chance THEN
    v_won := true;
    
    -- Calculate win amount (random between min and max percent)
    v_win_percent := v_config.min_win_percent + 
      (random() * (v_config.max_win_percent - v_config.min_win_percent));
    
    v_win_amount := floor(v_jackpot.balance * (v_win_percent / 100));
    
    -- Update jackpot
    UPDATE jackpot
    SET 
      balance = balance - v_win_amount,
      total_won = total_won + v_win_amount,
      last_winner_id = p_user_id,
      last_won_at = now(),
      last_won_amount = v_win_amount,
      updated_at = now()
    WHERE id = 1
    RETURNING balance INTO v_new_balance;
    
    -- Credit user's FXU
    UPDATE profiles
    SET fxu_balance = fxu_balance + v_win_amount
    WHERE id = p_user_id;
    
    -- Record history
    INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
    VALUES (p_user_id, 'win', v_win_amount, 'expedition', v_new_balance);
    
    -- Create notification
    INSERT INTO messages (recipient_id, sender_name, subject, content, message_type)
    VALUES (
      p_user_id,
      'Jackpot System',
      'JACKPOT WINNER!',
      'Congratulations! Your expedition discovered the legendary treasure! You won ' || 
        floor(v_win_amount)::text || ' FXU from the jackpot!',
      'system'
    );
  END IF;

  RETURN jsonb_build_object(
    'won', v_won,
    'amount', v_win_amount,
    'current_jackpot', CASE WHEN v_won THEN v_new_balance ELSE v_jackpot.balance END
  );
END;
$$;

-- Function to get jackpot stats (for UI)
CREATE OR REPLACE FUNCTION get_jackpot_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jackpot jackpot%ROWTYPE;
  v_config jackpot_config%ROWTYPE;
  v_last_winner_name text;
BEGIN
  SELECT * INTO v_jackpot FROM jackpot WHERE id = 1;
  SELECT * INTO v_config FROM jackpot_config WHERE id = 1;
  
  -- Get last winner name
  IF v_jackpot.last_winner_id IS NOT NULL THEN
    SELECT username INTO v_last_winner_name
    FROM profiles WHERE id = v_jackpot.last_winner_id;
  END IF;

  RETURN jsonb_build_object(
    'balance', v_jackpot.balance,
    'total_contributed', v_jackpot.total_contributed,
    'total_won', v_jackpot.total_won,
    'last_winner', v_last_winner_name,
    'last_won_at', v_jackpot.last_won_at,
    'last_won_amount', v_jackpot.last_won_amount,
    'win_chance', v_config.win_chance,
    'min_jackpot_for_win', v_config.min_jackpot_for_win
  );
END;
$$;

-- Admin function to update jackpot config
CREATE OR REPLACE FUNCTION admin_update_jackpot_config(
  p_contribution_rate numeric DEFAULT NULL,
  p_win_chance numeric DEFAULT NULL,
  p_min_win_percent numeric DEFAULT NULL,
  p_max_win_percent numeric DEFAULT NULL,
  p_min_jackpot_for_win numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE jackpot_config
  SET
    contribution_rate = COALESCE(p_contribution_rate, contribution_rate),
    win_chance = COALESCE(p_win_chance, win_chance),
    min_win_percent = COALESCE(p_min_win_percent, min_win_percent),
    max_win_percent = COALESCE(p_max_win_percent, max_win_percent),
    min_jackpot_for_win = COALESCE(p_min_jackpot_for_win, min_jackpot_for_win),
    updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Admin function to manually add to jackpot (for events/promotions)
CREATE OR REPLACE FUNCTION admin_add_to_jackpot(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_new_balance numeric;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT contribute_to_jackpot(p_amount, 'admin_deposit', NULL) INTO v_new_balance;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance
  );
END;
$$;
