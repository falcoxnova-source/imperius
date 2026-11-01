/*
  # Fix: Corrige columna user_id -> recipient_id en funciones de retiro

  El INSERT INTO messages usaba "user_id" que no existe en la tabla messages.
  La columna correcta es "recipient_id".

  Funciones corregidas:
    - request_withdrawal (FXU)
    - request_withdrawal_usdt (USDT)
*/

-- =============================================
-- FIX: request_withdrawal (FXU)
-- =============================================
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
  v_referrer_id uuid;
  v_referrer_share numeric;
  v_admin_share numeric;
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
  
  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;
  
  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes vincular tu cuenta de Telegram para poder retirar FXU. Ve a la seccion de Tareas para vincular tu Telegram.'
    );
  END IF;
  
  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';
  
  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes ser miembro del grupo de Telegram para poder retirar FXU. Ve a la seccion de Tareas para unirte al grupo.'
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
  
  IF v_is_admin THEN
    v_fee_percent := 0;
    v_fee_amount := 0;
    v_net_amount := p_amount;
    v_referrer_share := 0;
    v_admin_share := 0;
  ELSE
    SELECT withdrawal_fee_percent INTO v_fee_percent
    FROM wallet_config WHERE id = 1;
    
    v_fee_amount := p_amount * (v_fee_percent / 100);
    v_net_amount := p_amount - v_fee_amount;
    
    SELECT referred_by INTO v_referrer_id
    FROM profiles
    WHERE id = v_user_id;
    
    IF v_referrer_id IS NOT NULL THEN
      v_referrer_share := p_amount * 5 / 100;
      v_admin_share := v_fee_amount - v_referrer_share;
    ELSE
      v_referrer_share := 0;
      v_admin_share := v_fee_amount;
    END IF;
  END IF;
  
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  
  UPDATE profiles
  SET fxu_balance = fxu_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  IF v_admin_share > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles 
      SET fxu_balance = fxu_balance + v_admin_share,
          updated_at = now()
      WHERE id = v_admin_id;
    END IF;
  END IF;
  
  IF v_referrer_share > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles 
    SET fxu_balance = fxu_balance + v_referrer_share,
        updated_at = now()
    WHERE id = v_referrer_id;
    
    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer_id, v_user_id, NULL, 'withdrawal_referral', v_referrer_share);
    
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_referrer_id,
      v_user_id,
      'Comision de referido por retiro',
      'Has recibido ' || ROUND(v_referrer_share, 2) || ' FXU como comision por el retiro de tu referido.',
      'system'
    );
  END IF;
  
  INSERT INTO wallet_transactions (
    user_id, tx_type, amount, fxu_amount, wallet_address, status
  ) VALUES (
    v_user_id, 'withdrawal', v_net_amount, p_amount, p_wallet_address, 'pending'
  )
  RETURNING id INTO v_transaction_id;
  
  IF v_fee_amount > 0 THEN
    INSERT INTO admin_revenue (revenue_type, amount, description, related_user_id, related_tx_id)
    VALUES ('withdrawal_fee', v_admin_share, 'Comision de retiro (empresa)', v_user_id, v_transaction_id);
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

-- =============================================
-- FIX: request_withdrawal_usdt (USDT)
-- =============================================
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
  v_referrer_id uuid;
  v_referrer_share numeric;
  v_admin_share numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  IF NOT v_config.is_usdt_withdrawals_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'USDT withdrawals are currently disabled');
  END IF;

  IF p_amount < v_config.usdt_min_deposit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount below minimum: ' || v_config.usdt_min_deposit);
  END IF;

  SELECT usdt_balance INTO v_usdt_balance FROM profiles WHERE id = v_user_id;

  IF v_usdt_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient USDT balance');
  END IF;

  v_daily_total := get_daily_usdt_withdrawal_total(v_user_id);
  IF v_daily_total + p_amount > v_config.usdt_max_withdrawal_daily THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Daily USDT withdrawal limit exceeded. Remaining: ' || (v_config.usdt_max_withdrawal_daily - v_daily_total)
    );
  END IF;

  v_fee := p_amount * (v_config.usdt_withdrawal_fee_percent / 100);
  v_net_amount := p_amount - v_fee;

  SELECT referred_by INTO v_referrer_id
  FROM profiles
  WHERE id = v_user_id;

  IF v_referrer_id IS NOT NULL THEN
    v_referrer_share := p_amount * 5 / 100;
    v_admin_share := v_fee - v_referrer_share;
  ELSE
    v_referrer_share := 0;
    v_admin_share := v_fee;
  END IF;

  UPDATE profiles 
  SET usdt_balance = usdt_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_share > 0 THEN
    UPDATE profiles 
    SET usdt_balance = usdt_balance + v_admin_share
    WHERE id = v_admin_id;
  END IF;

  IF v_referrer_share > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles 
    SET usdt_balance = usdt_balance + v_referrer_share,
        updated_at = now()
    WHERE id = v_referrer_id;

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer_id, v_user_id, NULL, 'withdrawal_referral', v_referrer_share);

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_referrer_id,
      v_user_id,
      'Comision de referido por retiro USDT',
      'Has recibido ' || ROUND(v_referrer_share, 2) || ' USDT como comision por el retiro de tu referido.',
      'system'
    );
  END IF;

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
