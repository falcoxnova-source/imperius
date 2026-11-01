/*
  # Clean Referral System

  1. Overview
    - Referral code can ONLY be applied during registration (not after)
    - NO bonus for just registering a referral
    - Commissions ONLY come from:
      a) 5% of market sales (when referral sells something)
      b) 5% of FXU deposits (when referral deposits tokens)
    - The 5% is given by the system, NOT taken from the referral

  2. Changes
    - Restrict `set_user_referral` to only work within 5 minutes of account creation
    - Add `deposit_fxu` function with referral commission
    - Update commission tracking

  3. Commission Rules
    - Market: Referrer gets 5% of sale price (paid by system)
    - Deposit: Referrer gets 5% of deposit amount (paid by system)
    - Commissions are always in FXU
*/

-- Restrict set_user_referral to only work shortly after registration
CREATE OR REPLACE FUNCTION set_user_referral(p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_referrer_id uuid;
  v_current_referrer uuid;
  v_profile_record record;
  v_rows_updated int;
  v_time_since_creation interval;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF p_referral_code IS NULL OR TRIM(p_referral_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Codigo de referido vacio');
  END IF;

  SELECT * INTO v_profile_record FROM profiles WHERE id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  IF v_profile_record.referred_by IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un referidor asignado');
  END IF;

  v_time_since_creation := now() - v_profile_record.created_at;
  IF v_time_since_creation > interval '5 minutes' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El codigo de referido solo puede aplicarse durante el registro');
  END IF;

  SELECT id INTO v_referrer_id FROM profiles WHERE referral_code = UPPER(TRIM(p_referral_code));
  
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Codigo de referido no encontrado');
  END IF;

  IF v_referrer_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes referirte a ti mismo');
  END IF;

  UPDATE profiles SET referred_by = v_referrer_id WHERE id = v_user_id AND referred_by IS NULL;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se pudo asignar el referido');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Referido asignado correctamente');
END;
$$;

-- Function to deposit FXU with referral commission
CREATE OR REPLACE FUNCTION deposit_fxu(p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_referrer_id uuid;
  v_commission_amount bigint;
  v_commission_percent numeric := 5;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad invalida');
  END IF;

  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + p_amount
  WHERE id = v_user_id;

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_user_id;
  
  IF v_referrer_id IS NOT NULL THEN
    v_commission_amount := FLOOR(p_amount * v_commission_percent / 100);
    
    IF v_commission_amount >= 1 THEN
      UPDATE profiles
      SET fxu_balance = COALESCE(fxu_balance, 0) + v_commission_amount
      WHERE id = v_referrer_id;
      
      INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount)
      VALUES (v_referrer_id, v_user_id, NULL, 'deposit', 'fxu', v_commission_amount);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Deposito realizado exitosamente',
    'amount', p_amount,
    'referral_commission', COALESCE(v_commission_amount, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION deposit_fxu(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION set_user_referral(text) TO authenticated;

-- Update get_referral_stats to include deposit commissions
CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_referral_code text;
  v_total_referrals int;
  v_total_fxu_earned bigint;
  v_market_commissions bigint;
  v_deposit_commissions bigint;
  v_recent_commissions jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT referral_code INTO v_referral_code FROM profiles WHERE id = v_user_id;
  SELECT COUNT(*) INTO v_total_referrals FROM profiles WHERE referred_by = v_user_id;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_total_fxu_earned
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_market_commissions
  FROM referral_commissions
  WHERE referrer_id = v_user_id AND commission_type = 'fxu';

  SELECT COALESCE(SUM(amount), 0) INTO v_deposit_commissions
  FROM referral_commissions
  WHERE referrer_id = v_user_id AND commission_type = 'deposit';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'amount', rc.amount,
        'commission_type', rc.commission_type,
        'created_at', rc.created_at,
        'username', p.username
      ) ORDER BY rc.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_commissions
  FROM referral_commissions rc
  JOIN profiles p ON p.id = rc.seller_id
  WHERE rc.referrer_id = v_user_id
  LIMIT 50;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_fxu_earned', v_total_fxu_earned,
    'market_commissions', v_market_commissions,
    'deposit_commissions', v_deposit_commissions,
    'recent_commissions', v_recent_commissions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_stats() TO authenticated;
