/*
  # Admin Jackpot Donation - Deduct from Admin Balance
  
  Updates admin_add_to_jackpot function to deduct FXU from admin's
  available balance instead of creating tokens from nothing.
  
  Changes:
  - Verifies admin has sufficient FXU balance
  - Deducts amount from admin's fxu_balance
  - Then contributes to jackpot
*/

CREATE OR REPLACE FUNCTION admin_add_to_jackpot(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_admin_balance numeric;
  v_new_balance numeric;
BEGIN
  v_admin_id := auth.uid();
  
  SELECT is_admin, fxu_balance 
  INTO v_is_admin, v_admin_balance 
  FROM profiles 
  WHERE id = v_admin_id;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF v_admin_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient FXU balance. Available: ' || floor(v_admin_balance)::text
    );
  END IF;

  PERFORM _internal_set_fxu_context();
  
  UPDATE profiles 
  SET fxu_balance = fxu_balance - p_amount 
  WHERE id = v_admin_id;

  SELECT contribute_to_jackpot(p_amount, 'admin_deposit', v_admin_id) INTO v_new_balance;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'admin_balance_after', v_admin_balance - p_amount
  );
END;
$$;
