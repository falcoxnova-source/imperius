-- ============================================================================
-- 20260714_referral_stats_display.sql
-- Arregla la VISUALIZACION de comisiones de referido.
--
-- Problema: get_referral_stats solo sumaba total_fxu cuando commission_type='fxu',
-- pero TODAS las comisiones (mercado, p2p, retiro, misiones premium, aceleraciones,
-- oficiales, construccion instantanea, etc.) usan tipos como 'market_referral',
-- 'withdrawal_referral', '<source>_referral'. Resultado: el panel de referido
-- mostraba 0 aunque el dinero SI se acredita al referidor.
--
-- Cambios:
--  (1) request_withdrawal_usdt: etiqueta la comision con resource_type='usdt'
--      para poder separarla de TUNG en las estadisticas.
--  (2) get_referral_stats: suma correctamente TODAS las comisiones FXU/TUNG,
--      agrega total_usdt, arregla el monto de las comisiones recientes
--      (COALESCE(fxu_amount, amount)) y limita realmente a 20 filas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- (1) request_withdrawal_usdt: etiquetar la comision de referido como USDT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal_usdt(p_amount numeric, p_wallet_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_usdt_balance numeric;
  v_daily_total numeric;
  v_config wallet_config%ROWTYPE;
  v_fee numeric;
  v_fee_flat numeric;
  v_fee_mode text;
  v_net_amount numeric;
  v_tx_id uuid;
  v_admin_id uuid;
  v_referrer_id uuid;
  v_referrer_share numeric;
  v_admin_share numeric;
  v_referral_pct numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  IF NOT v_config.is_usdt_withdrawals_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'USDT withdrawals are currently disabled');
  END IF;

  IF COALESCE(v_config.usdt_min_deposit, 0) > 0 AND p_amount < v_config.usdt_min_deposit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount below minimum: ' || v_config.usdt_min_deposit);
  END IF;

  SELECT usdt_balance INTO v_usdt_balance FROM profiles WHERE id = v_user_id;

  IF v_usdt_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient USDT balance');
  END IF;

  IF COALESCE(v_config.usdt_max_withdrawal_daily, 0) > 0 THEN
    v_daily_total := get_daily_usdt_withdrawal_total(v_user_id);
    IF v_daily_total + p_amount > v_config.usdt_max_withdrawal_daily THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Daily USDT withdrawal limit exceeded. Remaining: ' || (v_config.usdt_max_withdrawal_daily - v_daily_total)
      );
    END IF;
  END IF;

  SELECT COALESCE(value, 'flat') INTO v_fee_mode FROM game_settings WHERE key = 'withdrawal_fee_mode';
  v_fee_mode := COALESCE(v_fee_mode, 'flat');

  IF v_fee_mode = 'percent' THEN
    v_fee := p_amount * (COALESCE(v_config.usdt_withdrawal_fee_percent, 0) / 100);
  ELSE
    -- Fee plano en USDT
    SELECT COALESCE(value::numeric, 1) INTO v_fee_flat FROM game_settings WHERE key = 'usdt_withdrawal_fee_flat';
    v_fee := COALESCE(v_fee_flat, 1);
  END IF;

  IF v_fee < 0 THEN v_fee := 0; END IF;

  IF v_fee >= p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'El monto es menor que el fee de retiro. Retira una cantidad mayor.');
  END IF;

  v_net_amount := p_amount - v_fee;

  SELECT referred_by INTO v_referrer_id
  FROM profiles
  WHERE id = v_user_id;

  IF v_referrer_id IS NOT NULL THEN
    SELECT COALESCE(value::numeric, 30) INTO v_referral_pct FROM game_settings WHERE key = 'withdrawal_fee_referral_share';
    v_referrer_share := v_fee * COALESCE(v_referral_pct, 30) / 100;
    v_admin_share := v_fee - v_referrer_share;
  ELSE
    v_referrer_share := 0;
    v_admin_share := v_fee;
  END IF;

  UPDATE profiles
  SET usdt_balance = usdt_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_share > 0 THEN
    UPDATE profiles
    SET usdt_balance = usdt_balance + v_admin_share
    WHERE id = v_admin_id;
  END IF;

  IF v_referrer_share > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles
    SET usdt_balance = usdt_balance + v_referrer_share,
        updated_at = now()
    WHERE id = v_referrer_id;

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount, resource_type)
    VALUES (v_referrer_id, v_user_id, NULL, 'withdrawal_referral', v_referrer_share, 'usdt');

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_referrer_id,
      v_user_id,
      'Comision de referido por retiro USDT',
      'Has recibido ' || ROUND(v_referrer_share, 2) || ' USDT como comision por el retiro de tu referido.',
      'system'
    );
  END IF;

  INSERT INTO wallet_transactions (
    user_id, tx_type, token_type, amount, fxu_amount, wallet_address, status
  ) VALUES (
    v_user_id, 'withdrawal', 'USDT', v_net_amount, p_amount, p_wallet_address, 'pending'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'amount', v_net_amount,
    'fee', v_fee,
    'message', 'USDT withdrawal request submitted'
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- (2) get_referral_stats: sumar TODAS las comisiones correctamente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_referral_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_referral_code text;
  v_total_referrals int;
  v_total_fxu numeric;
  v_total_usdt numeric;
  v_total_metal numeric;
  v_total_crystal numeric;
  v_total_deuterium numeric;
  v_recent_commissions jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT referral_code INTO v_referral_code FROM profiles WHERE id = v_user_id;

  IF v_referral_code IS NULL THEN
    v_referral_code := UPPER(SUBSTRING(v_user_id::text, 1, 8));
    UPDATE profiles SET referral_code = v_referral_code WHERE id = v_user_id;
  END IF;

  SELECT COUNT(*) INTO v_total_referrals FROM profiles WHERE referred_by = v_user_id;

  -- Totales por moneda:
  --  FXU/TUNG  -> filas con resource_type NULL o 'fxu' (misiones, aceleraciones,
  --              oficiales, construccion instantanea, mercado FXU, p2p FXU,
  --              retiro TUNG, comisiones legacy 'fxu'). Se usa fxu_amount.
  --  USDT      -> filas con resource_type = 'usdt' (p2p USDT, retiro USDT).
  --  Recursos  -> filas 'resource' con resource_type metal/crystal/deuterium (amount).
  SELECT
    COALESCE(SUM(CASE WHEN COALESCE(resource_type, 'fxu') = 'fxu' THEN COALESCE(fxu_amount, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN resource_type = 'usdt' THEN COALESCE(fxu_amount, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'metal' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'crystal' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'deuterium' THEN amount ELSE 0 END), 0)
  INTO v_total_fxu, v_total_usdt, v_total_metal, v_total_crystal, v_total_deuterium
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  -- Ultimas 20 comisiones (limite real via subconsulta).
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'amount', x.disp_amount,
        'commission_type', x.commission_type,
        'resource_type', x.resource_type,
        'created_at', x.created_at,
        'seller_username', x.seller_username
      ) ORDER BY x.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_commissions
  FROM (
    SELECT
      rc.id,
      COALESCE(rc.fxu_amount, rc.amount) AS disp_amount,
      rc.commission_type,
      rc.resource_type,
      rc.created_at,
      p.username AS seller_username
    FROM referral_commissions rc
    JOIN profiles p ON p.id = rc.seller_id
    WHERE rc.referrer_id = v_user_id
    ORDER BY rc.created_at DESC
    LIMIT 20
  ) x;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_fxu', v_total_fxu,
    'total_usdt', v_total_usdt,
    'total_metal', v_total_metal,
    'total_crystal', v_total_crystal,
    'total_deuterium', v_total_deuterium,
    'recent_commissions', v_recent_commissions
  );
END;
$function$;

COMMIT;
