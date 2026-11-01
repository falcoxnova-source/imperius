/*
  # Smart Contract Integration for Wallet System

  1. Updates
    - Add `contract_address` to wallet_config
    - Add `chain_id` for network identification
    - Add `signature_expiry_seconds` for withdrawal signatures
    - Add `withdrawal_signature` to wallet_transactions for storing generated signatures

  2. New Columns
    - `wallet_transactions.signature_data` (jsonb) - Stores signature and expiry for withdrawals
    - `wallet_transactions.contract_tx_hash` (text) - Blockchain tx hash after user claims
    - `wallet_config.contract_address` (text) - Deployed smart contract address
    - `wallet_config.chain_id` (integer) - BSC chain ID (56 mainnet, 97 testnet)
    - `wallet_config.signature_expiry_seconds` (integer) - How long signatures are valid

  3. Functions
    - `generate_withdrawal_signature_data` - Prepares data for signing
    - `mark_withdrawal_signed` - Records that signature was generated
    - `confirm_contract_withdrawal` - Confirms withdrawal after blockchain tx
*/

-- Add smart contract columns to wallet_config
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'contract_address'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN contract_address text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'chain_id'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN chain_id integer DEFAULT 56;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'signature_expiry_seconds'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN signature_expiry_seconds integer DEFAULT 900;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_config' AND column_name = 'signer_address'
  ) THEN
    ALTER TABLE wallet_config ADD COLUMN signer_address text DEFAULT '';
  END IF;
END $$;

-- Add signature columns to wallet_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_transactions' AND column_name = 'signature_data'
  ) THEN
    ALTER TABLE wallet_transactions ADD COLUMN signature_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_transactions' AND column_name = 'contract_tx_hash'
  ) THEN
    ALTER TABLE wallet_transactions ADD COLUMN contract_tx_hash text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_transactions' AND column_name = 'signature_expiry'
  ) THEN
    ALTER TABLE wallet_transactions ADD COLUMN signature_expiry timestamptz;
  END IF;
END $$;

