-- Fix: el fee de retiro ahora se reparte entre empresa / pool / referido
-- (igual que market_fee), en vez de solo referido(5% bruto)+empresa sin pool.
-- El % total del fee (wallet_config.withdrawal_fee_percent) y el descuento al
-- usuario NO cambian. Solo cambia el reparto de ese fee.
--
-- Shares configurables (default 40/30/30, igual que el mercado). Si el usuario
-- no tiene referido, la parte de referido se suma al pool (mismo fallback que
-- purchase_market_listing).

INSERT INTO game_settings (key, value)
VALUES ('withdrawal_fee_admin_share', '40')
ON CONFLICT (key) DO NOTHING;
INSERT INTO game_settings (key, value)
VALUES ('withdrawal_fee_pool_share', '30')
ON CONFLICT (key) DO NOTHING;
INSERT INTO game_settings (key, value)
VALUES ('withdrawal_fee_referral_share', '30')
ON CONFLICT (key) DO NOTHING;

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
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT is_withdrawals_enabled INTO v_withdrawals_enabled
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

  IF p_amount > v_current_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente');
  END IF;

  IF p_wallet_address IS NULL OR p_wallet_address = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Direccion de wallet requerida');
  END IF;

  IF v_is_admin THEN
    v_fee_percent := 0;
    v_fee_amount := 0;
    v_net_amount := p_amount;
    v_referrer_share := 0;
    v_admin_share := 0;
    v_pool_share := 0;
  ELSE
    SELECT withdrawal_fee_percent INTO v_fee_percent
    FROM wallet_config WHERE id = 1;

    v_fee_amount := p_amount * (v_fee_percent / 100);
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
      -- Fallback: si no hay referido, su parte va al pool
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
