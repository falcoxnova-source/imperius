/*
  # Fix Swap Functions - Add FXU Update Context
  
  ## Problem
  The swap functions (swap_fxu_to_usdt and swap_usdt_to_fxu) were blocked by 
  the fxu_balance protection trigger because they didn't set the required
  session context variable.
  
  ## Solution
  Update both swap functions to set the 'app.fxu_update_allowed' context
  before updating the profiles table, similar to other functions like
  request_withdrawal and cancel_withdrawal.
  
  ## Changes
  - swap_fxu_to_usdt: Added set_config call before UPDATE
  - swap_usdt_to_fxu: Added set_config call before UPDATE
*/

-- Function to swap FXU to USDT (with context fix)
CREATE OR REPLACE FUNCTION swap_fxu_to_usdt(p_fxu_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fxu_balance numeric;
  v_config wallet_config%ROWTYPE;
  v_usdt_amount numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get config
  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  -- Check if swap is enabled
  IF NOT v_config.is_swap_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Swap is currently disabled');
  END IF;

  -- Check minimum amount
  IF p_fxu_amount < v_config.swap_min_fxu THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum swap amount is ' || v_config.swap_min_fxu || ' FXU');
  END IF;

  -- Get user FXU balance
  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = v_user_id;

  IF v_fxu_balance < p_fxu_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  -- Calculate USDT amount (10000 FXU = 1 USDT)
  v_usdt_amount := p_fxu_amount / v_config.swap_rate_fxu_per_usdt;

  -- Set context to allow fxu_balance update (REQUIRED for security trigger)
  PERFORM set_config('app.fxu_update_allowed', 'swap_fxu_to_usdt', true);

  -- Perform swap
  UPDATE profiles 
  SET fxu_balance = fxu_balance - p_fxu_amount,
      usdt_balance = usdt_balance + v_usdt_amount,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'fxu_spent', p_fxu_amount,
    'usdt_received', v_usdt_amount,
    'rate', v_config.swap_rate_fxu_per_usdt,
    'message', 'Successfully swapped ' || p_fxu_amount || ' FXU for ' || v_usdt_amount || ' USDT'
  );
END;
$$;

-- Function to swap USDT to FXU (with context fix)
CREATE OR REPLACE FUNCTION swap_usdt_to_fxu(p_usdt_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_usdt_balance numeric;
  v_config wallet_config%ROWTYPE;
  v_fxu_amount numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get config
  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  -- Check if swap is enabled
  IF NOT v_config.is_swap_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Swap is currently disabled');
  END IF;

  -- Check minimum amount
  IF p_usdt_amount < v_config.swap_min_usdt THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum swap amount is ' || v_config.swap_min_usdt || ' USDT');
  END IF;

  -- Get user USDT balance
  SELECT usdt_balance INTO v_usdt_balance FROM profiles WHERE id = v_user_id;

  IF v_usdt_balance < p_usdt_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient USDT balance');
  END IF;

  -- Calculate FXU amount (1 USDT = 10000 FXU)
  v_fxu_amount := p_usdt_amount * v_config.swap_rate_fxu_per_usdt;

  -- Set context to allow fxu_balance update (REQUIRED for security trigger)
  PERFORM set_config('app.fxu_update_allowed', 'swap_usdt_to_fxu', true);

  -- Perform swap
  UPDATE profiles 
  SET usdt_balance = usdt_balance - p_usdt_amount,
      fxu_balance = fxu_balance + v_fxu_amount,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'usdt_spent', p_usdt_amount,
    'fxu_received', v_fxu_amount,
    'rate', v_config.swap_rate_fxu_per_usdt,
    'message', 'Successfully swapped ' || p_usdt_amount || ' USDT for ' || v_fxu_amount || ' FXU'
  );
END;
$$;
