-- ============================================================================
-- HD deposit system (child wallets) + flat withdrawal fee
-- Migration: 20260710_hd_deposit_system.sql
-- Idempotent. Non-destructive. Does NOT change existing withdrawal signing flow.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Per-user deterministic deposit (child) address
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deposit_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  address text NOT NULL UNIQUE,
  derivation_index bigint,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_addr_lower ON public.deposit_addresses (lower(address));

ALTER TABLE public.deposit_addresses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='deposit_addresses' AND policyname='own_deposit_address_select') THEN
    CREATE POLICY own_deposit_address_select ON public.deposit_addresses
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Config keys (game_settings)
-- ---------------------------------------------------------------------------
INSERT INTO public.game_settings (key, value) VALUES
  ('deposit_gas_buffer_tung', '100'),
  ('deposit_gas_buffer_usdt', '0.05'),
  ('withdrawal_fee_usd', '1'),
  ('usdt_withdrawal_fee_flat', '1'),
  ('deposit_session_minutes', '30')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) admin_revenue: allow the new revenue_type 'deposit_gas_buffer'
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE public.admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check CHECK (
  revenue_type = ANY (ARRAY[
    'market_fee','withdrawal_fee','instant_build','instant_research','instant_ship',
    'referral_bonus','officer_fxu','expedition_fee','supply_box','fleet_acceleration',
    'swap_fee','transfer_fee','plus_subscription','colony_abandon','planet_rename',
    'alliance_rename','alliance_creation','lottery_fee','p2p_fee','blueprint_sale',
    'hero_respec','other','premium_mission','hero_duel','daily_streak','deposit_gas_buffer'
  ])
);

