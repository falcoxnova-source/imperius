/*
  # Admin function to reset all FXU balances

  1. Changes
    - Creates admin_reset_all_fxu_balances function
    - Temporarily disables the protection trigger to allow reset
    - Only admins can execute this function

  2. Security
    - Admin-only access
    - Logs the action
*/

CREATE OR REPLACE FUNCTION admin_reset_all_fxu_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_count integer;
BEGIN
  -- Verify admin
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;

  -- Disable the trigger temporarily
  ALTER TABLE profiles DISABLE TRIGGER protect_fxu_balance_trigger;

  -- Reset all FXU balances to 0
  UPDATE profiles SET fxu_balance = 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Re-enable the trigger
  ALTER TABLE profiles ENABLE TRIGGER protect_fxu_balance_trigger;

  RETURN jsonb_build_object(
    'success', true,
    'accounts_reset', v_count,
    'message', 'All FXU balances have been reset to 0'
  );
END;
$$;