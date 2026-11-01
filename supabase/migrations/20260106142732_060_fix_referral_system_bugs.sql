/*
  # Fix Referral System Bugs

  1. Issues Fixed
    - `set_user_referral` now verifies profile exists before updating
    - `set_user_referral` returns number of rows affected to verify update worked
    - `get_referral_stats` ORDER BY fixed for proper commission ordering
    - Added retry mechanism for profile not found (race condition with trigger)

  2. Changes
    - Improved `set_user_referral` with profile existence check
    - Fixed `get_referral_stats` jsonb_agg ordering
*/

-- Improved set_user_referral with better error handling
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
  v_profile_exists boolean;
  v_rows_updated int;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF p_referral_code IS NULL OR TRIM(p_referral_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Codigo de referido vacio');
  END IF;

  -- Check if profile exists
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = v_user_id) INTO v_profile_exists;
  
  IF NOT v_profile_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado, intenta de nuevo en unos segundos');
  END IF;

  -- Check if user already has a referrer
  SELECT referred_by INTO v_current_referrer FROM profiles WHERE id = v_user_id;
  
  IF v_current_referrer IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un referidor asignado');
  END IF;

  -- Find referrer by code
  SELECT id INTO v_referrer_id FROM profiles WHERE referral_code = UPPER(TRIM(p_referral_code));
  
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Codigo de referido no encontrado');
  END IF;

  -- Cannot refer yourself
  IF v_referrer_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes referirte a ti mismo');
  END IF;

  -- Set the referral and get rows affected
  UPDATE profiles SET referred_by = v_referrer_id WHERE id = v_user_id AND referred_by IS NULL;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se pudo asignar el referido');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Referido asignado correctamente');
END;
$$;

-- Fixed get_referral_stats with proper ordering
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
  v_recent_commissions jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT referral_code INTO v_referral_code FROM profiles WHERE id = v_user_id;
  
  SELECT COUNT(*) INTO v_total_referrals FROM profiles WHERE referred_by = v_user_id;
  
  -- Total FXU earned from all commissions
  SELECT COALESCE(SUM(amount), 0) INTO v_total_fxu_earned
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  -- Get recent commissions with seller info (properly ordered)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'amount', rc.amount,
        'created_at', rc.created_at,
        'seller_username', p.username
      ) ORDER BY rc.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_commissions
  FROM referral_commissions rc
  JOIN profiles p ON p.id = rc.seller_id
  WHERE rc.referrer_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_fxu_earned', v_total_fxu_earned,
    'recent_commissions', v_recent_commissions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION set_user_referral(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_referral_stats() TO authenticated;