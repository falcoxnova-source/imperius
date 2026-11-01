-- Dynamic TUNG gas buffer: charge 0.05 USD worth of TUNG (deposit_gas_buffer_usdt / tung_price)
-- instead of a fixed 100 TUNG. Falls back to the fixed deposit_gas_buffer_tung when the
-- live TUNG price is unavailable/stale.

CREATE OR REPLACE FUNCTION public.credit_auto_deposit(p_tx_hash text, p_user_id uuid, p_amount numeric, p_token_type text, p_block_number bigint, p_child_address text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_superuser boolean;
  v_role text;
  v_token text;
  v_currency text;
  v_buffer numeric;
  v_tung_price numeric;
  v_usd_buffer numeric;
  v_user_credit numeric;
  v_admin_credit numeric;
  v_admin_id uuid;
  v_tx_id uuid;
  v_existing wallet_transactions%ROWTYPE;
BEGIN
  v_is_superuser := (SELECT usesuper FROM pg_user WHERE usename = current_user);
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' AND NOT v_is_superuser THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: server only');
  END IF;

  IF p_tx_hash IS NULL OR p_tx_hash = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'tx hash required');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount must be positive');
  END IF;

  v_token := UPPER(COALESCE(p_token_type, 'TUNG'));
  IF v_token NOT IN ('TUNG', 'USDT') THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad token type');
  END IF;

  -- Idempotency: never credit the same tx twice
  SELECT * INTO v_existing FROM wallet_transactions WHERE tx_hash = lower(p_tx_hash);
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already processed', 'duplicate', true);
  END IF;

  IF v_token = 'TUNG' THEN
    -- Dynamic buffer: 0.05 USD worth of TUNG based on the live price.
    SELECT COALESCE(value::numeric, 0.05) INTO v_usd_buffer FROM game_settings WHERE key = 'deposit_gas_buffer_usdt';
    v_usd_buffer := COALESCE(v_usd_buffer, 0.05);
    v_tung_price := get_live_tung_price_usd();
    IF v_tung_price IS NOT NULL AND v_tung_price > 0 THEN
      v_buffer := v_usd_buffer / v_tung_price;
    ELSE
      -- Fallback to the fixed TUNG buffer when the price is unavailable/stale.
      SELECT COALESCE(value::numeric, 100) INTO v_buffer FROM game_settings WHERE key = 'deposit_gas_buffer_tung';
      v_buffer := COALESCE(v_buffer, 100);
    END IF;
    v_currency := 'FXU';
  ELSE
    SELECT COALESCE(value::numeric, 0.05) INTO v_buffer FROM game_settings WHERE key = 'deposit_gas_buffer_usdt';
    v_buffer := COALESCE(v_buffer, 0.05);
    v_currency := 'USDT';
  END IF;

  IF p_amount > v_buffer THEN
    v_user_credit := p_amount - v_buffer;
    v_admin_credit := v_buffer;
  ELSE
    v_user_credit := 0;
    v_admin_credit := p_amount;
  END IF;

  -- Record the on-chain deposit (amount = gross received; constraint requires > 0)
  INSERT INTO wallet_transactions (
    user_id, tx_hash, tx_type, token_type, amount, fxu_amount, wallet_address,
    status, confirmations, block_number, processed_at
  ) VALUES (
    p_user_id, lower(p_tx_hash), 'deposit', v_token, p_amount, p_amount,
    COALESCE(p_child_address, ''), 'confirmed', 3, p_block_number, now()
  ) RETURNING id INTO v_tx_id;

  -- Allow moving protected fxu_balance for this transaction
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Credit the user (received - buffer)
  IF v_user_credit > 0 THEN
    IF v_token = 'TUNG' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_user_credit, updated_at = now() WHERE id = p_user_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_user_credit, updated_at = now() WHERE id = p_user_id;
    END IF;
  END IF;

  -- Credit the admin the gas buffer + ledger
  IF v_admin_credit > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      IF v_token = 'TUNG' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_admin_credit, updated_at = now() WHERE id = v_admin_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_admin_credit, updated_at = now() WHERE id = v_admin_id;
      END IF;
    END IF;
    PERFORM record_admin_revenue('deposit_gas_buffer', v_admin_credit, 'Buffer de gas de deposito', p_user_id, v_tx_id, v_currency);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'credited', v_user_credit,
    'buffer', v_admin_credit,
    'token', v_token
  );
END;
$function$;
