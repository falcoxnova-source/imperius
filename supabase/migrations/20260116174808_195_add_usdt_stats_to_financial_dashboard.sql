/*
  # Add USDT Stats to Financial Dashboard
  
  Updates get_platform_financial_stats to include:
  - Total FXU balance held by users
  - Total USDT balance held by users
  - Total deposits and withdrawals broken down by token type
*/

CREATE OR REPLACE FUNCTION get_platform_financial_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_user_fxu numeric;
  v_total_user_usdt numeric;
  v_total_deposits_fxu numeric;
  v_total_deposits_usdt numeric;
  v_total_withdrawals_fxu numeric;
  v_total_withdrawals_usdt numeric;
  v_pending_withdrawals_fxu numeric;
  v_pending_withdrawals_usdt numeric;
  v_total_admin_revenue numeric;
  v_total_admin_expenses numeric;
  v_month_revenue numeric;
  v_year_revenue numeric;
  v_admin_available numeric;
  v_current_month integer;
  v_current_year integer;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Total FXU held by users (excluding admin)
  SELECT COALESCE(SUM(fxu_balance), 0) INTO v_total_user_fxu
  FROM profiles
  WHERE is_admin = false OR is_admin IS NULL;

  -- Total USDT held by users (excluding admin)
  SELECT COALESCE(SUM(usdt_balance), 0) INTO v_total_user_usdt
  FROM profiles
  WHERE is_admin = false OR is_admin IS NULL;

  -- FXU deposits confirmed
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposits_fxu
  FROM wallet_transactions
  WHERE tx_type = 'deposit' AND status = 'confirmed' AND (token_type = 'FXU' OR token_type IS NULL);

  -- USDT deposits confirmed
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposits_usdt
  FROM wallet_transactions
  WHERE tx_type = 'deposit' AND status = 'confirmed' AND token_type = 'USDT';

  -- FXU withdrawals confirmed
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawals_fxu
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'confirmed' AND (token_type = 'FXU' OR token_type IS NULL);

  -- USDT withdrawals confirmed
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawals_usdt
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'confirmed' AND token_type = 'USDT';

  -- Pending FXU withdrawals
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals_fxu
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'pending' AND (token_type = 'FXU' OR token_type IS NULL);

  -- Pending USDT withdrawals
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals_usdt
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'pending' AND token_type = 'USDT';

  -- Total admin revenue
  SELECT COALESCE(SUM(amount), 0) INTO v_total_admin_revenue
  FROM admin_revenue;

  -- Total admin expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_total_admin_expenses
  FROM admin_expenses;

  v_current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  v_current_year := EXTRACT(YEAR FROM CURRENT_DATE);

  SELECT COALESCE(SUM(amount), 0) INTO v_month_revenue
  FROM admin_revenue
  WHERE EXTRACT(MONTH FROM created_at) = v_current_month
    AND EXTRACT(YEAR FROM created_at) = v_current_year;

  SELECT COALESCE(SUM(amount), 0) INTO v_year_revenue
  FROM admin_revenue
  WHERE EXTRACT(YEAR FROM created_at) = v_current_year;

  v_admin_available := get_admin_available_balance();

  RETURN jsonb_build_object(
    'success', true,
    -- User balances
    'total_user_fxu', v_total_user_fxu,
    'total_user_usdt', v_total_user_usdt,
    -- FXU transactions
    'total_deposits', v_total_deposits_fxu,
    'total_withdrawals', v_total_withdrawals_fxu,
    'pending_withdrawals', v_pending_withdrawals_fxu,
    -- USDT transactions
    'total_deposits_usdt', v_total_deposits_usdt,
    'total_withdrawals_usdt', v_total_withdrawals_usdt,
    'pending_withdrawals_usdt', v_pending_withdrawals_usdt,
    -- Admin stats
    'total_admin_revenue', v_total_admin_revenue,
    'total_admin_expenses', v_total_admin_expenses,
    'month_revenue', v_month_revenue,
    'year_revenue', v_year_revenue,
    'admin_available_balance', v_admin_available,
    'current_month', v_current_month,
    'current_year', v_current_year
  );
END;
$$;
