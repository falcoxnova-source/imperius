/*
  # Fix transfer_tokens FXU security context

  1. Changes
    - Added `SET LOCAL fxu.allow_update_9x7k2m = 'true'` before FXU balance updates
    - This allows the function to bypass the FXU protection trigger
    - Matches the pattern used by other FXU-modifying functions
*/

CREATE OR REPLACE FUNCTION transfer_tokens(
  p_receiver_username text,
  p_token_type text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
  v_receiver_id uuid;
  v_receiver_username text;
  v_sender_username text;
  v_sender_balance numeric;
  v_fee_percent numeric;
  v_fee_amount numeric;
  v_net_amount numeric;
  v_transfers_enabled text;
  v_admin_id uuid;
  v_transfer_id uuid;
  v_input text;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT value INTO v_transfers_enabled FROM game_settings WHERE key = 'transfers_enabled';
  IF COALESCE(v_transfers_enabled, 'true') != 'true' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfers are currently disabled');
  END IF;

  IF p_token_type NOT IN ('FXU', 'USDT') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token type');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than 0');
  END IF;

  IF p_amount < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum transfer is 1');
  END IF;

  SELECT username INTO v_sender_username FROM profiles WHERE id = v_sender_id;

  v_input := TRIM(p_receiver_username);

  IF v_input LIKE '%@%' THEN
    SELECT id, username INTO v_receiver_id, v_receiver_username
    FROM profiles
    WHERE LOWER(email) = LOWER(v_input);

    IF v_receiver_id IS NULL THEN
      SELECT id, username INTO v_receiver_id, v_receiver_username
      FROM profiles
      WHERE LOWER(username) = LOWER(v_input);
    END IF;
  ELSE
    SELECT id, username INTO v_receiver_id, v_receiver_username
    FROM profiles
    WHERE LOWER(username) = LOWER(v_input);

    IF v_receiver_id IS NULL THEN
      SELECT id, username INTO v_receiver_id, v_receiver_username
      FROM profiles
      WHERE LOWER(email) = LOWER(v_input);
    END IF;
  END IF;

  IF v_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found. Check the username or email.');
  END IF;

  IF v_receiver_id = v_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  SELECT value INTO v_fee_percent FROM game_settings WHERE key = 'transfer_fee_percent';
  v_fee_percent := COALESCE(v_fee_percent::numeric, 10);

  v_fee_amount := FLOOR(p_amount * v_fee_percent / 100 * 100000000) / 100000000;
  v_net_amount := p_amount - v_fee_amount;

  IF v_net_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount too small after fee');
  END IF;

  IF p_token_type = 'FXU' THEN
    SELECT fxu_balance INTO v_sender_balance FROM profiles WHERE id = v_sender_id;
  ELSE
    SELECT usdt_balance INTO v_sender_balance FROM profiles WHERE id = v_sender_id;
  END IF;

  IF v_sender_balance IS NULL OR v_sender_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'available', COALESCE(v_sender_balance, 0),
      'required', p_amount
    );
  END IF;

  v_admin_id := get_admin_account_id();

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  IF p_token_type = 'FXU' THEN
    UPDATE profiles SET fxu_balance = fxu_balance - p_amount WHERE id = v_sender_id;
    UPDATE profiles SET fxu_balance = fxu_balance + v_net_amount WHERE id = v_receiver_id;
    IF v_admin_id IS NOT NULL AND v_fee_amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_fee_amount WHERE id = v_admin_id;
    END IF;
  ELSE
    UPDATE profiles SET usdt_balance = usdt_balance - p_amount WHERE id = v_sender_id;
    UPDATE profiles SET usdt_balance = usdt_balance + v_net_amount WHERE id = v_receiver_id;
    IF v_admin_id IS NOT NULL AND v_fee_amount > 0 THEN
      UPDATE profiles SET usdt_balance = usdt_balance + v_fee_amount WHERE id = v_admin_id;
    END IF;
  END IF;

  INSERT INTO internal_transfers (sender_id, receiver_id, token_type, gross_amount, fee_amount, net_amount, fee_percent)
  VALUES (v_sender_id, v_receiver_id, p_token_type, p_amount, v_fee_amount, v_net_amount, v_fee_percent)
  RETURNING id INTO v_transfer_id;

  IF v_fee_amount > 0 THEN
    PERFORM record_admin_revenue(
      'transfer_fee',
      v_fee_amount,
      'Transfer fee: ' || p_amount || ' ' || p_token_type || ' from ' || v_sender_id::text || ' to ' || v_receiver_username,
      v_sender_id,
      v_transfer_id
    );
  END IF;

  INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
  VALUES (
    v_receiver_id,
    v_sender_id,
    'Transfer received',
    'You received ' || v_net_amount || ' ' || p_token_type || ' from ' || v_sender_username,
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'gross_amount', p_amount,
    'fee_amount', v_fee_amount,
    'net_amount', v_net_amount,
    'fee_percent', v_fee_percent,
    'receiver', v_receiver_username,
    'token_type', p_token_type
  );
END;
$$;
