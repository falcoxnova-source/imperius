/*
  # Swap System: FXU <-> USDT
  
  This migration adds the ability to swap between FXU and USDT tokens at a fixed rate.
  
  Exchange Rate: 10,000 FXU = 1 USDT
  
  1. New Functions
    - `swap_fxu_to_usdt`: Convert FXU to USDT
    - `swap_usdt_to_fxu`: Convert USDT to FXU
    - `get_swap_rate`: Get current swap rate information
  
  2. Configuration
    - `swap_rate_fxu_per_usdt` in wallet_config (default: 10000)
    - `is_swap_enabled` in wallet_config
  
  3. Security
    - Only authenticated users can swap
    - Minimum amounts enforced
    - Balance validation before swap
*/

-- Add swap configuration to wallet_config
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'swap_rate_fxu_per_usdt'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN swap_rate_fxu_per_usdt numeric NOT NULL DEFAULT 10000 CHECK (swap_rate_fxu_per_usdt > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'is_swap_enabled'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN is_swap_enabled boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'swap_min_fxu'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN swap_min_fxu numeric NOT NULL DEFAULT 1000;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'swap_min_usdt'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN swap_min_usdt numeric NOT NULL DEFAULT 0.1;
  END IF;
END $$;

-- Function to get swap rate information
CREATE OR REPLACE FUNCTION get_swap_rate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config wallet_config%ROWTYPE;
BEGIN
  SELECT * INTO v_config FROM wallet_config WHERE id = 1;
  
  RETURN jsonb_build_object(
    'rate_fxu_per_usdt', v_config.swap_rate_fxu_per_usdt,
    'is_swap_enabled', v_config.is_swap_enabled,
    'min_fxu', v_config.swap_min_fxu,
    'min_usdt', v_config.swap_min_usdt
  );
END;
$$;

-- Function to swap FXU to USDT
CREATE OR REPLACE FUNCTION swap_fxu_to_usdt(p_fxu_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fxu_balance numeric;
  v_config wallet_config%ROWTYPE;
  v_usdt_amount numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get config
  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  -- Check if swap is enabled
  IF NOT v_config.is_swap_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Swap is currently disabled');
  END IF;

  -- Check minimum amount
  IF p_fxu_amount < v_config.swap_min_fxu THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum swap amount is ' || v_config.swap_min_fxu || ' FXU');
  END IF;

  -- Get user FXU balance
  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = v_user_id;

  IF v_fxu_balance < p_fxu_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  -- Calculate USDT amount (10000 FXU = 1 USDT)
  v_usdt_amount := p_fxu_amount / v_config.swap_rate_fxu_per_usdt;

  -- Perform swap
  UPDATE profiles 
  SET fxu_balance = fxu_balance - p_fxu_amount,
      usdt_balance = usdt_balance + v_usdt_amount,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'fxu_spent', p_fxu_amount,
    'usdt_received', v_usdt_amount,
    'rate', v_config.swap_rate_fxu_per_usdt,
    'message', 'Successfully swapped ' || p_fxu_amount || ' FXU for ' || v_usdt_amount || ' USDT'
  );
END;
$$;

-- Function to swap USDT to FXU
CREATE OR REPLACE FUNCTION swap_usdt_to_fxu(p_usdt_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_usdt_balance numeric;
  v_config wallet_config%ROWTYPE;
  v_fxu_amount numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get config
  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  -- Check if swap is enabled
  IF NOT v_config.is_swap_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Swap is currently disabled');
  END IF;

  -- Check minimum amount
  IF p_usdt_amount < v_config.swap_min_usdt THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum swap amount is ' || v_config.swap_min_usdt || ' USDT');
  END IF;

  -- Get user USDT balance
  SELECT usdt_balance INTO v_usdt_balance FROM profiles WHERE id = v_user_id;

  IF v_usdt_balance < p_usdt_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient USDT balance');
  END IF;

  -- Calculate FXU amount (1 USDT = 10000 FXU)
  v_fxu_amount := p_usdt_amount * v_config.swap_rate_fxu_per_usdt;

  -- Perform swap
  UPDATE profiles 
  SET usdt_balance = usdt_balance - p_usdt_amount,
      fxu_balance = fxu_balance + v_fxu_amount,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'usdt_spent', p_usdt_amount,
    'fxu_received', v_fxu_amount,
    'rate', v_config.swap_rate_fxu_per_usdt,
    'message', 'Successfully swapped ' || p_usdt_amount || ' USDT for ' || v_fxu_amount || ' FXU'
  );
END;
$$;

-- Update get_wallet_stats to include swap info
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
    'usdt_contract', v_config.usdt_contract_address,
    'swap_enabled', v_config.is_swap_enabled,
    'swap_rate', v_config.swap_rate_fxu_per_usdt,
    'swap_min_fxu', v_config.swap_min_fxu,
    'swap_min_usdt', v_config.swap_min_usdt
  );
END;
$$;
