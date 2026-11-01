/*
  # Admin Cancel Pending Withdrawal Function

  ## Problem
  Admin withdrawals that fail to process (never reach the blockchain step)
  remain in "pending" status and block the available balance.
  The admin needs a way to cancel these stuck pending withdrawals.

  ## Solution
  Create a function that allows admin to cancel their own pending withdrawals,
  which will change the status to "cancelled" and free up the balance.

  ## Changes
  - New function: admin_cancel_withdrawal
  - Adds error tracking column to admin_withdrawals table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_withdrawals' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE admin_withdrawals ADD COLUMN error_message text;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION admin_cancel_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_withdrawal admin_withdrawals%ROWTYPE;
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
  
  SELECT * INTO v_withdrawal
  FROM admin_withdrawals
  WHERE id = p_withdrawal_id AND admin_id = v_user_id;
  
  IF v_withdrawal.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Retiro no encontrado');
  END IF;
  
  IF v_withdrawal.status NOT IN ('pending', 'processing', 'failed') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Solo se pueden cancelar retiros pendientes, en proceso o fallidos. Estado actual: ' || v_withdrawal.status
    );
  END IF;
  
  UPDATE admin_withdrawals
  SET status = 'cancelled',
      error_message = 'Cancelado por admin',
      updated_at = now()
  WHERE id = p_withdrawal_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'cancelled_amount', v_withdrawal.amount,
    'message', 'Retiro cancelado. Balance liberado.'
  );
END;
$$;

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

  RETURN GREATEST(v_total_revenue - v_total_withdrawn, 0);
END;
$$;
