/*
  # Fix request_withdrawal - Add FXU protection context

  1. Problem
    - The migration 124 fixed the return field names but forgot to include the 
      `set_config('app.fxu_update_allowed'...)` call
    - This causes the FXU protection trigger to block the fxu_balance update
    - Result: 400 Bad Request error

  2. Solution
    - Add the set_config call before updating fxu_balance
    - Keep the admin fee exemption logic
    - Keep returning transaction_id and amount as expected by edge function
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
  
  -- Admin does not pay withdrawal fees
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
  
  -- CRITICAL: Set context to allow fxu_balance update (bypass protection trigger)
  PERFORM set_config('app.fxu_update_allowed', 'request_withdrawal', true);
  
  -- Deduct FXU from user balance
  UPDATE profiles
  SET fxu_balance = fxu_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Add fee to admin (only if there is a fee)
  IF v_fee_amount > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles 
      SET fxu_balance = fxu_balance + v_fee_amount,
          updated_at = now()
      WHERE id = v_admin_id;
    END IF;
  END IF;
  
  -- Create withdrawal transaction
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
  
  -- Record fee in admin_revenue for tracking (only if not admin)
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