-- Function to prepare withdrawal data for signature (returns data needed by edge function)
CREATE OR REPLACE FUNCTION prepare_withdrawal_for_signing(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_config wallet_config%ROWTYPE;
  v_expiry_timestamp bigint;
  v_amount_wei text;
BEGIN
  SELECT * INTO v_tx FROM wallet_transactions WHERE id = p_tx_id;
  
  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.tx_type != 'withdrawal' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a withdrawal transaction');
  END IF;

  IF v_tx.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not in pending status');
  END IF;

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  IF v_config.contract_address = '' OR v_config.contract_address IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Smart contract not configured');
  END IF;

  v_expiry_timestamp := EXTRACT(EPOCH FROM (now() + (v_config.signature_expiry_seconds || ' seconds')::interval))::bigint;
  v_amount_wei := (v_tx.amount * 1e18)::numeric::text;

  RETURN jsonb_build_object(
    'success', true,
    'tx_id', v_tx.id,
    'user_wallet', v_tx.wallet_address,
    'amount', v_tx.amount,
    'amount_wei', v_amount_wei,
    'withdraw_id', v_tx.id::text,
    'expiry', v_expiry_timestamp,
    'chain_id', v_config.chain_id,
    'contract_address', v_config.contract_address
  );
END;
$$;

-- Function to record signature generation
CREATE OR REPLACE FUNCTION mark_withdrawal_signed(
  p_tx_id uuid,
  p_signature text,
  p_expiry bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expiry_ts timestamptz;
BEGIN
  v_expiry_ts := to_timestamp(p_expiry);

  UPDATE wallet_transactions
  SET 
    status = 'processing',
    signature_data = jsonb_build_object(
      'signature', p_signature,
      'expiry', p_expiry,
      'generated_at', EXTRACT(EPOCH FROM now())::bigint
    ),
    signature_expiry = v_expiry_ts,
    updated_at = now()
  WHERE id = p_tx_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found or not pending');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to confirm withdrawal after blockchain transaction
CREATE OR REPLACE FUNCTION confirm_contract_withdrawal(
  p_tx_id uuid,
  p_contract_tx_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE wallet_transactions
  SET 
    status = 'confirmed',
    contract_tx_hash = p_contract_tx_hash,
    tx_hash = p_contract_tx_hash,
    processed_at = now(),
    updated_at = now()
  WHERE id = p_tx_id AND status = 'processing';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found or not in processing status');
  END IF;

  RETURN jsonb_build_object('success', true, 'tx_hash', p_contract_tx_hash);
END;
$$;

-- Function to get smart contract config for frontend
CREATE OR REPLACE FUNCTION get_contract_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config wallet_config%ROWTYPE;
BEGIN
  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  RETURN jsonb_build_object(
    'contract_address', v_config.contract_address,
    'chain_id', v_config.chain_id,
    'signer_address', v_config.signer_address,
    'min_deposit', v_config.min_deposit,
    'max_withdrawal_daily', v_config.max_withdrawal_daily,
    'withdrawal_fee_percent', v_config.withdrawal_fee_percent,
    'signature_expiry_seconds', v_config.signature_expiry_seconds,
    'deposits_enabled', v_config.is_deposits_enabled,
    'withdrawals_enabled', v_config.is_withdrawals_enabled
  );
END;
$$;

-- Updated request_withdrawal for smart contract flow
CREATE OR REPLACE FUNCTION request_withdrawal_v2(
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

  IF p_wallet_address IS NULL OR p_wallet_address = '' OR 
     NOT (p_wallet_address ~ '^0x[a-fA-F0-9]{40}$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet address');
  END IF;

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  IF NOT v_config.is_withdrawals_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawals are currently disabled');
  END IF;

  IF v_config.contract_address = '' OR v_config.contract_address IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Smart contract not configured');
  END IF;

  IF p_amount < v_config.min_deposit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount below minimum: ' || v_config.min_deposit);
  END IF;

  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = v_user_id;

  IF v_fxu_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  v_daily_total := get_daily_withdrawal_total(v_user_id);
  IF v_daily_total + p_amount > v_config.max_withdrawal_daily THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Daily withdrawal limit exceeded. Remaining: ' || (v_config.max_withdrawal_daily - v_daily_total)
    );
  END IF;

  v_fee := p_amount * (v_config.withdrawal_fee_percent / 100);
  v_net_amount := p_amount - v_fee;

  UPDATE profiles 
  SET fxu_balance = fxu_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_fee > 0 THEN
    UPDATE profiles 
    SET fxu_balance = fxu_balance + v_fee
    WHERE id = v_admin_id;
  END IF;

  INSERT INTO wallet_transactions (
    user_id, tx_type, amount, fxu_amount, wallet_address, status
  ) VALUES (
    v_user_id, 'withdrawal', v_net_amount, p_amount, lower(p_wallet_address), 'pending'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'amount', v_net_amount,
    'fee', v_fee,
    'wallet_address', lower(p_wallet_address),
    'message', 'Withdrawal request created. Generate signature to claim on blockchain.'
  );
END;
$$;

-- Function to get withdrawal with signature data
CREATE OR REPLACE FUNCTION get_pending_withdrawal(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_config wallet_config%ROWTYPE;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_tx FROM wallet_transactions 
  WHERE id = p_tx_id AND user_id = v_user_id;
  
  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'tx_id', v_tx.id,
    'status', v_tx.status,
    'amount', v_tx.amount,
    'fxu_amount', v_tx.fxu_amount,
    'wallet_address', v_tx.wallet_address,
    'signature_data', v_tx.signature_data,
    'signature_expiry', v_tx.signature_expiry,
    'contract_tx_hash', v_tx.contract_tx_hash,
    'contract_address', v_config.contract_address,
    'chain_id', v_config.chain_id,
    'created_at', v_tx.created_at
  );
END;
$$;
