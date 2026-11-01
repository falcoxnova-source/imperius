/*
  # Admin Expenses Table
  
  Creates a separate table for admin expenses (like jackpot donations)
  to maintain clean accounting separation from revenue.
  
  1. New Table:
    - admin_expenses: tracks money spent by admin (jackpot donations, etc)
  
  2. Updates:
    - get_admin_available_balance now considers expenses
    - admin_add_to_jackpot records in expenses table
*/

-- Create admin expenses table
CREATE TABLE IF NOT EXISTS admin_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_type text NOT NULL CHECK (expense_type IN ('jackpot_donation', 'promotion', 'refund', 'other')),
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  related_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE admin_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all expenses"
  ON admin_expenses FOR SELECT
  TO authenticated
  USING (is_current_user_admin());

CREATE POLICY "Admin can insert expenses"
  ON admin_expenses FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin());

-- Update get_admin_available_balance to use expenses table
CREATE OR REPLACE FUNCTION get_admin_available_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue numeric;
  v_total_withdrawn numeric;
  v_total_expenses numeric;
BEGIN
  -- Total revenue (fees earned)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
  FROM admin_revenue;

  -- Total admin withdrawals
  SELECT COALESCE(SUM(amount), 0) INTO v_total_withdrawn
  FROM admin_withdrawals
  WHERE status IN ('pending', 'processing', 'confirmed');

  -- Total expenses (jackpot donations, etc)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
  FROM admin_expenses;

  RETURN GREATEST(v_total_revenue - v_total_withdrawn - v_total_expenses, 0);
END;
$$;

-- Update admin_add_to_jackpot to use expenses table
CREATE OR REPLACE FUNCTION admin_add_to_jackpot(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_available_balance numeric;
  v_new_jackpot_balance numeric;
BEGIN
  v_admin_id := auth.uid();
  
  SELECT is_admin INTO v_is_admin 
  FROM profiles 
  WHERE id = v_admin_id;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Check available balance
  v_available_balance := get_admin_available_balance();

  IF v_available_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Saldo insuficiente. Disponible: ' || floor(v_available_balance)::text || ' FXU'
    );
  END IF;

  -- Record expense
  INSERT INTO admin_expenses (expense_type, amount, description, related_user_id)
  VALUES ('jackpot_donation', p_amount, 'Donacion al jackpot', v_admin_id);

  -- Add to jackpot
  SELECT contribute_to_jackpot(p_amount, 'admin_deposit', v_admin_id) INTO v_new_jackpot_balance;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_jackpot_balance,
    'admin_available_after', v_available_balance - p_amount
  );
END;
$$;

-- Fix: Restore admin fxu_balance and record historical donations
DO $$
BEGIN
  -- Set FXU context to allow update
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  
  -- Restore 1000 FXU that was incorrectly deducted from admin
  UPDATE profiles 
  SET fxu_balance = fxu_balance + 1000 
  WHERE is_admin = true;

  -- Record the 2000 historical jackpot donations as expenses
  INSERT INTO admin_expenses (expense_type, amount, description)
  VALUES ('jackpot_donation', 2000, 'Donaciones historicas al jackpot (corregido)');
END $$;
