/*
  # Fix FXU Balance Protection Variable Name Mismatch

  ## Problem
  The protect_fxu_balance trigger checks for variable fxu.allow_update_9x7k2m
  but the request_withdrawal function sets app.fxu_update_allowed.
  This mismatch causes SECURITY_VIOLATION errors when users try to withdraw.

  ## Solution
  Update all functions that modify fxu_balance to use the correct variable name
  that the trigger expects: fxu.allow_update_9x7k2m with value true

  ## Functions Updated
  - request_withdrawal
  - cancel_withdrawal  
  - confirm_deposit
  - fail_withdrawal
*/

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
  v_current_balance numeric;
  v_fee_percent numeric;
  v_fee_amount numeric;
  v_net_amount numeric;
  v_is_admin boolean;
  v_transaction_id uuid;
  v_withdrawals_enabled boolean;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_withdrawals_enabled INTO v_withdrawals_enabled
  FROM wallet_config WHERE id = 1;
  
  IF NOT v_withdrawals_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los retiros estan deshabilitados temporalmente');
  END IF;
  
  SELECT fxu_balance, is_admin INTO v_current_balance, v_is_admin
  FROM profiles
  WHERE id = v_user_id;
  
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto invalido');
  END IF;
  
  IF p_amount > v_current_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente');
  END IF;
  
  IF p_wallet_address IS NULL OR p_wallet_address = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Direccion de wallet requerida');
  END IF;
  
  IF v_is_admin THEN
    v_fee_percent := 0;
    v_fee_amount := 0;
    v_net_amount := p_amount;
  ELSE
    SELECT withdrawal_fee_percent INTO v_fee_percent
    FROM wallet_config WHERE id = 1;
    
    v_fee_amount := p_amount * (v_fee_percent / 100);
    v_net_amount := p_amount - v_fee_amount;
  END IF;
  
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  
  UPDATE profiles
  SET fxu_balance = fxu_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  IF v_fee_amount > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles 
      SET fxu_balance = fxu_balance + v_fee_amount,
          updated_at = now()
      WHERE id = v_admin_id;
    END IF;
  END IF;
  
  INSERT INTO wallet_transactions (
    user_id,
    tx_type,
    amount,
    fxu_amount,
    wallet_address,
    status
  ) VALUES (
    v_user_id,
    'withdrawal',
    v_net_amount,
    p_amount,
    p_wallet_address,
    'pending'
  )
  RETURNING id INTO v_transaction_id;
  
  IF v_fee_amount > 0 THEN
    INSERT INTO admin_revenue (revenue_type, amount, description, related_user_id, related_tx_id)
    VALUES ('withdrawal_fee', v_fee_amount, 'Comision de retiro', v_user_id, v_transaction_id);
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'amount', v_net_amount,
    'gross_amount', p_amount,
    'fee_amount', v_fee_amount,
    'is_admin', v_is_admin
  );
END;
$$;

CREATE OR REPLACE FUNCTION cancel_withdrawal(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_caller_id uuid;
  v_is_admin boolean;
  v_fee_amount numeric;
  v_admin_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_caller_id;
  IF v_is_admin IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin access required');
  END IF;

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

  v_fee_amount := v_tx.fxu_amount - v_tx.amount;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles 
  SET fxu_balance = fxu_balance + v_tx.fxu_amount,
      updated_at = now()
  WHERE id = v_tx.user_id;

  IF v_fee_amount > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles 
      SET fxu_balance = GREATEST(fxu_balance - v_fee_amount, 0),
          updated_at = now()
      WHERE id = v_admin_id;
    END IF;
  END IF;

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
$$;

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
  v_role text;
BEGIN
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only server can confirm deposits');
  END IF;

  IF p_tx_hash IS NULL OR p_tx_hash = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction hash required');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID required');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT * INTO v_existing_tx FROM wallet_transactions WHERE tx_hash = lower(p_tx_hash);

  IF v_existing_tx.id IS NOT NULL THEN
    IF v_existing_tx.status = 'confirmed' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Transaction already confirmed');
    END IF;

    IF v_existing_tx.user_id != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'User mismatch');
    END IF;

    UPDATE wallet_transactions
    SET status = 'confirmed',
        confirmations = p_confirmations,
        block_number = p_block_number,
        processed_at = now(),
        updated_at = now()
    WHERE id = v_existing_tx.id;

    v_tx_id := v_existing_tx.id;
  ELSE
    INSERT INTO wallet_transactions (
      user_id, tx_hash, tx_type, amount, fxu_amount, wallet_address, 
      status, confirmations, block_number, processed_at
    ) VALUES (
      p_user_id, lower(p_tx_hash), 'deposit', p_amount, p_amount, '',
      'confirmed', p_confirmations, p_block_number, now()
    ) RETURNING id INTO v_tx_id;
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  
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

CREATE OR REPLACE FUNCTION fail_withdrawal(p_tx_id uuid, p_error_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_fee_amount numeric;
  v_admin_id uuid;
  v_role text;
BEGIN
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only server can fail withdrawals');
  END IF;

  SELECT * INTO v_tx FROM wallet_transactions WHERE id = p_tx_id;

  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.tx_type != 'withdrawal' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction is not a withdrawal');
  END IF;

  IF v_tx.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction already processed');
  END IF;

  v_fee_amount := v_tx.fxu_amount - v_tx.amount;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles 
  SET fxu_balance = fxu_balance + v_tx.fxu_amount,
      updated_at = now()
  WHERE id = v_tx.user_id;

  IF v_fee_amount > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles 
      SET fxu_balance = GREATEST(fxu_balance - v_fee_amount, 0),
          updated_at = now()
      WHERE id = v_admin_id;
    END IF;
  END IF;

  UPDATE wallet_transactions
  SET status = 'failed',
      error_message = p_error_message,
      updated_at = now()
  WHERE id = p_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'refunded_amount', v_tx.fxu_amount,
    'user_id', v_tx.user_id
  );
END;
$$;
