/*
  # Add trigger to protect fxu_balance from direct manipulation

  ## Problem
  Even with RLS, authenticated users can still update their own profile row,
  which means they could potentially set their fxu_balance to any value.

  ## Solution
  Add a trigger that prevents direct updates to fxu_balance column unless:
  1. The update is coming from service_role (edge functions)
  2. The update is part of a SECURITY DEFINER function (database functions)

  ## Implementation
  We use a session variable to track legitimate function calls.
*/

-- Create helper function to set legitimate context
CREATE OR REPLACE FUNCTION set_fxu_update_context(p_context text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.fxu_update_allowed', p_context, true);
END;
$$;

-- Create the protection trigger
CREATE OR REPLACE FUNCTION protect_fxu_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
  v_context text;
BEGIN
  -- Only check if fxu_balance is being changed
  IF OLD.fxu_balance IS NOT DISTINCT FROM NEW.fxu_balance THEN
    RETURN NEW;
  END IF;
  
  -- Get current role
  v_role := current_setting('role', true);
  
  -- Allow service_role (edge functions with service key)
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Check for legitimate context from our functions
  v_context := current_setting('app.fxu_update_allowed', true);
  IF v_context IS NOT NULL AND v_context != '' THEN
    RETURN NEW;
  END IF;
  
  -- Block direct updates from authenticated users
  IF v_role = 'authenticated' THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Direct modification of fxu_balance is not allowed';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS protect_fxu_balance_trigger ON profiles;

CREATE TRIGGER protect_fxu_balance_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_fxu_balance();

-- Now update all functions that legitimately modify fxu_balance to set context
-- Update confirm_deposit
CREATE OR REPLACE FUNCTION public.confirm_deposit(p_tx_hash text, p_user_id uuid, p_amount numeric, p_block_number bigint, p_confirmations integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_tx wallet_transactions%ROWTYPE;
  v_tx_id uuid;
  v_role text;
BEGIN
  -- SECURITY: Only service_role can call this function
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only server can confirm deposits');
  END IF;

  -- Validate inputs
  IF p_tx_hash IS NULL OR p_tx_hash = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction hash required');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID required');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Check if transaction already exists
  SELECT * INTO v_existing_tx FROM wallet_transactions WHERE tx_hash = lower(p_tx_hash);

  IF v_existing_tx.id IS NOT NULL THEN
    IF v_existing_tx.status = 'confirmed' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Transaction already confirmed');
    END IF;

    -- Verify user matches
    IF v_existing_tx.user_id != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'User mismatch');
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
      p_user_id, lower(p_tx_hash), 'deposit', p_amount, p_amount, '',
      'confirmed', p_confirmations, p_block_number, now()
    ) RETURNING id INTO v_tx_id;
  END IF;

  -- Set context to allow fxu_balance update
  PERFORM set_config('app.fxu_update_allowed', 'confirm_deposit', true);
  
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
$function$;

-- Update request_withdrawal to set context
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_wallet_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Set context to allow fxu_balance update
  PERFORM set_config('app.fxu_update_allowed', 'request_withdrawal', true);

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
$function$;

-- Update cancel_withdrawal to set context
CREATE OR REPLACE FUNCTION public.cancel_withdrawal(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_caller_id uuid;
  v_is_admin boolean;
  v_fee_amount numeric;
  v_admin_id uuid;
BEGIN
  -- Get current user
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if caller is admin
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_caller_id;
  IF v_is_admin IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin access required');
  END IF;

  -- Get the transaction
  SELECT * INTO v_tx FROM wallet_transactions WHERE id = p_tx_id;

  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.tx_type != 'withdrawal' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction is not a withdrawal');
  END IF;

  IF v_tx.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only cancel pending withdrawals. Current status: ' || v_tx.status);
  END IF;

  -- Calculate fee amount
  v_fee_amount := v_tx.fxu_amount - v_tx.amount;

  -- Set context to allow fxu_balance update
  PERFORM set_config('app.fxu_update_allowed', 'cancel_withdrawal', true);

  -- Refund full FXU amount to user
  UPDATE profiles 
  SET fxu_balance = fxu_balance + v_tx.fxu_amount,
      updated_at = now()
  WHERE id = v_tx.user_id;

  -- Deduct fee from admin's balance (that was credited during request_withdrawal)
  IF v_fee_amount > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles 
      SET fxu_balance = GREATEST(fxu_balance - v_fee_amount, 0),
          updated_at = now()
      WHERE id = v_admin_id;
    END IF;
  END IF;

  -- Mark transaction as cancelled
  UPDATE wallet_transactions
  SET status = 'cancelled',
      error_message = 'Cancelled by admin',
      updated_at = now()
  WHERE id = p_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'refunded_amount', v_tx.fxu_amount,
    'user_id', v_tx.user_id
  );
END;
$function$;
