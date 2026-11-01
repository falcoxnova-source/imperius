/*
  # Fix purchase officer with FXU - missing security bypass

  1. Problem
    - The `purchase_officer_with_fxu` function is missing the `set_config` call
      to bypass the `protect_fxu_balance_trigger`
    - This causes a SECURITY_VIOLATION error when trying to deduct FXU
    - Regression introduced in migration 197

  2. Fix
    - Add `PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true)` before
      the FXU balance update
    - No other changes to the function
*/

CREATE OR REPLACE FUNCTION purchase_officer_with_fxu(
  p_officer_type_id uuid,
  p_duration text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_officer officer_types%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_days_to_add integer;
  v_existing_officer user_officers%ROWTYPE;
  v_new_expiry timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_existing_officer
  FROM user_officers
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id
    AND expires_at > NOW();

  IF v_existing_officer IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer is still active. Wait until it expires to purchase again.');
  END IF;

  SELECT * INTO v_officer FROM officer_types WHERE id = p_officer_type_id;
  IF v_officer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer type not found');
  END IF;

  CASE p_duration
    WHEN '7d' THEN 
      v_fxu_cost := v_officer.fxu_cost_7d;
      v_days_to_add := 7;
    WHEN '30d' THEN 
      v_fxu_cost := v_officer.fxu_cost_30d;
      v_days_to_add := 30;
    WHEN '90d' THEN 
      v_fxu_cost := v_officer.fxu_cost_90d;
      v_days_to_add := 90;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid duration');
  END CASE;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles 
  SET fxu_balance = fxu_balance - v_fxu_cost 
  WHERE id = v_user_id;

  INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
  VALUES (
    'officer_fxu', 
    v_fxu_cost, 
    v_user_id, 
    'Officer: ' || v_officer.name || ' (' || p_duration || ')'
  );

  v_new_expiry := NOW() + (v_days_to_add || ' days')::interval;

  DELETE FROM user_officers 
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id;

  INSERT INTO user_officers (user_id, officer_type_id, expires_at)
  VALUES (v_user_id, p_officer_type_id, v_new_expiry);

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expiry,
    'fxu_spent', v_fxu_cost
  );
END;
$$;
