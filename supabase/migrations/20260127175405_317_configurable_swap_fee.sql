/*
  # Configurable Swap Fee

  ## Changes
  - Add swap_fee_percent column to wallet_config (default 1%)
  - Update swap functions to use configurable fee instead of hardcoded 0.3%

  ## Notes
  - Admin can now modify the swap fee from the admin panel
  - Default fee changed from 0.3% to 1%
*/

ALTER TABLE wallet_config ADD COLUMN IF NOT EXISTS swap_fee_percent numeric DEFAULT 1.0;

UPDATE wallet_config SET swap_fee_percent = 1.0 WHERE id = 1;

CREATE OR REPLACE FUNCTION public.swap_usdt_to_fxu(p_usdt_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_usdt_balance numeric;
  v_config wallet_config%ROWTYPE;
  v_fxu_amount numeric;
  v_fee_rate numeric;
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

  v_fee_rate := COALESCE(v_config.swap_fee_percent, 1.0) / 100;
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
$function$;

CREATE OR REPLACE FUNCTION public.swap_fxu_to_usdt(p_fxu_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_fxu_balance numeric;
  v_config wallet_config%ROWTYPE;
  v_usdt_amount numeric;
  v_fee_rate numeric;
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

  v_fee_rate := COALESCE(v_config.swap_fee_percent, 1.0) / 100;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_swap_rate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config wallet_config%ROWTYPE;
BEGIN
  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  RETURN jsonb_build_object(
    'rate_fxu_per_usdt', v_config.swap_rate_fxu_per_usdt,
    'is_swap_enabled', v_config.is_swap_enabled,
    'min_fxu', v_config.swap_min_fxu,
    'min_usdt', v_config.swap_min_usdt,
    'fee_percent', COALESCE(v_config.swap_fee_percent, 1.0)
  );
END;
$function$;
