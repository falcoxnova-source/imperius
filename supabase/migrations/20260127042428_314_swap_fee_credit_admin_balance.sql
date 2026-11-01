/*
  # Credit admin balance on swap fees

  1. Changes
    - Updates swap_fxu_to_usdt to credit admin balance with the FXU fee
    - Updates swap_usdt_to_fxu to credit admin balance with the FXU fee

  2. Notes
    - Follows the same pattern as other fee collection functions
    - Fee is credited to admin in FXU for consistency
*/

-- Actualizar swap_fxu_to_usdt con credito al admin
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
  v_fee_rate numeric := 0.003;
  v_fee_usdt numeric;
  v_fee_fxu numeric;
  v_usdt_after_fee numeric;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  IF NOT v_config.is_swap_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Swap is currently disabled');
  END IF;

  IF p_fxu_amount < v_config.swap_min_fxu THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum swap amount is ' || v_config.swap_min_fxu || ' FXU');
  END IF;

  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = v_user_id;

  IF v_fxu_balance < p_fxu_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  v_usdt_amount := p_fxu_amount / v_config.swap_rate_fxu_per_usdt;
  v_fee_usdt := v_usdt_amount * v_fee_rate;
  v_usdt_after_fee := v_usdt_amount - v_fee_usdt;
  v_fee_fxu := v_fee_usdt * v_config.swap_rate_fxu_per_usdt;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles 
  SET fxu_balance = fxu_balance - p_fxu_amount,
      usdt_balance = usdt_balance + v_usdt_after_fee,
      updated_at = now()
  WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_fee_fxu > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fee_fxu WHERE id = v_admin_id;
  END IF;

  INSERT INTO admin_revenue (revenue_type, amount, description, related_user_id)
  VALUES (
    'swap_fee',
    v_fee_fxu,
    format('Swap fee: %s FXU -> %s USDT (fee: %s USDT = %s FXU)', 
           p_fxu_amount, round(v_usdt_after_fee, 6), round(v_fee_usdt, 6), round(v_fee_fxu, 2)),
    v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'fxu_spent', p_fxu_amount,
    'usdt_received', round(v_usdt_after_fee, 6),
    'fee_usdt', round(v_fee_usdt, 6),
    'fee_percent', v_fee_rate * 100,
    'rate', v_config.swap_rate_fxu_per_usdt,
    'message', 'Successfully swapped ' || p_fxu_amount || ' FXU for ' || round(v_usdt_after_fee, 6) || ' USDT (fee: ' || round(v_fee_usdt, 6) || ' USDT)'
  );
END;
$$;

-- Actualizar swap_usdt_to_fxu con credito al admin
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
  v_fee_rate numeric := 0.003;
  v_fee_fxu numeric;
  v_fxu_after_fee numeric;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  IF NOT v_config.is_swap_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Swap is currently disabled');
  END IF;

  IF p_usdt_amount < v_config.swap_min_usdt THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum swap amount is ' || v_config.swap_min_usdt || ' USDT');
  END IF;

  SELECT usdt_balance INTO v_usdt_balance FROM profiles WHERE id = v_user_id;

  IF v_usdt_balance < p_usdt_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient USDT balance');
  END IF;

  v_fxu_amount := p_usdt_amount * v_config.swap_rate_fxu_per_usdt;
  v_fee_fxu := v_fxu_amount * v_fee_rate;
  v_fxu_after_fee := v_fxu_amount - v_fee_fxu;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles 
  SET usdt_balance = usdt_balance - p_usdt_amount,
      fxu_balance = fxu_balance + v_fxu_after_fee,
      updated_at = now()
  WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_fee_fxu > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fee_fxu WHERE id = v_admin_id;
  END IF;

  INSERT INTO admin_revenue (revenue_type, amount, description, related_user_id)
  VALUES (
    'swap_fee',
    v_fee_fxu,
    format('Swap fee: %s USDT -> %s FXU (fee: %s FXU)', 
           p_usdt_amount, round(v_fxu_after_fee, 2), round(v_fee_fxu, 2)),
    v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'usdt_spent', p_usdt_amount,
    'fxu_received', round(v_fxu_after_fee, 2),
    'fee_fxu', round(v_fee_fxu, 2),
    'fee_percent', v_fee_rate * 100,
    'rate', v_config.swap_rate_fxu_per_usdt,
    'message', 'Successfully swapped ' || p_usdt_amount || ' USDT for ' || round(v_fxu_after_fee, 2) || ' FXU (fee: ' || round(v_fee_fxu, 2) || ' FXU)'
  );
END;
$$;
