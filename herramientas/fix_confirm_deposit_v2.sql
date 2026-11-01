-- Fix: add token_type to confirm_deposit INSERT
CREATE OR REPLACE FUNCTION public.confirm_deposit(
  p_tx_hash text, 
  p_user_id uuid, 
  p_amount numeric, 
  p_block_number bigint, 
  p_confirmations integer,
  p_token_type text DEFAULT 'TUNG'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_tx wallet_transactions%ROWTYPE;
  v_tx_id uuid;
  v_role text;
  v_is_superuser boolean;
BEGIN
  v_is_superuser := (SELECT usesuper FROM pg_user WHERE usename = current_user);
  
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' AND NOT v_is_superuser THEN
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
      user_id, tx_hash, tx_type, token_type, amount, fxu_amount, wallet_address,
      status, confirmations, block_number, processed_at
    ) VALUES (
      p_user_id, lower(p_tx_hash), 'deposit', COALESCE(p_token_type, 'TUNG'), p_amount, p_amount, '',
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
