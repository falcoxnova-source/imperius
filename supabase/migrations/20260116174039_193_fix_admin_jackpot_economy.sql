/*
  # Fix Admin Jackpot Economy
  
  Corrects the financial tracking when admin donates to jackpot:
  
  1. Changes:
    - Excludes admin from "Deuda con usuarios" (total_user_fxu)
    - Admin jackpot donations now deduct from admin_revenue (Disponible Admin)
    - No longer touches admin's personal fxu_balance
    - Records jackpot donations as negative admin_revenue entry
  
  2. Logic:
    - "Deuda con usuarios" = FXU that platform owes to regular users only
    - "Disponible Admin" = Admin revenue (fees) minus admin withdrawals minus jackpot donations
    - Admin's personal fxu_balance is separate from platform economics
*/

-- Update get_platform_financial_stats to exclude admin from user debt
CREATE OR REPLACE FUNCTION get_platform_financial_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_user_fxu numeric;
  v_total_deposits numeric;
  v_total_withdrawals numeric;
  v_pending_withdrawals numeric;
  v_total_admin_revenue numeric;
  v_month_revenue numeric;
  v_year_revenue numeric;
  v_admin_available numeric;
  v_current_month integer;
  v_current_year integer;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- FIXED: Exclude admin accounts from user debt calculation
  SELECT COALESCE(SUM(fxu_balance), 0) INTO v_total_user_fxu
  FROM profiles
  WHERE is_admin = false OR is_admin IS NULL;

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposits
  FROM wallet_transactions
  WHERE tx_type = 'deposit' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawals
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'pending';

  -- Total revenue (only positive entries - fees earned)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_admin_revenue
  FROM admin_revenue
  WHERE amount > 0;

  v_current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  v_current_year := EXTRACT(YEAR FROM CURRENT_DATE);

  SELECT COALESCE(SUM(amount), 0) INTO v_month_revenue
  FROM admin_revenue
  WHERE amount > 0
    AND EXTRACT(MONTH FROM created_at) = v_current_month
    AND EXTRACT(YEAR FROM created_at) = v_current_year;

  SELECT COALESCE(SUM(amount), 0) INTO v_year_revenue
  FROM admin_revenue
  WHERE amount > 0
    AND EXTRACT(YEAR FROM created_at) = v_current_year;

  v_admin_available := get_admin_available_balance();

  RETURN jsonb_build_object(
    'success', true,
    'total_user_fxu', v_total_user_fxu,
    'total_deposits', v_total_deposits,
    'total_withdrawals', v_total_withdrawals,
    'pending_withdrawals', v_pending_withdrawals,
    'total_admin_revenue', v_total_admin_revenue,
    'month_revenue', v_month_revenue,
    'year_revenue', v_year_revenue,
    'admin_available_balance', v_admin_available,
    'current_month', v_current_month,
    'current_year', v_current_year
  );
END;
$$;

-- Update get_admin_available_balance to include jackpot donations as expenses
CREATE OR REPLACE FUNCTION get_admin_available_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue numeric;
  v_total_withdrawn numeric;
  v_total_jackpot_donations numeric;
BEGIN
  -- Total revenue (positive entries only)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
  FROM admin_revenue
  WHERE amount > 0;

  -- Total admin withdrawals
  SELECT COALESCE(SUM(amount), 0) INTO v_total_withdrawn
  FROM admin_withdrawals
  WHERE status IN ('pending', 'processing', 'confirmed');

  -- Total jackpot donations (stored as negative in admin_revenue)
  SELECT COALESCE(ABS(SUM(amount)), 0) INTO v_total_jackpot_donations
  FROM admin_revenue
  WHERE amount < 0 AND revenue_type = 'jackpot_donation';

  RETURN GREATEST(v_total_revenue - v_total_withdrawn - v_total_jackpot_donations, 0);
END;
$$;

-- Update admin_add_to_jackpot to deduct from admin revenue, not fxu_balance
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

  -- Check available balance (revenue - withdrawals - previous donations)
  v_available_balance := get_admin_available_balance();

  IF v_available_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient available balance. Disponible: ' || floor(v_available_balance)::text || ' FXU'
    );
  END IF;

  -- Record as negative revenue (expense/donation)
  INSERT INTO admin_revenue (revenue_type, amount, description, related_user_id)
  VALUES ('jackpot_donation', -p_amount, 'Admin donation to jackpot', v_admin_id);

  -- Add to jackpot
  SELECT contribute_to_jackpot(p_amount, 'admin_deposit', v_admin_id) INTO v_new_jackpot_balance;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_jackpot_balance,
    'admin_available_after', v_available_balance - p_amount
  );
END;
$$;
