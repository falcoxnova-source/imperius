/*
  # Comision de Swap 1%

  1. Cambios
    - Actualiza swap_fxu_to_usdt para descontar 1% de comision
    - Actualiza swap_usdt_to_fxu para descontar 1% de comision
    - Registra las comisiones en admin_revenue como 'swap_fee'
    - Las comisiones se registran en FXU para el dashboard financiero

  2. Detalles
    - FXU -> USDT: comision se descuenta del USDT recibido, se registra equivalente en FXU
    - USDT -> FXU: comision se descuenta del FXU recibido, se registra en FXU
    - Tasa de comision: 1% (0.001)
*/

-- Actualizar swap_fxu_to_usdt con comision
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
  v_fee_rate numeric := 0.01; -- 1%
  v_fee_usdt numeric;
  v_fee_fxu numeric;
  v_usdt_after_fee numeric;
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

  -- Calculate USDT amount (10000 FXU = 1 USDT)
  v_usdt_amount := p_fxu_amount / v_config.swap_rate_fxu_per_usdt;
  
  -- Calculate fee (1% of USDT amount)
  v_fee_usdt := v_usdt_amount * v_fee_rate;
  v_usdt_after_fee := v_usdt_amount - v_fee_usdt;
  
  -- Convert fee to FXU for admin_revenue tracking
  v_fee_fxu := v_fee_usdt * v_config.swap_rate_fxu_per_usdt;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Perform swap (user receives USDT minus fee)
  UPDATE profiles 
  SET fxu_balance = fxu_balance - p_fxu_amount,
      usdt_balance = usdt_balance + v_usdt_after_fee,
      updated_at = now()
  WHERE id = v_user_id;

  -- Record fee in admin_revenue (in FXU for dashboard)
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

-- Actualizar swap_usdt_to_fxu con comision
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
  v_fee_rate numeric := 0.01; -- 1%
  v_fee_fxu numeric;
  v_fxu_after_fee numeric;
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

  -- Calculate FXU amount (1 USDT = 10000 FXU)
  v_fxu_amount := p_usdt_amount * v_config.swap_rate_fxu_per_usdt;
  
  -- Calculate fee (0.30% of FXU amount)
  v_fee_fxu := v_fxu_amount * v_fee_rate;
  v_fxu_after_fee := v_fxu_amount - v_fee_fxu;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Perform swap (user receives FXU minus fee)
  UPDATE profiles 
  SET usdt_balance = usdt_balance - p_usdt_amount,
      fxu_balance = fxu_balance + v_fxu_after_fee,
      updated_at = now()
  WHERE id = v_user_id;

  -- Record fee in admin_revenue (in FXU)
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
