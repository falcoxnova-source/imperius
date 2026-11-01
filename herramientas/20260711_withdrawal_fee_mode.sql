-- ============================================================================
-- Withdrawal fee MODE (flat vs percent) + enforce TUNG min/daily limits.
-- Admin picks the mode in Wallet Configuration; both TUNG and USDT respect it.
-- ============================================================================

-- 1) Fee-mode setting (default flat). Values: 'flat' | 'percent'.
INSERT INTO game_settings (key, value, description)
SELECT 'withdrawal_fee_mode', 'flat', 'Modo de comision de retiro: flat (monto fijo) o percent (porcentaje)'
WHERE NOT EXISTS (SELECT 1 FROM game_settings WHERE key = 'withdrawal_fee_mode');

-- 2) TUNG withdrawal: add mode + enforce min & daily limit.
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_wallet_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_current_balance numeric;
  v_fee_percent numeric;
  v_fee_amount numeric;
  v_net_amount numeric;
  v_is_admin boolean;
  v_transaction_id uuid;
  v_withdrawals_enabled boolean;
  v_admin_id uuid;
  v_telegram_id bigint;
  v_is_member boolean;
  v_referrer_id uuid;
  v_referrer_share numeric;
  v_admin_share numeric;
  v_pool_share numeric;
  v_admin_pct numeric;
  v_pool_pct numeric;
  v_referral_pct numeric;
  v_fee_usd numeric;
  v_price numeric;
  v_fee_mode text;
  v_min_amount numeric;
  v_daily_limit numeric;
  v_daily_total numeric;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT is_withdrawals_enabled, min_deposit, max_withdrawal_daily
    INTO v_withdrawals_enabled, v_min_amount, v_daily_limit
  FROM wallet_config WHERE id = 1;

  IF NOT v_withdrawals_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los retiros estan deshabilitados temporalmente');
  END IF;

  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;

  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes vincular tu cuenta de Telegram para poder retirar FXU. Ve a la seccion de Tareas para vincular tu Telegram.'
    );
  END IF;

  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';

  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes ser miembro del grupo de Telegram para poder retirar FXU. Ve a la seccion de Tareas para unirte al grupo.'
    );
  END IF;

  SELECT fxu_balance, is_admin INTO v_current_balance, v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto invalido');
  END IF;

  IF p_wallet_address IS NULL OR p_wallet_address = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Direccion de wallet requerida');
  END IF;

  -- Enforce configured limits (skip for admins). Only enforce when set (> 0).
  IF NOT v_is_admin THEN
    IF COALESCE(v_min_amount, 0) > 0 AND p_amount < v_min_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'El monto minimo de retiro es ' || v_min_amount || ' TUNG');
    END IF;

    IF COALESCE(v_daily_limit, 0) > 0 THEN
      v_daily_total := get_daily_withdrawal_total(v_user_id);
      IF v_daily_total + p_amount > v_daily_limit THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Limite diario de retiro superado. Disponible hoy: ' || GREATEST(0, v_daily_limit - v_daily_total) || ' TUNG'
        );
      END IF;
    END IF;
  END IF;

  IF p_amount > v_current_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente');
  END IF;

  IF v_is_admin THEN
    v_fee_percent := 0;
    v_fee_amount := 0;
    v_net_amount := p_amount;
    v_referrer_share := 0;
    v_admin_share := 0;
    v_pool_share := 0;
  ELSE
    SELECT COALESCE(value, 'flat') INTO v_fee_mode FROM game_settings WHERE key = 'withdrawal_fee_mode';
    v_fee_mode := COALESCE(v_fee_mode, 'flat');

    IF v_fee_mode = 'percent' THEN
      -- Comision porcentual sobre el monto retirado.
      SELECT withdrawal_fee_percent INTO v_fee_percent FROM wallet_config WHERE id = 1;
      v_fee_amount := p_amount * (COALESCE(v_fee_percent, 0) / 100);
    ELSE
      -- Fee plano: equivalente a X USD en TUNG al precio del momento.
      -- Si el precio no esta disponible, se usa el porcentaje configurado como respaldo.
      SELECT COALESCE(value::numeric, 1) INTO v_fee_usd FROM game_settings WHERE key = 'withdrawal_fee_usd';
      v_fee_usd := COALESCE(v_fee_usd, 1);
      v_price := get_live_tung_price_usd();

      IF v_price IS NOT NULL AND v_price > 0 THEN
        v_fee_amount := v_fee_usd / v_price;
      ELSE
        SELECT withdrawal_fee_percent INTO v_fee_percent FROM wallet_config WHERE id = 1;
        v_fee_amount := p_amount * (COALESCE(v_fee_percent, 10) / 100);
      END IF;
    END IF;

    IF v_fee_amount < 0 THEN v_fee_amount := 0; END IF;

    -- El fee no puede ser mayor o igual al monto retirado
    IF v_fee_amount >= p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'El monto es menor que el fee de retiro. Retira una cantidad mayor.');
    END IF;

    v_net_amount := p_amount - v_fee_amount;

    -- Reparto del fee: empresa / pool / referido (configurable, default 40/30/30)
    SELECT COALESCE(value::numeric, 40) INTO v_admin_pct FROM game_settings WHERE key = 'withdrawal_fee_admin_share';
    SELECT COALESCE(value::numeric, 30) INTO v_pool_pct FROM game_settings WHERE key = 'withdrawal_fee_pool_share';
    SELECT COALESCE(value::numeric, 30) INTO v_referral_pct FROM game_settings WHERE key = 'withdrawal_fee_referral_share';

    v_admin_share := FLOOR(v_fee_amount * v_admin_pct / 100);
    v_pool_share := FLOOR(v_fee_amount * v_pool_pct / 100);

    SELECT referred_by INTO v_referrer_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_referrer_id IS NOT NULL THEN
      v_referrer_share := FLOOR(v_fee_amount * v_referral_pct / 100);
    ELSE
      v_referrer_share := 0;
      v_pool_share := v_pool_share + FLOOR(v_fee_amount * v_referral_pct / 100);
    END IF;
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles
  SET fxu_balance = fxu_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;

  IF v_admin_share > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles
      SET fxu_balance = fxu_balance + v_admin_share,
          updated_at = now()
      WHERE id = v_admin_id;
    END IF;
  END IF;

  IF v_pool_share > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_share, 'withdrawal_fee', v_user_id);
  END IF;

  IF v_referrer_share > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles
    SET fxu_balance = fxu_balance + v_referrer_share,
        updated_at = now()
    WHERE id = v_referrer_id;

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer_id, v_user_id, NULL, 'withdrawal_referral', v_referrer_share);

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_referrer_id,
      v_user_id,
      'Comision de referido por retiro',
      'Has recibido ' || ROUND(v_referrer_share, 2) || ' FXU como comision por el retiro de tu referido.',
      'system'
    );
  END IF;

  INSERT INTO wallet_transactions (
    user_id, tx_type, amount, fxu_amount, wallet_address, status
  ) VALUES (
    v_user_id, 'withdrawal', v_net_amount, p_amount, p_wallet_address, 'pending'
  )
  RETURNING id INTO v_transaction_id;

  IF v_admin_share > 0 THEN
    INSERT INTO admin_revenue (revenue_type, amount, description, related_user_id, related_tx_id)
    VALUES ('withdrawal_fee', v_admin_share, 'Comision de retiro (empresa)', v_user_id, v_transaction_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'amount', v_net_amount,
    'gross_amount', p_amount,
    'fee_amount', v_fee_amount,
    'admin_share', v_admin_share,
    'pool_share', v_pool_share,
    'referrer_share', v_referrer_share,
    'is_admin', v_is_admin
  );