-- ---------------------------------------------------------------------------
-- 4) register_deposit_address(): persist the derived child address (service only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_deposit_address(
  p_user_id uuid, p_address text, p_index bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_is_superuser boolean;
  v_role text;
  v_addr text;
BEGIN
  v_is_superuser := (SELECT usesuper FROM pg_user WHERE usename = current_user);
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' AND NOT v_is_superuser THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_user_id IS NULL OR p_address IS NULL OR p_address = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_id and address required');
  END IF;

  INSERT INTO public.deposit_addresses (user_id, address, derivation_index)
  VALUES (p_user_id, p_address, p_index)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT address INTO v_addr FROM public.deposit_addresses WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', true, 'address', v_addr);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) credit_auto_deposit(): idempotent auto-credit for detected on-chain deposits
--    User gets (received - buffer); admin gets buffer (100 TUNG / 0.05 USDT).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_auto_deposit(
  p_tx_hash text, p_user_id uuid, p_amount numeric, p_token_type text,
  p_block_number bigint, p_child_address text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_is_superuser boolean;
  v_role text;
  v_token text;
  v_currency text;
  v_buffer numeric;
  v_user_credit numeric;
  v_admin_credit numeric;
  v_admin_id uuid;
  v_tx_id uuid;
  v_existing wallet_transactions%ROWTYPE;
BEGIN
  v_is_superuser := (SELECT usesuper FROM pg_user WHERE usename = current_user);
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' AND NOT v_is_superuser THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: server only');
  END IF;

  IF p_tx_hash IS NULL OR p_tx_hash = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'tx hash required');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount must be positive');
  END IF;

  v_token := UPPER(COALESCE(p_token_type, 'TUNG'));
  IF v_token NOT IN ('TUNG', 'USDT') THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad token type');
  END IF;

  -- Idempotency: never credit the same tx twice
  SELECT * INTO v_existing FROM wallet_transactions WHERE tx_hash = lower(p_tx_hash);
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already processed', 'duplicate', true);
  END IF;

  IF v_token = 'TUNG' THEN
    SELECT COALESCE(value::numeric, 100) INTO v_buffer FROM game_settings WHERE key = 'deposit_gas_buffer_tung';
    v_buffer := COALESCE(v_buffer, 100);
    v_currency := 'FXU';
  ELSE
    SELECT COALESCE(value::numeric, 0.05) INTO v_buffer FROM game_settings WHERE key = 'deposit_gas_buffer_usdt';
    v_buffer := COALESCE(v_buffer, 0.05);
    v_currency := 'USDT';
  END IF;

  IF p_amount > v_buffer THEN
    v_user_credit := p_amount - v_buffer;
    v_admin_credit := v_buffer;
  ELSE
    v_user_credit := 0;
    v_admin_credit := p_amount;
  END IF;

  -- Record the on-chain deposit (amount = gross received; constraint requires > 0)
  INSERT INTO wallet_transactions (
    user_id, tx_hash, tx_type, token_type, amount, fxu_amount, wallet_address,
    status, confirmations, block_number, processed_at
  ) VALUES (
    p_user_id, lower(p_tx_hash), 'deposit', v_token, p_amount, p_amount,
    COALESCE(p_child_address, ''), 'confirmed', 3, p_block_number, now()
  ) RETURNING id INTO v_tx_id;

  -- Allow moving protected fxu_balance for this transaction
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Credit the user (received - buffer)
  IF v_user_credit > 0 THEN
    IF v_token = 'TUNG' THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_user_credit, updated_at = now() WHERE id = p_user_id;
    ELSE
      UPDATE profiles SET usdt_balance = usdt_balance + v_user_credit, updated_at = now() WHERE id = p_user_id;
    END IF;
  END IF;

  -- Credit the admin the gas buffer + ledger
  IF v_admin_credit > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      IF v_token = 'TUNG' THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_admin_credit, updated_at = now() WHERE id = v_admin_id;
      ELSE
        UPDATE profiles SET usdt_balance = usdt_balance + v_admin_credit, updated_at = now() WHERE id = v_admin_id;
      END IF;
    END IF;
    PERFORM record_admin_revenue('deposit_gas_buffer', v_admin_credit, 'Buffer de gas de deposito', p_user_id, v_tx_id, v_currency);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'credited', v_user_credit,
    'buffer', v_admin_credit,
    'token', v_token
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) request_withdrawal (TUNG): flat fee = $1 worth of TUNG (fallback to %)
--    Only the fee computation changed; all guards + fee split preserved.
-- ---------------------------------------------------------------------------
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
    -- Fee plano: equivalente a 1 USD en TUNG al precio del momento.
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

    IF v_fee_amount < 0 THEN v_fee_amount := 0; END IF;

    -- El fee no puede ser mayor o igual al monto retirado
    IF v_fee_amount >= p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'El monto es menor que el fee de retiro (1 USD en TUNG). Retira una cantidad mayor.');
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

-- ---------------------------------------------------------------------------
-- 7) request_withdrawal_usdt: flat fee = 1 USDT (referral share of the fee)
-- ---------------------------------------------------------------------------
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

  IF p_amount < v_config.usdt_min_deposit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount below minimum: ' || v_config.usdt_min_deposit);
  END IF;

  SELECT usdt_balance INTO v_usdt_balance FROM profiles WHERE id = v_user_id;

  IF v_usdt_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient USDT balance');
  END IF;

  v_daily_total := get_daily_usdt_withdrawal_total(v_user_id);
  IF v_daily_total + p_amount > v_config.usdt_max_withdrawal_daily THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Daily USDT withdrawal limit exceeded. Remaining: ' || (v_config.usdt_max_withdrawal_daily - v_daily_total)
    );
  END IF;

  -- Fee plano: 1 USDT fijo
  SELECT COALESCE(value::numeric, 1) INTO v_fee_flat FROM game_settings WHERE key = 'usdt_withdrawal_fee_flat';
  v_fee := COALESCE(v_fee_flat, 1);

  IF v_fee >= p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'El monto es menor que el fee de retiro (1 USDT). Retira una cantidad mayor.');
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
