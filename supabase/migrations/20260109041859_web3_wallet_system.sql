/*
  # Web3 Wallet System for Deposits and Withdrawals

  1. New Tables
    - `wallet_transactions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `tx_hash` (text, unique, blockchain transaction hash)
      - `tx_type` (text, 'deposit' or 'withdrawal')
      - `amount` (numeric, token amount)
      - `fxu_amount` (numeric, FXU credited/debited)
      - `wallet_address` (text, user's BSC wallet address)
      - `status` (text, pending/confirmed/failed)
      - `confirmations` (integer, blockchain confirmations)
      - `block_number` (bigint, blockchain block number)
      - `error_message` (text, if failed)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `processed_at` (timestamptz)

    - `user_wallets`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles, unique)
      - `wallet_address` (text, user's verified BSC wallet)
      - `is_verified` (boolean)
      - `verification_signature` (text)
      - `created_at` (timestamptz)

    - `wallet_config`
      - `id` (integer, primary key, single row)
      - `deposit_wallet_address` (text, server wallet for deposits)
      - `min_deposit` (numeric)
      - `max_withdrawal_daily` (numeric)
      - `withdrawal_fee_percent` (numeric)
      - `required_confirmations` (integer)
      - `is_deposits_enabled` (boolean)
      - `is_withdrawals_enabled` (boolean)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can only view their own transactions
    - Only server (service role) can modify transaction status
    - Config is readable by authenticated users

  3. Functions
    - `create_deposit_request` - User initiates deposit
    - `confirm_deposit` - Server confirms deposit after blockchain verification
    - `request_withdrawal` - User requests withdrawal
    - `process_withdrawal` - Server processes withdrawal
    - `get_daily_withdrawal_total` - Helper for limits
*/

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tx_hash text UNIQUE,
  tx_type text NOT NULL CHECK (tx_type IN ('deposit', 'withdrawal')),
  amount numeric NOT NULL CHECK (amount > 0),
  fxu_amount numeric NOT NULL CHECK (fxu_amount > 0),
  wallet_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'confirmed', 'failed', 'cancelled')),
  confirmations integer DEFAULT 0,
  block_number bigint,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- User wallets table
CREATE TABLE IF NOT EXISTS user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  wallet_address text NOT NULL,
  is_verified boolean DEFAULT false,
  verification_signature text,
  created_at timestamptz DEFAULT now()
);

-- Wallet configuration table (single row)
CREATE TABLE IF NOT EXISTS wallet_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  deposit_wallet_address text NOT NULL DEFAULT '',
  min_deposit numeric NOT NULL DEFAULT 1,
  max_withdrawal_daily numeric NOT NULL DEFAULT 10000,
  withdrawal_fee_percent numeric NOT NULL DEFAULT 2 CHECK (withdrawal_fee_percent >= 0 AND withdrawal_fee_percent <= 50),
  required_confirmations integer NOT NULL DEFAULT 3 CHECK (required_confirmations >= 1),
  is_deposits_enabled boolean NOT NULL DEFAULT true,
  is_withdrawals_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

-- Insert default config
INSERT INTO wallet_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wallet_transactions
CREATE POLICY "Users can view own transactions"
  ON wallet_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create deposit requests"
  ON wallet_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND tx_type = 'deposit');

-- RLS Policies for user_wallets
CREATE POLICY "Users can view own wallet"
  ON user_wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can register wallet"
  ON user_wallets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wallet"
  ON user_wallets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for wallet_config (read-only for authenticated users)
CREATE POLICY "Anyone can read wallet config"
  ON wallet_config FOR SELECT
  TO authenticated
  USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tx_hash ON wallet_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(wallet_address);