END;
$function$;

-- 3) USDT withdrawal: add mode (percent uses usdt_withdrawal_fee_percent).
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

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer_id, v_user_id, NULL, 'withdrawal_referral', v_referrer_share);

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

-- 4) Expose the fee mode via get_wallet_stats (append one key only).
CREATE OR REPLACE FUNCTION public.get_wallet_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_fxu_balance numeric;
  v_usdt_balance numeric;
  v_total_deposited numeric;
  v_total_withdrawn numeric;
  v_total_deposited_usdt numeric;
  v_total_withdrawn_usdt numeric;
  v_pending_withdrawals numeric;
  v_pending_withdrawals_usdt numeric;
  v_daily_withdrawn numeric;
  v_daily_withdrawn_usdt numeric;
  v_config wallet_config%ROWTYPE;
  v_fee_usd numeric;
  v_fee_usdt_flat numeric;
  v_tung_price numeric;
  v_fee_tung numeric;
  v_fee_mode text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT fxu_balance, usdt_balance INTO v_fxu_balance, v_usdt_balance FROM profiles WHERE id = v_user_id;

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposited
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'deposit' AND token_type = 'TUNG' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawn
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'TUNG' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'TUNG' AND status IN ('pending', 'processing');

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposited_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'deposit' AND token_type = 'USDT' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawn_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'USDT' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'USDT' AND status IN ('pending', 'processing');

  v_daily_withdrawn := get_daily_withdrawal_total(v_user_id);
  v_daily_withdrawn_usdt := get_daily_usdt_withdrawal_total(v_user_id);

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  SELECT COALESCE(value::numeric, 1) INTO v_fee_usd FROM game_settings WHERE key = 'withdrawal_fee_usd';
  v_fee_usd := COALESCE(v_fee_usd, 1);
  SELECT COALESCE(value::numeric, 1) INTO v_fee_usdt_flat FROM game_settings WHERE key = 'usdt_withdrawal_fee_flat';
  v_fee_usdt_flat := COALESCE(v_fee_usdt_flat, 1);
  SELECT COALESCE(value, 'flat') INTO v_fee_mode FROM game_settings WHERE key = 'withdrawal_fee_mode';
  v_fee_mode := COALESCE(v_fee_mode, 'flat');
  v_tung_price := get_live_tung_price_usd();
  IF v_tung_price IS NOT NULL AND v_tung_price > 0 THEN
    v_fee_tung := v_fee_usd / v_tung_price;
  ELSE
    v_fee_tung := NULL;
  END IF;

  RETURN jsonb_build_object(
    'fxu_balance', v_fxu_balance,
    'usdt_balance', v_usdt_balance,
    'total_deposited', v_total_deposited,
    'total_withdrawn', v_total_withdrawn,
    'total_deposited_usdt', v_total_deposited_usdt,
    'total_withdrawn_usdt', v_total_withdrawn_usdt,
    'pending_withdrawals', v_pending_withdrawals,
    'pending_withdrawals_usdt', v_pending_withdrawals_usdt,
    'daily_withdrawn', v_daily_withdrawn,
    'daily_withdrawn_usdt', v_daily_withdrawn_usdt,
    'daily_limit', v_config.max_withdrawal_daily,
    'daily_limit_usdt', v_config.usdt_max_withdrawal_daily,
    'daily_remaining', v_config.max_withdrawal_daily - v_daily_withdrawn,
    'daily_remaining_usdt', v_config.usdt_max_withdrawal_daily - v_daily_withdrawn_usdt,
    'min_amount', v_config.min_deposit,
    'min_amount_usdt', v_config.usdt_min_deposit,
    'withdrawal_fee_percent', v_config.withdrawal_fee_percent,
    'withdrawal_fee_percent_usdt', v_config.usdt_withdrawal_fee_percent,
    'deposits_enabled', v_config.is_deposits_enabled,
    'withdrawals_enabled', v_config.is_withdrawals_enabled,
    'usdt_deposits_enabled', v_config.is_usdt_deposits_enabled,
    'usdt_withdrawals_enabled', v_config.is_usdt_withdrawals_enabled,
    'usdt_contract', v_config.usdt_contract_address,
    'swap_enabled', v_config.is_swap_enabled,
    'swap_rate', v_config.swap_rate_fxu_per_usdt,
    'swap_min_fxu', v_config.swap_min_fxu,
    'swap_min_usdt', v_config.swap_min_usdt,
    'swap_fee_percent', COALESCE(v_config.swap_fee_percent, 1.0),
    'withdrawal_fee_flat_usd', v_fee_usd,
    'usdt_withdrawal_fee_flat', v_fee_usdt_flat,
    'tung_price_usd', v_tung_price,
    'withdrawal_fee_tung', v_fee_tung,
    'withdrawal_fee_mode', v_fee_mode
  );
END;
$function$;
