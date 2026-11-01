/*
  # Add Weekly VIP Plan

  Adds a 7-day VIP plan costing $4 USDT / 40,000 FXU.

  Changes:
  1) Add `duration_days` column to `plus_plans` (NULL = use duration_months)
  2) Insert new weekly plan row
  3) Update `purchase_plus_subscription` to handle day-based durations
  4) Update `admin_update_plus_plan` to allow editing duration_days
*/

-- =====================================================
-- 1) Schema: add duration_days column
-- =====================================================
ALTER TABLE public.plus_plans
ADD COLUMN IF NOT EXISTS duration_days integer DEFAULT NULL;

-- Existing plans use months (leave duration_days NULL)
COMMENT ON COLUMN public.plus_plans.duration_days IS
  'If set (> 0), duration is in days instead of months. Used for weekly plans.';

-- =====================================================
-- 2) Insert new weekly plan
-- =====================================================
INSERT INTO public.plus_plans (name, code, duration_months, duration_days, price_fxu, price_usdt, commission_share_percent, is_active)
VALUES ('VIP Semanal', 'plus_weekly', 0, 7, 35000, 3.5, 0.8, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  duration_months = EXCLUDED.duration_months,
  duration_days = EXCLUDED.duration_days,
  price_fxu = EXCLUDED.price_fxu,
  price_usdt = EXCLUDED.price_usdt,
  commission_share_percent = EXCLUDED.commission_share_percent,
  is_active = EXCLUDED.is_active;

-- =====================================================
-- 3) Update purchase_plus_subscription to support duration_days
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

  -- Calculate expiration: use duration_days if set, otherwise duration_months
  IF COALESCE(v_plan.duration_days, 0) > 0 THEN
    v_expires_at := now() + (v_plan.duration_days || ' days')::interval;
  ELSE
    v_expires_at := now() + (v_plan.duration_months || ' months')::interval;
  END IF;

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

-- =====================================================
-- 4) Update admin_update_plus_plan to support duration_days
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_update_plus_plan(
  p_plan_code text,
  p_price_fxu numeric DEFAULT NULL,
  p_price_usdt numeric DEFAULT NULL,
  p_commission_share_percent numeric DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_duration_days integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  UPDATE plus_plans
  SET
    price_fxu = COALESCE(p_price_fxu, price_fxu),
    price_usdt = COALESCE(p_price_usdt, price_usdt),
    commission_share_percent = COALESCE(p_commission_share_percent, commission_share_percent),
    is_active = COALESCE(p_is_active, is_active),
    duration_days = CASE WHEN p_duration_days IS NOT NULL THEN p_duration_days ELSE duration_days END,
    updated_at = now()
  WHERE code = p_plan_code;

  RETURN jsonb_build_object('success', true, 'message', 'Plan actualizado');
END;
$$;

-- Re-grant to handle new overload
GRANT EXECUTE ON FUNCTION public.admin_update_plus_plan(text, numeric, numeric, numeric, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_plus_subscription(text, text) TO authenticated;
