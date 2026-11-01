/*
  # Require Telegram for Withdrawals

  1. Changes
    - Modify `request_withdrawal` function to require:
      - Telegram account linked
      - User is currently a member of the Telegram group
    
  2. Purpose
    - Prevents multi-account abuse
    - One Telegram account = one account that can withdraw
    - Users can still play without Telegram, just cannot withdraw

  3. Security
    - Validates telegram_links table for linked account
    - Validates telegram_task_rewards for current membership status
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
  v_telegram_id bigint;
  v_is_member boolean;
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
  
  -- Check if user has Telegram linked
  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;
  
  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes vincular tu cuenta de Telegram para poder retirar FXU. Ve a la seccion de Tareas para vincular tu cuenta.'
    );
  END IF;
  
  -- Check if user is currently a member of the Telegram group
  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';
  
  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes ser miembro del grupo de Telegram para poder retirar FXU. Unete al grupo desde la seccion de Tareas.'
    );
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