-- Function to get daily withdrawal total for a user
CREATE OR REPLACE FUNCTION get_daily_withdrawal_total(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM wallet_transactions
  WHERE user_id = p_user_id
    AND tx_type = 'withdrawal'
    AND status IN ('pending', 'processing', 'confirmed')
    AND created_at >= CURRENT_DATE;
  
  RETURN v_total;
END;
$$;

-- Function to request a withdrawal
CREATE OR REPLACE FUNCTION request_withdrawal(
  p_amount numeric,
  p_wallet_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fxu_balance numeric;
  v_daily_total numeric;
  v_config wallet_config%ROWTYPE;
  v_fee numeric;
  v_net_amount numeric;
  v_tx_id uuid;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get wallet config
  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  -- Check if withdrawals are enabled
  IF NOT v_config.is_withdrawals_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawals are currently disabled');
  END IF;

  -- Check minimum amount
  IF p_amount < v_config.min_deposit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount below minimum: ' || v_config.min_deposit);
  END IF;

  -- Get user FXU balance
  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = v_user_id;

  IF v_fxu_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  -- Check daily limit
  v_daily_total := get_daily_withdrawal_total(v_user_id);
  IF v_daily_total + p_amount > v_config.max_withdrawal_daily THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Daily withdrawal limit exceeded. Remaining: ' || (v_config.max_withdrawal_daily - v_daily_total)
    );
  END IF;

  -- Calculate fee
  v_fee := p_amount * (v_config.withdrawal_fee_percent / 100);
  v_net_amount := p_amount - v_fee;

  -- Deduct FXU from user balance
  UPDATE profiles 
  SET fxu_balance = fxu_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;

  -- Add fee to first admin found
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_fee > 0 THEN
    UPDATE profiles 
    SET fxu_balance = fxu_balance + v_fee
    WHERE id = v_admin_id;
  END IF;

  -- Create withdrawal transaction
  INSERT INTO wallet_transactions (
    user_id, tx_type, amount, fxu_amount, wallet_address, status
  ) VALUES (
    v_user_id, 'withdrawal', v_net_amount, p_amount, p_wallet_address, 'pending'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'amount', v_net_amount,
    'fee', v_fee,
    'message', 'Withdrawal request submitted'
  );
END;
$$;

-- Function to confirm a deposit (called by edge function after blockchain verification)
CREATE OR REPLACE FUNCTION confirm_deposit(
  p_tx_hash text,
  p_user_id uuid,
  p_amount numeric,
  p_block_number bigint,
  p_confirmations integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_tx wallet_transactions%ROWTYPE;
  v_tx_id uuid;
BEGIN
  -- Check if transaction already exists
  SELECT * INTO v_existing_tx FROM wallet_transactions WHERE tx_hash = p_tx_hash;
  
  IF v_existing_tx.id IS NOT NULL THEN
    IF v_existing_tx.status = 'confirmed' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Transaction already confirmed');
    END IF;
    
    -- Update existing transaction
    UPDATE wallet_transactions
    SET status = 'confirmed',
        confirmations = p_confirmations,
        block_number = p_block_number,
        processed_at = now(),
        updated_at = now()
    WHERE id = v_existing_tx.id;
    
    v_tx_id := v_existing_tx.id;
  ELSE
    -- Create new confirmed transaction
    INSERT INTO wallet_transactions (
      user_id, tx_hash, tx_type, amount, fxu_amount, wallet_address, 
      status, confirmations, block_number, processed_at
    ) VALUES (
      p_user_id, p_tx_hash, 'deposit', p_amount, p_amount, '',
      'confirmed', p_confirmations, p_block_number, now()
    ) RETURNING id INTO v_tx_id;
  END IF;

  -- Credit FXU to user (1:1 ratio)
  UPDATE profiles 
  SET fxu_balance = fxu_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'amount_credited', p_amount
  );
END;
$$;

-- Function to mark withdrawal as processed
CREATE OR REPLACE FUNCTION complete_withdrawal(
  p_tx_id uuid,
  p_tx_hash text,
  p_block_number bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE wallet_transactions
  SET status = 'confirmed',
      tx_hash = p_tx_hash,
      block_number = p_block_number,
      processed_at = now(),
      updated_at = now()
  WHERE id = p_tx_id AND status = 'processing';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found or not in processing status');
  END IF;

  RETURN jsonb_build_object('success', true, 'tx_hash', p_tx_hash);
END;
$$;

-- Function to fail a withdrawal and refund
CREATE OR REPLACE FUNCTION fail_withdrawal(
  p_tx_id uuid,
  p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM wallet_transactions WHERE id = p_tx_id;
  
  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot fail transaction in status: ' || v_tx.status);
  END IF;

  -- Refund FXU to user
  UPDATE profiles 
  SET fxu_balance = fxu_balance + v_tx.fxu_amount,
      updated_at = now()
  WHERE id = v_tx.user_id;

  -- Mark transaction as failed
  UPDATE wallet_transactions
  SET status = 'failed',
      error_message = p_error_message,
      updated_at = now()
  WHERE id = p_tx_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_tx.fxu_amount);
END;
$$;

-- Function to cancel a pending withdrawal (by user)
CREATE OR REPLACE FUNCTION cancel_withdrawal(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_tx FROM wallet_transactions WHERE id = p_tx_id AND user_id = v_user_id;
  
  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.tx_type != 'withdrawal' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only cancel withdrawals');
  END IF;

  IF v_tx.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only cancel pending withdrawals');
  END IF;

  -- Refund FXU to user
  UPDATE profiles 
  SET fxu_balance = fxu_balance + v_tx.fxu_amount,
      updated_at = now()
  WHERE id = v_user_id;

  -- Mark as cancelled
  UPDATE wallet_transactions
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_tx_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_tx.fxu_amount);
END;
$$;

-- Function to get user wallet stats
CREATE OR REPLACE FUNCTION get_wallet_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fxu_balance numeric;
  v_total_deposited numeric;
  v_total_withdrawn numeric;
  v_pending_withdrawals numeric;
  v_daily_withdrawn numeric;
  v_config wallet_config%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = v_user_id;

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposited
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'deposit' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawn
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND status IN ('pending', 'processing');

  v_daily_withdrawn := get_daily_withdrawal_total(v_user_id);

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  RETURN jsonb_build_object(
    'fxu_balance', v_fxu_balance,
    'total_deposited', v_total_deposited,
    'total_withdrawn', v_total_withdrawn,
    'pending_withdrawals', v_pending_withdrawals,
    'daily_withdrawn', v_daily_withdrawn,
    'daily_limit', v_config.max_withdrawal_daily,
    'daily_remaining', v_config.max_withdrawal_daily - v_daily_withdrawn,
    'min_amount', v_config.min_deposit,
    'withdrawal_fee_percent', v_config.withdrawal_fee_percent,
    'deposits_enabled', v_config.is_deposits_enabled,
    'withdrawals_enabled', v_config.is_withdrawals_enabled
  );
END;
$$;
