/*
  # Cancel Withdrawal Function for Admin

  1. New Functions
    - `cancel_withdrawal` - Admin can cancel a pending withdrawal and refund FXU to user
    
  2. Security
    - Only admin users can call this function
    - Refunds the full FXU amount (including fee) back to the user
    - Deducts the fee from admin's balance that was credited during request
    - Updates transaction status to 'cancelled'
    
  3. How it works
    - Validates caller is admin
    - Finds the pending withdrawal transaction
    - Refunds fxu_amount to user's fxu_balance
    - Deducts fee from admin's fxu_balance
    - Marks transaction as cancelled
*/

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
$$;