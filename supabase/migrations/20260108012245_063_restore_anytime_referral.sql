/*
  # Restore Anytime Referral Application

  1. Overview
    - Allow referral codes to be applied at any time (not just during registration)
    - Users can only apply ONE referral code ever (cannot change it)
    - Commissions still work the same way:
      * 5% of market sales (paid by system)
      * 5% of FXU deposits (paid by system)

  2. Changes
    - Remove 5-minute time restriction from set_user_referral
    - Keep the rule that you can only set it once
    - Keep all commission logic unchanged
*/

-- Remove time restriction, allow applying referral code anytime
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

  -- Check if user already has a referrer (can only set once)
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

GRANT EXECUTE ON FUNCTION set_user_referral(text) TO authenticated;
