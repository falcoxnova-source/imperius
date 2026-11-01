/*
  # Fix Admin Dashboard Currency Consistency

  Problem:
  - `admin_revenue.amount` stores mixed currencies (FXU + USDT)
  - Several dashboard functions aggregate raw `amount` as if everything was FXU
  - `withdrawal_fee` trigger recorded full fee instead of admin share

  Solution:
  1) Add explicit `currency` column to `admin_revenue`
  2) Backfill historical rows and normalize `withdrawal_fee` to admin share
  3) Update writers to store correct currency
  4) Update readers to aggregate in FXU-equivalent consistently
*/

-- =====================================================
-- 1) Schema changes
-- =====================================================
ALTER TABLE public.admin_revenue
ADD COLUMN IF NOT EXISTS currency text;

-- Backfill currency for existing rows
UPDATE public.admin_revenue ar
SET currency = CASE
  WHEN ar.revenue_type = 'withdrawal_fee' THEN
    CASE WHEN wt.token_type = 'USDT' THEN 'USDT' ELSE 'FXU' END
  WHEN ar.revenue_type = 'transfer_fee' AND ar.description ILIKE '%USDT%' THEN 'USDT'
  WHEN ar.revenue_type = 'plus_subscription' AND ar.description ILIKE '%(USDT)%' THEN 'USDT'
  ELSE 'FXU'
END
FROM public.wallet_transactions wt
WHERE ar.related_tx_id = wt.id
  AND (ar.currency IS NULL OR ar.currency NOT IN ('FXU', 'USDT'));

UPDATE public.admin_revenue
SET currency = CASE
  WHEN revenue_type = 'transfer_fee' AND description ILIKE '%USDT%' THEN 'USDT'
  WHEN revenue_type = 'plus_subscription' AND description ILIKE '%(USDT)%' THEN 'USDT'
  ELSE 'FXU'
END
WHERE currency IS NULL OR currency NOT IN ('FXU', 'USDT');

ALTER TABLE public.admin_revenue
ALTER COLUMN currency SET DEFAULT 'FXU';

UPDATE public.admin_revenue
SET currency = 'FXU'
WHERE currency IS NULL;

ALTER TABLE public.admin_revenue
ALTER COLUMN currency SET NOT NULL;

ALTER TABLE public.admin_revenue
DROP CONSTRAINT IF EXISTS admin_revenue_currency_check;

ALTER TABLE public.admin_revenue
ADD CONSTRAINT admin_revenue_currency_check
CHECK (currency IN ('FXU', 'USDT'));

CREATE INDEX IF NOT EXISTS idx_admin_revenue_currency ON public.admin_revenue(currency);

-- =====================================================
-- 2) Historical correction: withdrawal_fee should store admin share,
--    not full fee, when user has referrer (5% of gross goes to referrer)
-- =====================================================
UPDATE public.admin_revenue ar
SET amount = GREATEST(
  ar.amount - CASE
    WHEN p.referred_by IS NOT NULL THEN COALESCE(wt.fxu_amount, 0) * 0.05
    ELSE 0
  END,
  0
)
FROM public.wallet_transactions wt,
     public.profiles p
WHERE ar.revenue_type = 'withdrawal_fee'
  AND ar.related_tx_id = wt.id
  AND p.id = ar.related_user_id;

