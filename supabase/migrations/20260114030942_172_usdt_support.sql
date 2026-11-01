/*
  # USDT Support for Wallet System
  
  This migration adds support for USDT deposits and withdrawals alongside the existing FXU token.
  
  1. Changes to Tables
    - `profiles`: Add `usdt_balance` column for storing USDT balance
    - `wallet_transactions`: Add `token_type` column to distinguish between FXU and USDT transactions
    - `wallet_config`: Add USDT-specific configuration fields
  
  2. New Functions
    - `confirm_deposit_usdt`: Confirms USDT deposit and credits user balance
    - `request_withdrawal_usdt`: Processes USDT withdrawal requests
    - `get_wallet_stats`: Updated to include USDT balances
  
  3. Security
    - All new fields protected by existing RLS policies
    - USDT balance protected similarly to FXU balance
*/

-- Add USDT balance to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'usdt_balance'
  ) THEN
    ALTER TABLE profiles ADD COLUMN usdt_balance numeric NOT NULL DEFAULT 0 CHECK (usdt_balance >= 0);
  END IF;
END $$;

-- Add token_type to wallet_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_transactions' AND column_name = 'token_type'
  ) THEN
    ALTER TABLE wallet_transactions ADD COLUMN token_type text NOT NULL DEFAULT 'FXU' CHECK (token_type IN ('FXU', 'USDT'));
  END IF;
END $$;

-- Add USDT configuration to wallet_config
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'usdt_contract_address'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN usdt_contract_address text NOT NULL DEFAULT '0x55d398326f99059fF775485246999027B3197955';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'is_usdt_deposits_enabled'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN is_usdt_deposits_enabled boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'is_usdt_withdrawals_enabled'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN is_usdt_withdrawals_enabled boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'usdt_withdrawal_fee_percent'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN usdt_withdrawal_fee_percent numeric NOT NULL DEFAULT 2 CHECK (usdt_withdrawal_fee_percent >= 0 AND usdt_withdrawal_fee_percent <= 50);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'usdt_min_deposit'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN usdt_min_deposit numeric NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'usdt_max_withdrawal_daily'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN usdt_max_withdrawal_daily numeric NOT NULL DEFAULT 10000;
  END IF;
END $$;

-- Create index for token_type
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_token_type ON wallet_transactions(token_type);

-- Function to get daily USDT withdrawal total
CREATE OR REPLACE FUNCTION get_daily_usdt_withdrawal_total(p_user_id uuid)
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
    AND token_type = 'USDT'
    AND status IN ('pending', 'processing', 'confirmed')
    AND created_at >= CURRENT_DATE;
  
  RETURN v_total;
END;
$$;

-- Function to confirm a USDT deposit
CREATE OR REPLACE FUNCTION confirm_deposit_usdt(
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
      user_id, tx_hash, tx_type, token_type, amount, fxu_amount, wallet_address, 
      status, confirmations, block_number, processed_at
    ) VALUES (
      p_user_id, p_tx_hash, 'deposit', 'USDT', p_amount, p_amount, '',
      'confirmed', p_confirmations, p_block_number, now()
    ) RETURNING id INTO v_tx_id;
  END IF;

  -- Credit USDT to user (1:1 ratio)
  UPDATE profiles 
  SET usdt_balance = usdt_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'amount_credited', p_amount
  );
END;
$$;

-- Function to request USDT withdrawal
CREATE OR REPLACE FUNCTION request_withdrawal_usdt(
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
  v_usdt_balance numeric;
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

  -- Check if USDT withdrawals are enabled
  IF NOT v_config.is_usdt_withdrawals_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'USDT withdrawals are currently disabled');
  END IF;

  -- Check minimum amount
  IF p_amount < v_config.usdt_min_deposit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount below minimum: ' || v_config.usdt_min_deposit);
  END IF;

  -- Get user USDT balance
  SELECT usdt_balance INTO v_usdt_balance FROM profiles WHERE id = v_user_id;

  IF v_usdt_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient USDT balance');
  END IF;

  -- Check daily limit
  v_daily_total := get_daily_usdt_withdrawal_total(v_user_id);
  IF v_daily_total + p_amount > v_config.usdt_max_withdrawal_daily THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Daily USDT withdrawal limit exceeded. Remaining: ' || (v_config.usdt_max_withdrawal_daily - v_daily_total)
    );
  END IF;

  -- Calculate fee
  v_fee := p_amount * (v_config.usdt_withdrawal_fee_percent / 100);
  v_net_amount := p_amount - v_fee;

  -- Deduct USDT from user balance
  UPDATE profiles 
  SET usdt_balance = usdt_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;

  -- Add fee to first admin found (in USDT)
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_fee > 0 THEN
    UPDATE profiles 
    SET usdt_balance = usdt_balance + v_fee
    WHERE id = v_admin_id;
  END IF;

  -- Create withdrawal transaction
  INSERT INTO wallet_transactions (
    user_id, tx_type, token_type, amount, fxu_amount, wallet_address, status
  ) VALUES (
    v_user_id, 'withdrawal', 'USDT', v_net_amount, p_amount, p_wallet_address, 'pending'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'amount', v_net_amount,
    'fee', v_fee,
    'message', 'USDT withdrawal request submitted'
  );
