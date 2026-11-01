-- Update get_fee_settings to return new 4-3-3 share keys
-- Update update_fee_settings to accept and save them
CREATE OR REPLACE FUNCTION get_fee_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_market numeric;
  v_ref numeric;
  v_exp numeric;
  v_admin_share numeric;
  v_pool_share numeric;
  v_referral_share numeric;
  v_p2p jsonb;
BEGIN
  SELECT COALESCE(value::numeric, 10) INTO v_market FROM game_settings WHERE key = 'market_fee_percent';
  SELECT COALESCE(value::numeric, 30)  INTO v_ref    FROM game_settings WHERE key = 'referral_commission_percent';
  SELECT COALESCE(value::numeric, 1000) INTO v_exp  FROM game_settings WHERE key = 'expedition_extra_fee_fxu';
  
  -- New 4-3-3 split keys
  SELECT COALESCE(value::numeric, 40) INTO v_admin_share FROM game_settings WHERE key = 'market_fee_admin_share';
  SELECT COALESCE(value::numeric, 30) INTO v_pool_share FROM game_settings WHERE key = 'market_fee_pool_share';
  SELECT COALESCE(value::numeric, 30) INTO v_referral_share FROM game_settings WHERE key = 'market_fee_referral_share';

  v_p2p := get_p2p_fee_settings();

  RETURN jsonb_build_object(
    'market_fee_percent', COALESCE(v_market, 10),
    'referral_commission_percent', COALESCE(v_ref, 30),
    'expedition_extra_fee_fxu', COALESCE(v_exp, 1000),
    'market_fee_admin_share', COALESCE(v_admin_share, 40),
    'market_fee_pool_share', COALESCE(v_pool_share, 30),
    'market_fee_referral_share', COALESCE(v_referral_share, 30),
    'p2p_fee_percent', (v_p2p->>'p2p_fee_percent')::numeric,
    'p2p_fee_admin_share', (v_p2p->>'p2p_fee_admin_share')::numeric,
    'p2p_fee_referrer_share', (v_p2p->>'p2p_fee_referrer_share')::numeric,
    'p2p_fee_pool_share', (v_p2p->>'p2p_fee_pool_share')::numeric
  );
END;
$$;

-- Update update_fee_settings to support new share params
CREATE OR REPLACE FUNCTION update_fee_settings(
  p_market_fee numeric DEFAULT NULL,
  p_referral_commission numeric DEFAULT NULL,
  p_p2p_fee numeric DEFAULT NULL,
  p_p2p_fee_admin_share numeric DEFAULT NULL,
  p_p2p_fee_referrer_share numeric DEFAULT NULL,
  p_p2p_fee_pool_share numeric DEFAULT NULL,
  p_market_fee_admin_share numeric DEFAULT NULL,
  p_market_fee_pool_share numeric DEFAULT NULL,
  p_market_fee_referral_share numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  -- Validate ranges
  IF p_market_fee IS NOT NULL THEN
    IF p_market_fee < 0 OR p_market_fee > 50 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Fee del mercado debe estar entre 0% y 50%');
    END IF;
    UPDATE game_settings SET value = p_market_fee::text, updated_at = now() WHERE key = 'market_fee_percent';
  END IF;
  
  IF p_referral_commission IS NOT NULL THEN
    IF p_referral_commission < 0 OR p_referral_commission > 50 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Comision de referidos debe estar entre 0% y 50%');
    END IF;
    UPDATE game_settings SET value = p_referral_commission::text, updated_at = now() WHERE key = 'referral_commission_percent';
  END IF;

  -- P2P fee settings
  IF p_p2p_fee IS NOT NULL THEN
    IF p_p2p_fee < 0 OR p_p2p_fee > 20 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Fee P2P invalido');
    END IF;
    UPDATE game_settings SET value = p_p2p_fee::text, updated_at = now() WHERE key = 'p2p_fee_percent';
  END IF;

  IF p_p2p_fee_admin_share IS NOT NULL THEN
    UPDATE game_settings SET value = p_p2p_fee_admin_share::text, updated_at = now() WHERE key = 'p2p_fee_admin_share';
  END IF;

  IF p_p2p_fee_referrer_share IS NOT NULL THEN
    UPDATE game_settings SET value = p_p2p_fee_referrer_share::text, updated_at = now() WHERE key = 'p2p_fee_referrer_share';
  END IF;

  IF p_p2p_fee_pool_share IS NOT NULL THEN
    UPDATE game_settings SET value = p_p2p_fee_pool_share::text, updated_at = now() WHERE key = 'p2p_fee_pool_share';
  END IF;

  -- NEW: 4-3-3 market fee split shares
  IF p_market_fee_admin_share IS NOT NULL THEN
    IF p_market_fee_admin_share < 0 OR p_market_fee_admin_share > 100 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Share de admin debe estar entre 0% y 100%');
    END IF;
    UPDATE game_settings SET value = p_market_fee_admin_share::text, updated_at = now() WHERE key = 'market_fee_admin_share';
  END IF;

  IF p_market_fee_pool_share IS NOT NULL THEN
    IF p_market_fee_pool_share < 0 OR p_market_fee_pool_share > 100 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Share de pool debe estar entre 0% y 100%');
    END IF;
    UPDATE game_settings SET value = p_market_fee_pool_share::text, updated_at = now() WHERE key = 'market_fee_pool_share';
  END IF;

  IF p_market_fee_referral_share IS NOT NULL THEN
    IF p_market_fee_referral_share < 0 OR p_market_fee_referral_share > 100 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Share de referidos debe estar entre 0% y 100%');
    END IF;
    UPDATE game_settings SET value = p_market_fee_referral_share::text, updated_at = now() WHERE key = 'market_fee_referral_share';
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Configuracion actualizada');
END;
$$;
