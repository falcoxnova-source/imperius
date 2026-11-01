/*
  # Update Financial Stats Function

  Updates get_platform_financial_stats to use the new get_admin_available_balance function
  which properly accounts for admin withdrawals.
*/

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

  SELECT COALESCE(SUM(fxu_balance), 0) INTO v_total_user_fxu
  FROM profiles;

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposits
  FROM wallet_transactions
  WHERE tx_type = 'deposit' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawals
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'pending';

  SELECT COALESCE(SUM(amount), 0) INTO v_total_admin_revenue
  FROM admin_revenue;

  v_current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  v_current_year := EXTRACT(YEAR FROM CURRENT_DATE);

  SELECT COALESCE(SUM(amount), 0) INTO v_month_revenue
  FROM admin_revenue
  WHERE EXTRACT(MONTH FROM created_at) = v_current_month
    AND EXTRACT(YEAR FROM created_at) = v_current_year;

  SELECT COALESCE(SUM(amount), 0) INTO v_year_revenue
  FROM admin_revenue
  WHERE EXTRACT(YEAR FROM created_at) = v_current_year;

  -- Use the new function that accounts for admin withdrawals
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