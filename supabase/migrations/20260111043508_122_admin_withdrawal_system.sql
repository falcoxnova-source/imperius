/*
  # Admin Withdrawal System

  1. Changes
    - Add `admin_withdrawn_total` column to track how much admin has withdrawn
    - Create function to calculate admin available balance
    - Create function for admin to withdraw without fees
    - Modify request_withdrawal to exempt admin from fees
    
  2. Security
    - Only admin can use admin withdrawal function
    - Admin can only withdraw up to available balance (total fees - already withdrawn)
*/

-- Add table to track admin withdrawals
CREATE TABLE IF NOT EXISTS admin_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES profiles(id),
  amount numeric NOT NULL CHECK (amount > 0),
  wallet_address text NOT NULL,
  tx_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'confirmed', 'failed')),
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE admin_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view own withdrawals"
  ON admin_withdrawals FOR SELECT
  TO authenticated
  USING (admin_id = auth.uid());

CREATE POLICY "Admin can insert own withdrawals"
  ON admin_withdrawals FOR INSERT
  TO authenticated
  WITH CHECK (
    admin_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Function to get admin available balance
CREATE OR REPLACE FUNCTION get_admin_available_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue numeric;
  v_total_withdrawn numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
  FROM admin_revenue;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_total_withdrawn
  FROM admin_withdrawals
  WHERE status IN ('pending', 'processing', 'confirmed');
  
  RETURN v_total_revenue - v_total_withdrawn;
END;
$$;

-- Function for admin to request withdrawal (no fees)
CREATE OR REPLACE FUNCTION admin_request_withdrawal(
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
  v_is_admin boolean;
  v_available_balance numeric;
  v_withdrawal_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores pueden usar esta funcion');
  END IF;
  
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto invalido');
  END IF;
  
  IF p_wallet_address IS NULL OR p_wallet_address = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Direccion de wallet requerida');
  END IF;
  
  v_available_balance := get_admin_available_balance();
  
  IF p_amount > v_available_balance THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Saldo insuficiente. Disponible: ' || v_available_balance::text || ' FXU'
    );
  END IF;
  
  INSERT INTO admin_withdrawals (admin_id, amount, wallet_address, status)
  VALUES (v_user_id, p_amount, p_wallet_address, 'pending')
  RETURNING id INTO v_withdrawal_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'amount', p_amount,
    'new_available_balance', v_available_balance - p_amount
  );
END;
$$;

-- Update regular withdrawal to exempt admin from fees
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
  v_withdrawal_id uuid;
  v_withdrawals_enabled boolean;
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
  
  UPDATE profiles
  SET fxu_balance = fxu_balance - p_amount
  WHERE id = v_user_id;
  
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
  RETURNING id INTO v_withdrawal_id;
  
  -- Only record fee revenue if not admin
  IF v_fee_amount > 0 THEN
    INSERT INTO admin_revenue (revenue_type, amount, description, related_user_id, related_tx_id)
    VALUES ('withdrawal_fee', v_fee_amount, 'Comision de retiro', v_user_id, v_withdrawal_id);
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'gross_amount', p_amount,
    'fee_amount', v_fee_amount,
    'net_amount', v_net_amount,
    'is_admin', v_is_admin
  );
END;
$$;

-- Function to process admin withdrawal (mark as confirmed)
CREATE OR REPLACE FUNCTION process_admin_withdrawal(
  p_withdrawal_id uuid,
  p_tx_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  
  SELECT is_admin INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;
  
  UPDATE admin_withdrawals
  SET status = 'confirmed',
      tx_hash = p_tx_hash,
      processed_at = now()
  WHERE id = p_withdrawal_id
  AND status = 'pending';
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_admin_available_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_request_withdrawal(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION process_admin_withdrawal(uuid, text) TO authenticated;