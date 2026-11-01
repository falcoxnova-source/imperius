/*
  # Fix Purchase Officer with FXU - Security Bypass

  1. Problem
    - The function purchase_officer_with_fxu tries to update fxu_balance directly
    - But there's a security trigger (protect_fxu_balance) that blocks direct updates
    - The trigger only allows updates if fxu.allow_update_9x7k2m = 'true'

  2. Solution
    - Set the special config variable before updating fxu_balance
    - Reset it after the update for safety
*/

CREATE OR REPLACE FUNCTION purchase_officer_with_fxu(p_officer_type_id uuid, p_duration text)
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

  -- Get officer type
  SELECT * INTO v_officer FROM officer_types WHERE id = p_officer_type_id;
  IF v_officer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer type not found');
  END IF;

  -- Get FXU cost based on duration
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

  -- Get current FXU balance
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  -- Enable FXU balance modification (bypass security trigger)
  -- This is safe because we're inside a SECURITY DEFINER function
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Deduct FXU
  UPDATE profiles 
  SET fxu_balance = fxu_balance - v_fxu_cost 
  WHERE id = v_user_id;

  -- Reset the flag for safety
  PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

  -- Track revenue for admin dashboard
  INSERT INTO admin_revenue (source, amount, user_id, details)
  VALUES ('officer_fxu', v_fxu_cost, v_user_id, jsonb_build_object(
    'officer_type_id', p_officer_type_id,
    'officer_name', v_officer.name,
    'duration', p_duration,
    'fxu_cost', v_fxu_cost
  ));

  -- Check for existing active officer
  SELECT * INTO v_existing_officer
  FROM user_officers
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id
    AND expires_at > NOW();

  IF v_existing_officer IS NOT NULL THEN
    -- Extend existing officer
    v_new_expiry := v_existing_officer.expires_at + (v_days_to_add || ' days')::interval;
    
    UPDATE user_officers
    SET expires_at = v_new_expiry
    WHERE id = v_existing_officer.id;
  ELSE
    -- Create new officer assignment
    v_new_expiry := NOW() + (v_days_to_add || ' days')::interval;
    
    INSERT INTO user_officers (user_id, officer_type_id, expires_at)
    VALUES (v_user_id, p_officer_type_id, v_new_expiry);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expiry,
    'fxu_spent', v_fxu_cost
  );
END;
$$;