-- =====================================================
-- 3) Helper function to record revenue with explicit currency
--    First drop old 5-param overload to avoid ambiguity
-- =====================================================
DROP FUNCTION IF EXISTS public.record_admin_revenue(text, numeric, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.record_admin_revenue(
  p_revenue_type text,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_related_user_id uuid DEFAULT NULL,
  p_related_tx_id uuid DEFAULT NULL,
  p_currency text DEFAULT 'FXU'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue_id uuid;
  v_currency text;
BEGIN
  IF p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  v_currency := UPPER(COALESCE(p_currency, 'FXU'));
  IF v_currency NOT IN ('FXU', 'USDT') THEN
    RAISE EXCEPTION 'Invalid currency for admin_revenue: %', v_currency;
  END IF;

  INSERT INTO public.admin_revenue (revenue_type, amount, currency, description, related_user_id, related_tx_id)
  VALUES (p_revenue_type, p_amount, v_currency, p_description, p_related_user_id, p_related_tx_id)
  RETURNING id INTO v_revenue_id;

  RETURN v_revenue_id;
END;
$$;

-- =====================================================
-- 4) Fix withdrawal trigger: record only ADMIN SHARE, in correct currency,
--    and avoid duplicates per transaction.
-- =====================================================
CREATE OR REPLACE FUNCTION public.trigger_record_withdrawal_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee_amount numeric;
  v_admin_share numeric;
  v_has_referrer boolean;
  v_currency text;
BEGIN
  IF NEW.tx_type = 'withdrawal'
     AND NEW.status = 'confirmed'
     AND (OLD.status IS NULL OR OLD.status <> 'confirmed') THEN

    -- Prevent duplicate insertion for the same withdrawal tx
    IF EXISTS (
      SELECT 1
      FROM public.admin_revenue ar
      WHERE ar.related_tx_id = NEW.id
        AND ar.revenue_type = 'withdrawal_fee'
    ) THEN
      RETURN NEW;
    END IF;

    v_fee_amount := COALESCE(NEW.fxu_amount, 0) - COALESCE(NEW.amount, 0);

    IF v_fee_amount > 0 THEN
      SELECT (referred_by IS NOT NULL) INTO v_has_referrer
      FROM public.profiles
      WHERE id = NEW.user_id;

      v_admin_share := GREATEST(
        v_fee_amount - CASE WHEN COALESCE(v_has_referrer, false) THEN COALESCE(NEW.fxu_amount, 0) * 0.05 ELSE 0 END,
        0
      );

      IF v_admin_share > 0 THEN
        v_currency := CASE WHEN NEW.token_type = 'USDT' THEN 'USDT' ELSE 'FXU' END;

        PERFORM public.record_admin_revenue(
          'withdrawal_fee',
          v_admin_share,
          'Comision de retiro (empresa)',
          NEW.user_id,
          NEW.id,
          v_currency
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================
-- 5) Writers with explicit currency
-- =====================================================
CREATE OR REPLACE FUNCTION public.purchase_plus_subscription(
  p_plan_code text,
  p_payment_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_plan plus_plans%ROWTYPE;
  v_price numeric;
  v_current_fxu numeric;
  v_current_usdt numeric;
  v_expires_at timestamptz;
  v_existing_sub plus_subscriptions%ROWTYPE;
  v_sub_id uuid;
  v_referrer_id uuid;
  v_commission_percent numeric;
  v_commission_amount numeric;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_plan FROM plus_plans WHERE code = p_plan_code AND is_active = true;

  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan no encontrado');
  END IF;

  SELECT * INTO v_existing_sub
  FROM plus_subscriptions
  WHERE user_id = v_user_id AND is_active = true AND expires_at > now();

  IF v_existing_sub.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ya tienes una suscripcion Plus activa hasta ' || to_char(v_existing_sub.expires_at, 'DD/MM/YYYY')
    );
  END IF;

  PERFORM _internal_set_fxu_context();

  IF p_payment_type = 'fxu' THEN
    v_price := v_plan.price_fxu;

    SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

    IF v_current_fxu IS NULL OR v_current_fxu < v_price THEN
      RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_price || ' FXU');
    END IF;

    UPDATE profiles SET fxu_balance = fxu_balance - v_price WHERE id = v_user_id;

    INSERT INTO public.admin_revenue (revenue_type, amount, currency, related_user_id, description)
    VALUES ('plus_subscription', v_price, 'FXU', v_user_id, 'Plus ' || v_plan.name || ' (FXU)');

  ELSIF p_payment_type = 'usdt' THEN
    v_price := v_plan.price_usdt;

    SELECT usdt_balance INTO v_current_usdt FROM profiles WHERE id = v_user_id;

    IF v_current_usdt IS NULL OR v_current_usdt < v_price THEN
      RETURN jsonb_build_object('success', false, 'error', 'USDT insuficiente. Necesitas ' || v_price || ' USDT');
    END IF;

    UPDATE profiles SET usdt_balance = usdt_balance - v_price WHERE id = v_user_id;

    INSERT INTO public.admin_revenue (revenue_type, amount, currency, related_user_id, description)
    VALUES ('plus_subscription', v_price, 'USDT', v_user_id, 'Plus ' || v_plan.name || ' (USDT)');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de pago invalido');
  END IF;

  v_expires_at := now() + (v_plan.duration_months || ' months')::interval;

  INSERT INTO plus_subscriptions (user_id, plan_id, payment_type, amount_paid, expires_at, commission_share_percent)
  VALUES (v_user_id, v_plan.id, p_payment_type, v_price, v_expires_at, v_plan.commission_share_percent)
  RETURNING id INTO v_sub_id;

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_user_id;

  IF v_referrer_id IS NOT NULL THEN
    v_commission_percent := get_referral_commission_percent();
    v_commission_amount := FLOOR(v_price * v_commission_percent / 100 * 100) / 100;

    IF v_commission_amount >= 0.01 THEN
      IF p_payment_type = 'fxu' THEN
        UPDATE profiles
        SET fxu_balance = COALESCE(fxu_balance, 0) + v_commission_amount
        WHERE id = v_referrer_id;
      ELSIF p_payment_type = 'usdt' THEN
        UPDATE profiles
        SET usdt_balance = COALESCE(usdt_balance, 0) + v_commission_amount
        WHERE id = v_referrer_id;
      END IF;

      INSERT INTO referral_commissions (
        referrer_id, seller_id, transaction_id,
        commission_type, resource_type, amount, fxu_amount
      )
      VALUES (
        v_referrer_id,
        v_user_id,
        NULL,
        'plus_subscription',
        p_payment_type,
        FLOOR(v_commission_amount)::bigint,
        v_commission_amount
      );

      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_referrer_id,
        v_user_id,
        'Comision de referido por compra Plus',
        'Has recibido ' || ROUND(v_commission_amount, 2) || ' ' || UPPER(p_payment_type)
          || ' como comision porque tu referido compro Plus ' || v_plan.name || '.',
        'system'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Suscripcion Plus activada hasta ' || to_char(v_expires_at, 'DD/MM/YYYY'),
    'subscription_id', v_sub_id,
    'expires_at', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_tokens(
  p_receiver_username text,
  p_token_type text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
  v_receiver_id uuid;
  v_receiver_username text;
  v_sender_username text;
  v_sender_balance numeric;
  v_fee_percent numeric;
  v_fee_amount numeric;
  v_net_amount numeric;
  v_transfers_enabled text;
  v_admin_id uuid;
  v_transfer_id uuid;
  v_input text;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT value INTO v_transfers_enabled FROM game_settings WHERE key = 'transfers_enabled';
  IF COALESCE(v_transfers_enabled, 'true') != 'true' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfers are currently disabled');
  END IF;

  IF p_token_type NOT IN ('FXU', 'USDT') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token type');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than 0');
  END IF;

  IF p_amount < 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum transfer is 1,000');
  END IF;

  SELECT username INTO v_sender_username FROM profiles WHERE id = v_sender_id;

  v_input := TRIM(p_receiver_username);

  IF v_input LIKE '%@%' THEN
    SELECT id, username INTO v_receiver_id, v_receiver_username
    FROM profiles
    WHERE LOWER(email) = LOWER(v_input);

    IF v_receiver_id IS NULL THEN
      SELECT id, username INTO v_receiver_id, v_receiver_username
      FROM profiles
      WHERE LOWER(username) = LOWER(v_input);
    END IF;
  ELSE
    SELECT id, username INTO v_receiver_id, v_receiver_username
    FROM profiles
    WHERE LOWER(username) = LOWER(v_input);

    IF v_receiver_id IS NULL THEN
      SELECT id, username INTO v_receiver_id, v_receiver_username
      FROM profiles
      WHERE LOWER(email) = LOWER(v_input);
    END IF;
  END IF;

  IF v_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found. Check the username or email.');
  END IF;

  IF v_receiver_id = v_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  SELECT value INTO v_fee_percent FROM game_settings WHERE key = 'transfer_fee_percent';
  v_fee_percent := COALESCE(v_fee_percent::numeric, 10);

  v_fee_amount := FLOOR(p_amount * v_fee_percent / 100 * 100000000) / 100000000;
  v_net_amount := p_amount - v_fee_amount;

  IF v_net_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount too small after fee');
  END IF;

  IF p_token_type = 'FXU' THEN
    SELECT fxu_balance INTO v_sender_balance FROM profiles WHERE id = v_sender_id;
  ELSE
    SELECT usdt_balance INTO v_sender_balance FROM profiles WHERE id = v_sender_id;
  END IF;

  IF v_sender_balance IS NULL OR v_sender_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'available', COALESCE(v_sender_balance, 0),
      'required', p_amount
    );
  END IF;

  v_admin_id := get_admin_account_id();

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  IF p_token_type = 'FXU' THEN
    UPDATE profiles SET fxu_balance = fxu_balance - p_amount WHERE id = v_sender_id;
    UPDATE profiles SET fxu_balance = fxu_balance + v_net_amount WHERE id = v_receiver_id;
    IF v_admin_id IS NOT NULL AND v_fee_amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_fee_amount WHERE id = v_admin_id;
    END IF;
  ELSE
    UPDATE profiles SET usdt_balance = usdt_balance - p_amount WHERE id = v_sender_id;
    UPDATE profiles SET usdt_balance = usdt_balance + v_net_amount WHERE id = v_receiver_id;
    IF v_admin_id IS NOT NULL AND v_fee_amount > 0 THEN
      UPDATE profiles SET usdt_balance = usdt_balance + v_fee_amount WHERE id = v_admin_id;
    END IF;
  END IF;

  INSERT INTO internal_transfers (sender_id, receiver_id, token_type, gross_amount, fee_amount, net_amount, fee_percent)
  VALUES (v_sender_id, v_receiver_id, p_token_type, p_amount, v_fee_amount, v_net_amount, v_fee_percent)
  RETURNING id INTO v_transfer_id;

  IF v_fee_amount > 0 THEN
    PERFORM public.record_admin_revenue(
      'transfer_fee',
      v_fee_amount,
      'Transfer fee: ' || p_amount || ' ' || p_token_type || ' from ' || v_sender_id::text || ' to ' || v_receiver_username,
      v_sender_id,
      v_transfer_id,
      p_token_type
    );
  END IF;

  INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
  VALUES (
    v_receiver_id,
    v_sender_id,
    'Transfer received',
    'You received ' || v_net_amount || ' ' || p_token_type || ' from ' || v_sender_username,
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'gross_amount', p_amount,
    'fee_amount', v_fee_amount,
    'net_amount', v_net_amount,
    'fee_percent', v_fee_percent,
    'receiver', v_receiver_username,
    'token_type', p_token_type
  );