END;
$$;

-- Function to cancel USDT withdrawal and refund
CREATE OR REPLACE FUNCTION cancel_withdrawal_usdt(p_tx_id uuid)
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

  IF v_tx.tx_type != 'withdrawal' OR v_tx.token_type != 'USDT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only cancel USDT withdrawals');
  END IF;

  IF v_tx.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only cancel pending withdrawals');
  END IF;

  -- Refund USDT to user
  UPDATE profiles 
  SET usdt_balance = usdt_balance + v_tx.fxu_amount,
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

-- Function to fail USDT withdrawal and refund
CREATE OR REPLACE FUNCTION fail_withdrawal_usdt(
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

  IF v_tx.token_type != 'USDT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a USDT transaction');
  END IF;

  IF v_tx.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot fail transaction in status: ' || v_tx.status);
  END IF;

  -- Refund USDT to user
  UPDATE profiles 
  SET usdt_balance = usdt_balance + v_tx.fxu_amount,
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

-- Update get_wallet_stats to include USDT
CREATE OR REPLACE FUNCTION get_wallet_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fxu_balance numeric;
  v_usdt_balance numeric;
  v_total_deposited numeric;
  v_total_withdrawn numeric;
  v_total_deposited_usdt numeric;
  v_total_withdrawn_usdt numeric;
  v_pending_withdrawals numeric;
  v_pending_withdrawals_usdt numeric;
  v_daily_withdrawn numeric;
  v_daily_withdrawn_usdt numeric;
  v_config wallet_config%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT fxu_balance, usdt_balance INTO v_fxu_balance, v_usdt_balance FROM profiles WHERE id = v_user_id;

  -- FXU stats
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposited
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'deposit' AND token_type = 'FXU' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawn
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'FXU' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'FXU' AND status IN ('pending', 'processing');

  -- USDT stats
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposited_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'deposit' AND token_type = 'USDT' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawn_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'USDT' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'USDT' AND status IN ('pending', 'processing');

  v_daily_withdrawn := get_daily_withdrawal_total(v_user_id);
  v_daily_withdrawn_usdt := get_daily_usdt_withdrawal_total(v_user_id);

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  RETURN jsonb_build_object(
    'fxu_balance', v_fxu_balance,
    'usdt_balance', v_usdt_balance,
    'total_deposited', v_total_deposited,
    'total_withdrawn', v_total_withdrawn,
    'total_deposited_usdt', v_total_deposited_usdt,
    'total_withdrawn_usdt', v_total_withdrawn_usdt,
    'pending_withdrawals', v_pending_withdrawals,
    'pending_withdrawals_usdt', v_pending_withdrawals_usdt,
    'daily_withdrawn', v_daily_withdrawn,
    'daily_withdrawn_usdt', v_daily_withdrawn_usdt,
    'daily_limit', v_config.max_withdrawal_daily,
    'daily_limit_usdt', v_config.usdt_max_withdrawal_daily,
    'daily_remaining', v_config.max_withdrawal_daily - v_daily_withdrawn,
    'daily_remaining_usdt', v_config.usdt_max_withdrawal_daily - v_daily_withdrawn_usdt,
    'min_amount', v_config.min_deposit,
    'min_amount_usdt', v_config.usdt_min_deposit,
    'withdrawal_fee_percent', v_config.withdrawal_fee_percent,
    'withdrawal_fee_percent_usdt', v_config.usdt_withdrawal_fee_percent,
    'deposits_enabled', v_config.is_deposits_enabled,
    'withdrawals_enabled', v_config.is_withdrawals_enabled,
    'usdt_deposits_enabled', v_config.is_usdt_deposits_enabled,
    'usdt_withdrawals_enabled', v_config.is_usdt_withdrawals_enabled,
    'usdt_contract', v_config.usdt_contract_address
  );
END;
$$;
