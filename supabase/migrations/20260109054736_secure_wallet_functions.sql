/*
  # Secure Wallet Functions

  1. Security Fixes
    - `confirm_deposit` - Only callable by service_role (edge functions)
    - `complete_withdrawal` - Only callable by service_role
    - `fail_withdrawal` - Only callable by service_role
    - These functions should NEVER be callable by regular users

  2. How it works
    - Check if current_setting('role') = 'service_role'
    - This ensures only edge functions with service_role key can call these
*/

-- Secure confirm_deposit - ONLY service_role can call this
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

-- Secure complete_withdrawal - ONLY service_role can call this
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
DECLARE
  v_role text;
BEGIN
  -- SECURITY: Only service_role can call this function
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only server can complete withdrawals');
  END IF;

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

-- Secure fail_withdrawal - ONLY service_role can call this
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
  v_role text;
  v_admin_id uuid;
  v_fee_to_refund numeric;
BEGIN
  -- SECURITY: Only service_role can call this function
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only server can fail withdrawals');
  END IF;

  SELECT * INTO v_tx FROM wallet_transactions WHERE id = p_tx_id;
  
  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot fail transaction in status: ' || v_tx.status);
  END IF;

  -- Refund full FXU to user (including fee)
  UPDATE profiles 
  SET fxu_balance = fxu_balance + v_tx.fxu_amount,
      updated_at = now()
  WHERE id = v_tx.user_id;

  -- Also need to deduct the fee from admin that was credited during request_withdrawal
  v_fee_to_refund := v_tx.fxu_amount - v_tx.amount;
  IF v_fee_to_refund > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles 
      SET fxu_balance = GREATEST(fxu_balance - v_fee_to_refund, 0)
      WHERE id = v_admin_id;
    END IF;
  END IF;

  -- Mark transaction as failed
  UPDATE wallet_transactions
  SET status = 'failed',
      error_message = p_error_message,
      updated_at = now()
  WHERE id = p_tx_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_tx.fxu_amount);
END;
$$;

-- Also secure the RLS policies to prevent direct manipulation
-- Drop and recreate more restrictive policies for wallet_transactions

DROP POLICY IF EXISTS "Users can create deposit requests" ON wallet_transactions;

-- Users can only insert deposits with pending status and their own user_id
CREATE POLICY "Users can create deposit requests"
  ON wallet_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    AND tx_type = 'deposit' 
    AND status = 'pending'
  );

-- Prevent users from updating transactions directly
DROP POLICY IF EXISTS "Service role can update transactions" ON wallet_transactions;

-- Add update policy ONLY for service_role through functions
-- Regular users cannot update wallet_transactions at all
