/*
  # Internal FXU Transfer System

  Allows players to transfer FXU or USDT to other players with a 10% admin fee.

  1. New Tables
    - `internal_transfers`
      - `id` (uuid, primary key)
      - `sender_id` (uuid, FK to profiles)
      - `receiver_id` (uuid, FK to profiles)
      - `token_type` (text, 'FXU' or 'USDT')
      - `gross_amount` (numeric, amount before fee)
      - `fee_amount` (numeric, 10% fee taken)
      - `net_amount` (numeric, amount receiver gets)
      - `fee_percent` (numeric, the fee % at time of transfer)
      - `created_at` (timestamptz)

  2. New Functions
    - `transfer_tokens(p_receiver_username, p_token_type, p_amount)` - Transfers tokens
      with 10% admin fee. Validates balances, prevents self-transfer, etc.
    - `get_transfer_history()` - Returns transfer history for current user

  3. Security
    - RLS enabled on `internal_transfers`
    - Users can only see transfers where they are sender or receiver
    - Insert only via the secure function (no direct inserts)

  4. Admin Revenue
    - Adds 'transfer_fee' to admin_revenue revenue_type constraint
    - Fee goes to admin account balance and is tracked in admin_revenue

  5. Admin Config
    - `transfer_fee_percent` setting in game_settings (default 10)
    - `transfers_enabled` setting in game_settings (default true)
*/

-- Add 'transfer_fee' to admin_revenue revenue_type constraint
DO $$
BEGIN
  ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
  ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
    CHECK (revenue_type = ANY (ARRAY[
      'market_fee', 'withdrawal_fee', 'instant_build', 'instant_research',
      'instant_ship', 'referral_bonus', 'officer_fxu', 'expedition_fee',
      'supply_box', 'fleet_acceleration', 'swap_fee', 'transfer_fee', 'other'
    ]));
END $$;

-- Add game settings for transfers
INSERT INTO game_settings (key, value, description)
VALUES 
  ('transfer_fee_percent', '10', 'Fee percentage charged on internal transfers (goes to admin)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES 
  ('transfers_enabled', 'true', 'Whether internal token transfers are enabled')
ON CONFLICT (key) DO NOTHING;

-- Create internal_transfers table
CREATE TABLE IF NOT EXISTS internal_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES profiles(id),
  receiver_id uuid NOT NULL REFERENCES profiles(id),
  token_type text NOT NULL CHECK (token_type IN ('FXU', 'USDT')),
  gross_amount numeric(20,8) NOT NULL CHECK (gross_amount > 0),
  fee_amount numeric(20,8) NOT NULL CHECK (fee_amount >= 0),
  net_amount numeric(20,8) NOT NULL CHECK (net_amount > 0),
  fee_percent numeric(5,2) NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_transfers_sender ON internal_transfers(sender_id);
CREATE INDEX IF NOT EXISTS idx_internal_transfers_receiver ON internal_transfers(receiver_id);
CREATE INDEX IF NOT EXISTS idx_internal_transfers_created ON internal_transfers(created_at DESC);

ALTER TABLE internal_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transfers"
  ON internal_transfers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Transfer function
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
  v_receiver record;
  v_sender_balance numeric;
  v_fee_percent numeric;
  v_fee_amount numeric;
  v_net_amount numeric;
  v_transfers_enabled text;
  v_admin_id uuid;
  v_transfer_id uuid;
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

  SELECT id, username, is_vacation INTO v_receiver
  FROM profiles
  WHERE LOWER(username) = LOWER(TRIM(p_receiver_username));

  IF v_receiver IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_receiver.id = v_sender_id THEN
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

  IF p_token_type = 'FXU' THEN
    UPDATE profiles SET fxu_balance = fxu_balance - p_amount WHERE id = v_sender_id;
    UPDATE profiles SET fxu_balance = fxu_balance + v_net_amount WHERE id = v_receiver.id;
    IF v_admin_id IS NOT NULL AND v_fee_amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_fee_amount WHERE id = v_admin_id;
    END IF;
  ELSE
    UPDATE profiles SET usdt_balance = usdt_balance - p_amount WHERE id = v_sender_id;
    UPDATE profiles SET usdt_balance = usdt_balance + v_net_amount WHERE id = v_receiver.id;
    IF v_admin_id IS NOT NULL AND v_fee_amount > 0 THEN
      UPDATE profiles SET usdt_balance = usdt_balance + v_fee_amount WHERE id = v_admin_id;
    END IF;
  END IF;

  INSERT INTO internal_transfers (sender_id, receiver_id, token_type, gross_amount, fee_amount, net_amount, fee_percent)
  VALUES (v_sender_id, v_receiver.id, p_token_type, p_amount, v_fee_amount, v_net_amount, v_fee_percent)
  RETURNING id INTO v_transfer_id;

  IF v_fee_amount > 0 THEN
    PERFORM record_admin_revenue(
      'transfer_fee',
      v_fee_amount,
      'Transfer fee: ' || p_amount || ' ' || p_token_type || ' from ' || v_sender_id::text || ' to ' || v_receiver.username,
      v_sender_id,
      v_transfer_id
    );
  END IF;

  INSERT INTO messages (user_id, sender_name, subject, body, message_type)
  VALUES (
    v_receiver.id,
    (SELECT username FROM profiles WHERE id = v_sender_id),
    'Transfer received',
    'You received ' || v_net_amount || ' ' || p_token_type || ' from ' || (SELECT username FROM profiles WHERE id = v_sender_id),
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'gross_amount', p_amount,
    'fee_amount', v_fee_amount,
    'net_amount', v_net_amount,
    'fee_percent', v_fee_percent,
    'receiver', v_receiver.username,
    'token_type', p_token_type
  );
END;
$$;

-- Transfer history function
CREATE OR REPLACE FUNCTION get_transfer_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_transfers jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_transfers
  FROM (
    SELECT
      it.id,
      it.token_type,
      it.gross_amount,
      it.fee_amount,
      it.net_amount,
      it.fee_percent,
      it.created_at,
      CASE WHEN it.sender_id = v_user_id THEN 'sent' ELSE 'received' END AS direction,
      CASE WHEN it.sender_id = v_user_id THEN rp.username ELSE sp.username END AS other_user
    FROM internal_transfers it
    JOIN profiles sp ON sp.id = it.sender_id
    JOIN profiles rp ON rp.id = it.receiver_id
    WHERE it.sender_id = v_user_id OR it.receiver_id = v_user_id
    ORDER BY it.created_at DESC
    LIMIT 50
  ) t;

  RETURN jsonb_build_object('success', true, 'transfers', v_transfers);
END;
$$;