END;
$$;

-- =====================================================
-- 6) Readers: consistent FXU-equivalent aggregation
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_admin_available_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue_fxu numeric;
  v_total_withdrawn numeric;
  v_total_expenses numeric;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0)
  INTO v_total_revenue_fxu
  FROM public.admin_revenue;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_withdrawn
  FROM public.admin_withdrawals
  WHERE status IN ('pending', 'processing', 'confirmed');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_expenses
  FROM public.admin_expenses;

  RETURN GREATEST(v_total_revenue_fxu - v_total_withdrawn - v_total_expenses, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_financial_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_user_fxu numeric;
  v_total_user_usdt numeric;
  v_total_deposits_fxu numeric;
  v_total_deposits_usdt numeric;
  v_total_withdrawals_fxu numeric;
  v_total_withdrawals_usdt numeric;
  v_pending_withdrawals_fxu numeric;
  v_pending_withdrawals_usdt numeric;
  v_total_admin_revenue numeric;
  v_total_admin_expenses numeric;
  v_month_revenue numeric;
  v_year_revenue numeric;
  v_admin_available numeric;
  v_current_month integer;
  v_current_year integer;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT COALESCE(SUM(fxu_balance), 0) INTO v_total_user_fxu
  FROM profiles
  WHERE is_admin = false OR is_admin IS NULL;

  SELECT COALESCE(SUM(usdt_balance), 0) INTO v_total_user_usdt
  FROM profiles
  WHERE is_admin = false OR is_admin IS NULL;

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposits_fxu
  FROM wallet_transactions
  WHERE tx_type = 'deposit' AND status = 'confirmed' AND (token_type = 'FXU' OR token_type IS NULL);

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposits_usdt
  FROM wallet_transactions
  WHERE tx_type = 'deposit' AND status = 'confirmed' AND token_type = 'USDT';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawals_fxu
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'confirmed' AND (token_type = 'FXU' OR token_type IS NULL);

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawals_usdt
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'confirmed' AND token_type = 'USDT';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals_fxu
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'pending' AND (token_type = 'FXU' OR token_type IS NULL);

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals_usdt
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'pending' AND token_type = 'USDT';

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0)
  INTO v_total_admin_revenue
  FROM admin_revenue;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_admin_expenses
  FROM admin_expenses;

  v_current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  v_current_year := EXTRACT(YEAR FROM CURRENT_DATE);

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0)
  INTO v_month_revenue
  FROM admin_revenue
  WHERE EXTRACT(MONTH FROM created_at) = v_current_month
    AND EXTRACT(YEAR FROM created_at) = v_current_year;

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0)
  INTO v_year_revenue
  FROM admin_revenue
  WHERE EXTRACT(YEAR FROM created_at) = v_current_year;

  v_admin_available := get_admin_available_balance();

  RETURN jsonb_build_object(
    'success', true,
    'total_user_fxu', v_total_user_fxu,
    'total_user_usdt', v_total_user_usdt,
    'total_deposits', v_total_deposits_fxu,
    'total_withdrawals', v_total_withdrawals_fxu,
    'pending_withdrawals', v_pending_withdrawals_fxu,
    'total_deposits_usdt', v_total_deposits_usdt,
    'total_withdrawals_usdt', v_total_withdrawals_usdt,
    'pending_withdrawals_usdt', v_pending_withdrawals_usdt,
    'total_admin_revenue', v_total_admin_revenue,
    'total_admin_expenses', v_total_admin_expenses,
    'month_revenue', v_month_revenue,
    'year_revenue', v_year_revenue,
    'admin_available_balance', v_admin_available,
    'current_month', v_current_month,
    'current_year', v_current_year
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_by_type(p_year integer DEFAULT NULL, p_month integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'breakdown', COALESCE(jsonb_object_agg(revenue_type, total), '{}'::jsonb),
      'total', COALESCE(SUM(total), 0)
    )
    FROM (
      SELECT
        revenue_type,
        SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END) AS total
      FROM public.admin_revenue
      WHERE (p_year IS NULL OR EXTRACT(YEAR FROM created_at) = p_year)
        AND (p_month IS NULL OR EXTRACT(MONTH FROM created_at) = p_month)
      GROUP BY revenue_type
    ) breakdown
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recent_revenue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  RETURN jsonb_build_object('success', true, 'revenues', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        ar.id,
        ar.revenue_type as type,
        ar.amount,
        ar.currency,
        CASE WHEN ar.currency = 'USDT' THEN ar.amount * 10000 ELSE ar.amount END AS amount_fxu,
        ar.description,
        p.username,
        ar.created_at
      FROM public.admin_revenue ar
      LEFT JOIN public.profiles p ON p.id = ar.related_user_id
      ORDER BY ar.created_at DESC
      LIMIT p_limit
    ) t
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_revenue(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'date', d.day::date,
            'amount', COALESCE(r.total, 0)
          )
          ORDER BY d.day
        )
        FROM generate_series(
          CURRENT_DATE - (p_days - 1),
          CURRENT_DATE,
          '1 day'::interval
        ) AS d(day)
        LEFT JOIN (
          SELECT DATE(created_at) as day,
                 SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END) as total
          FROM public.admin_revenue
          WHERE created_at >= CURRENT_DATE - p_days
          GROUP BY DATE(created_at)
        ) r ON d.day::date = r.day
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_weekly_revenue(p_weeks integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'week_start', w.week_start::date,
            'week_number', EXTRACT(WEEK FROM w.week_start),
            'amount', COALESCE(r.total, 0)
          )
          ORDER BY w.week_start
        )
        FROM generate_series(
          DATE_TRUNC('week', CURRENT_DATE) - ((p_weeks - 1) * INTERVAL '1 week'),
          DATE_TRUNC('week', CURRENT_DATE),
          '1 week'::interval
        ) AS w(week_start)
        LEFT JOIN (
          SELECT DATE_TRUNC('week', created_at) as week_start,
                 SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END) as total
          FROM public.admin_revenue
          WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) - (p_weeks * INTERVAL '1 week')
          GROUP BY DATE_TRUNC('week', created_at)
        ) r ON w.week_start = r.week_start
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_revenue(p_months integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'month_start', m.month_start::date,
            'month', EXTRACT(MONTH FROM m.month_start),
            'year', EXTRACT(YEAR FROM m.month_start),
            'amount', COALESCE(r.total, 0)
          )
          ORDER BY m.month_start
        )
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - ((p_months - 1) * INTERVAL '1 month'),
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'::interval
        ) AS m(month_start)
        LEFT JOIN (
          SELECT DATE_TRUNC('month', created_at) as month_start,
                 SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END) as total
          FROM public.admin_revenue
          WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) - (p_months * INTERVAL '1 month')
          GROUP BY DATE_TRUNC('month', created_at)
        ) r ON m.month_start = r.month_start
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_today numeric;
  v_yesterday numeric;
  v_this_week numeric;
  v_last_week numeric;
  v_this_month numeric;
  v_last_month numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0) INTO v_today
  FROM public.admin_revenue
  WHERE DATE(created_at) = CURRENT_DATE;

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0) INTO v_yesterday
  FROM public.admin_revenue
  WHERE DATE(created_at) = CURRENT_DATE - 1;

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0) INTO v_this_week
  FROM public.admin_revenue
  WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE);

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0) INTO v_last_week
  FROM public.admin_revenue
  WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week'
    AND created_at < DATE_TRUNC('week', CURRENT_DATE);

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0) INTO v_this_month
  FROM public.admin_revenue
  WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE);

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0) INTO v_last_month
  FROM public.admin_revenue
  WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
    AND created_at < DATE_TRUNC('month', CURRENT_DATE);

  RETURN jsonb_build_object(
    'success', true,
    'today', v_today,
    'yesterday', v_yesterday,
    'today_change', CASE WHEN v_yesterday > 0 THEN ((v_today - v_yesterday) / v_yesterday * 100) ELSE 0 END,
    'this_week', v_this_week,
    'last_week', v_last_week,
    'week_change', CASE WHEN v_last_week > 0 THEN ((v_this_week - v_last_week) / v_last_week * 100) ELSE 0 END,
    'this_month', v_this_month,
    'last_month', v_last_month,
    'month_change', CASE WHEN v_last_month > 0 THEN ((v_this_month - v_last_month) / v_last_month * 100) ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_weekly_revenue_snapshots(p_limit integer DEFAULT 52)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin boolean;
  v_snapshots jsonb;
  v_current_week_breakdown jsonb;
  v_current_week_total numeric;
  v_current_week_start date;
  v_current_week_end date;
  v_current_week_number integer;
  v_current_year integer;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_current_week_start := DATE_TRUNC('week', CURRENT_DATE)::date;
  v_current_week_end := (v_current_week_start + INTERVAL '6 days')::date;
  v_current_week_number := EXTRACT(WEEK FROM v_current_week_start);
  v_current_year := EXTRACT(YEAR FROM v_current_week_start);

  SELECT
    COALESCE(jsonb_object_agg(revenue_type, type_total), '{}'::jsonb),
    COALESCE(SUM(type_total), 0)
  INTO v_current_week_breakdown, v_current_week_total
  FROM (
    SELECT
      revenue_type,
      SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END) AS type_total
    FROM public.admin_revenue
    WHERE created_at >= v_current_week_start::timestamptz
      AND created_at < (v_current_week_end + INTERVAL '1 day')::timestamptz
    GROUP BY revenue_type
  ) sub;

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.week_start DESC), '[]'::jsonb)
  INTO v_snapshots
  FROM (
    SELECT
      id,
      week_start,
      week_end,
      week_number,
      year,
      breakdown,
      total::float,
      created_at
    FROM public.weekly_revenue_snapshots
    ORDER BY week_start DESC
    LIMIT p_limit
  ) s;

  RETURN jsonb_build_object(
    'success', true,
    'current_week', jsonb_build_object(
      'week_start', v_current_week_start,
      'week_end', v_current_week_end,
      'week_number', v_current_week_number,
      'year', v_current_year,
      'breakdown', v_current_week_breakdown,
      'total', v_current_week_total::float,
      'is_current', true
    ),
    'snapshots', v_snapshots
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.take_weekly_revenue_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_week_start date;
  v_week_end date;
  v_week_number integer;
  v_year integer;
  v_breakdown jsonb;
  v_total numeric;
  v_existing_id uuid;
BEGIN
  v_week_start := DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 day')::date;
  v_week_end := (v_week_start + INTERVAL '6 days')::date;
  v_week_number := EXTRACT(WEEK FROM v_week_start);
  v_year := EXTRACT(YEAR FROM v_week_start);

  SELECT id INTO v_existing_id
  FROM public.weekly_revenue_snapshots
  WHERE week_start = v_week_start AND year = v_year;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Snapshot already exists for week ' || v_week_number || ' of ' || v_year
    );
  END IF;

  SELECT
    COALESCE(jsonb_object_agg(revenue_type, type_total), '{}'::jsonb),
    COALESCE(SUM(type_total), 0)
  INTO v_breakdown, v_total
  FROM (
    SELECT
      revenue_type,
      SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END) AS type_total
    FROM public.admin_revenue
    WHERE created_at >= v_week_start::timestamptz
      AND created_at < (v_week_end + INTERVAL '1 day')::timestamptz
    GROUP BY revenue_type
  ) sub;

  INSERT INTO public.weekly_revenue_snapshots (week_start, week_end, week_number, year, breakdown, total)
  VALUES (v_week_start, v_week_end, v_week_number, v_year, v_breakdown, v_total);

  RETURN jsonb_build_object(
    'success', true,
    'week_start', v_week_start,
    'week_end', v_week_end,
    'week_number', v_week_number,
    'year', v_year,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_admin_revenue(text, numeric, text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_financial_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_type(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_revenue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_revenue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_revenue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_revenue_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_revenue_snapshots(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_weekly_revenue_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_available_balance() TO authenticated;
