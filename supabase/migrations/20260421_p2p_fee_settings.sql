-- =====================================================================
-- P2P Marketplace - Fee Config + Fee Distribution + BUY offers
-- =====================================================================
-- Fee 1% (configurable) sobre el monto de la orden, descontado del asset
-- Split configurable: admin / referrer del vendedor / pool (jackpot)
-- Si el vendedor NO tiene referrer, el % del referrer se suma al pool
-- Todo editable desde admin vía update_fee_settings() extendida
-- =====================================================================

-- 1) Seed de claves en game_settings
INSERT INTO game_settings (key, value, description)
VALUES ('p2p_fee_percent', '1', 'Fee P2P total sobre cada orden (%)')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO game_settings (key, value, description)
VALUES ('p2p_fee_admin_share', '50', 'Porcentaje del fee P2P que va al admin')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO game_settings (key, value, description)
VALUES ('p2p_fee_referrer_share', '5', 'Porcentaje del fee P2P que va al referrer del vendedor')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO game_settings (key, value, description)
VALUES ('p2p_fee_pool_share', '45', 'Porcentaje del fee P2P que va al pool/jackpot')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- 2) Lector global (uso del front/otras funciones)
CREATE OR REPLACE FUNCTION get_p2p_fee_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric;
  v_admin numeric;
  v_ref numeric;
  v_pool numeric;
BEGIN
  SELECT COALESCE(value::numeric, 1)  INTO v_total FROM game_settings WHERE key = 'p2p_fee_percent';
  SELECT COALESCE(value::numeric, 50) INTO v_admin FROM game_settings WHERE key = 'p2p_fee_admin_share';
  SELECT COALESCE(value::numeric, 5)  INTO v_ref   FROM game_settings WHERE key = 'p2p_fee_referrer_share';
  SELECT COALESCE(value::numeric, 45) INTO v_pool  FROM game_settings WHERE key = 'p2p_fee_pool_share';

  RETURN jsonb_build_object(
    'p2p_fee_percent', COALESCE(v_total, 1),
    'p2p_fee_admin_share', COALESCE(v_admin, 50),
    'p2p_fee_referrer_share', COALESCE(v_ref, 5),
    'p2p_fee_pool_share', COALESCE(v_pool, 45)
  );
END;
$$;

-- 3) update_fee_settings extendido (mantiene compatibilidad con el llamado actual)
CREATE OR REPLACE FUNCTION update_fee_settings(
  p_market_fee numeric DEFAULT NULL,
  p_referral_commission numeric DEFAULT NULL,
  p_p2p_fee numeric DEFAULT NULL,
  p_p2p_fee_admin_share numeric DEFAULT NULL,
  p_p2p_fee_referrer_share numeric DEFAULT NULL,
  p_p2p_fee_pool_share numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_sum numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

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

  IF p_p2p_fee IS NOT NULL THEN
    IF p_p2p_fee < 0 OR p_p2p_fee > 20 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Fee P2P debe estar entre 0% y 20%');
    END IF;
    UPDATE game_settings SET value = p_p2p_fee::text, updated_at = now() WHERE key = 'p2p_fee_percent';
  END IF;

  -- Validar suma de splits si se pasan
  IF p_p2p_fee_admin_share IS NOT NULL OR p_p2p_fee_referrer_share IS NOT NULL OR p_p2p_fee_pool_share IS NOT NULL THEN
    v_sum := COALESCE(p_p2p_fee_admin_share,
                      (SELECT value::numeric FROM game_settings WHERE key = 'p2p_fee_admin_share'))
           + COALESCE(p_p2p_fee_referrer_share,
                      (SELECT value::numeric FROM game_settings WHERE key = 'p2p_fee_referrer_share'))
           + COALESCE(p_p2p_fee_pool_share,
                      (SELECT value::numeric FROM game_settings WHERE key = 'p2p_fee_pool_share'));

    IF ABS(v_sum - 100) > 0.01 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Los splits del fee P2P deben sumar 100');
    END IF;
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

  RETURN jsonb_build_object('success', true, 'message', 'Configuracion actualizada');
END;
$$;

-- 4) Extender get_fee_settings para que devuelva también la config P2P
CREATE OR REPLACE FUNCTION get_fee_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_market numeric;
  v_ref numeric;
  v_exp numeric;
  v_p2p jsonb;
BEGIN
  SELECT COALESCE(value::numeric, 10) INTO v_market FROM game_settings WHERE key = 'market_fee_percent';
  SELECT COALESCE(value::numeric, 5)  INTO v_ref    FROM game_settings WHERE key = 'referral_commission_percent';
  SELECT COALESCE(value::numeric, 1000) INTO v_exp  FROM game_settings WHERE key = 'expedition_extra_fee_fxu';

  v_p2p := get_p2p_fee_settings();

  RETURN jsonb_build_object(
    'market_fee_percent', COALESCE(v_market, 10),
    'referral_commission_percent', COALESCE(v_ref, 5),
    'expedition_extra_fee_fxu', COALESCE(v_exp, 1000),
    'p2p_fee_percent', (v_p2p->>'p2p_fee_percent')::numeric,
    'p2p_fee_admin_share', (v_p2p->>'p2p_fee_admin_share')::numeric,
    'p2p_fee_referrer_share', (v_p2p->>'p2p_fee_referrer_share')::numeric,
    'p2p_fee_pool_share', (v_p2p->>'p2p_fee_pool_share')::numeric
  );
END;
$$;
