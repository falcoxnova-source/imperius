-- ============================================================================
-- Plus Referral Commission
-- 
-- Cuando un referido compra Plus, el referidor recibe el 5% de comision
-- EN LA MISMA MONEDA del pago:
--   - Si paga con FXU  → referidor recibe FXU
--   - Si paga con USDT → referidor recibe USDT
--
-- La comision se genera (no se descuenta del comprador ni del admin revenue).
-- Se registra en referral_commissions con commission_type = 'plus_subscription'
-- Se envia un mensaje interno al referidor notificando.
-- ============================================================================

CREATE OR REPLACE FUNCTION purchase_plus_subscription(
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
  -- Referral commission vars
  v_referrer_id uuid;
  v_commission_percent numeric;
  v_commission_amount numeric;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Get plan details
  SELECT * INTO v_plan FROM plus_plans WHERE code = p_plan_code AND is_active = true;
  
  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan no encontrado');
  END IF;

  -- Check for active subscription
  SELECT * INTO v_existing_sub 
  FROM plus_subscriptions 
  WHERE user_id = v_user_id AND is_active = true AND expires_at > now();
  
  IF v_existing_sub.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Ya tienes una suscripcion Plus activa hasta ' || to_char(v_existing_sub.expires_at, 'DD/MM/YYYY')
    );
  END IF;

  -- Unlock FXU balance trigger protection
  PERFORM _internal_set_fxu_context();

  -- Determine price based on payment type
  IF p_payment_type = 'fxu' THEN
    v_price := v_plan.price_fxu;
    
    SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
    
    IF v_current_fxu IS NULL OR v_current_fxu < v_price THEN
      RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_price || ' FXU');
    END IF;
    
    -- Deduct FXU
    UPDATE profiles SET fxu_balance = fxu_balance - v_price WHERE id = v_user_id;
    
    -- Record as revenue
    INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
    VALUES ('plus_subscription', v_price, v_user_id, 'Plus ' || v_plan.name || ' (FXU)');
    
  ELSIF p_payment_type = 'usdt' THEN
    v_price := v_plan.price_usdt;
    
    SELECT usdt_balance INTO v_current_usdt FROM profiles WHERE id = v_user_id;
    
    IF v_current_usdt IS NULL OR v_current_usdt < v_price THEN
      RETURN jsonb_build_object('success', false, 'error', 'USDT insuficiente. Necesitas ' || v_price || ' USDT');
    END IF;
    
    -- Deduct USDT
    UPDATE profiles SET usdt_balance = usdt_balance - v_price WHERE id = v_user_id;
    
    -- Record as revenue
    INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
    VALUES ('plus_subscription', v_price, v_user_id, 'Plus ' || v_plan.name || ' (USDT)');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de pago invalido');
  END IF;

  -- Calculate expiration
  v_expires_at := now() + (v_plan.duration_months || ' months')::interval;

  -- Create subscription
  INSERT INTO plus_subscriptions (user_id, plan_id, payment_type, amount_paid, expires_at, commission_share_percent)
  VALUES (v_user_id, v_plan.id, p_payment_type, v_price, v_expires_at, v_plan.commission_share_percent)
  RETURNING id INTO v_sub_id;

  -- =====================================================
  -- REFERRAL COMMISSION: Pay referrer in same currency
  -- =====================================================
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_user_id;

  IF v_referrer_id IS NOT NULL THEN
    -- Get configurable commission percent (default 5%)
    v_commission_percent := get_referral_commission_percent();
    v_commission_amount := FLOOR(v_price * v_commission_percent / 100 * 100) / 100; -- round to 2 decimals

    IF v_commission_amount >= 0.01 THEN
      -- Pay commission in the SAME currency as the purchase
      IF p_payment_type = 'fxu' THEN
        UPDATE profiles 
        SET fxu_balance = COALESCE(fxu_balance, 0) + v_commission_amount 
        WHERE id = v_referrer_id;
      ELSIF p_payment_type = 'usdt' THEN
        UPDATE profiles 
        SET usdt_balance = COALESCE(usdt_balance, 0) + v_commission_amount 
        WHERE id = v_referrer_id;
      END IF;

      -- Record in referral_commissions table
      -- Note: 'amount' is bigint (integers only), use fxu_amount (numeric) for exact decimal value
      INSERT INTO referral_commissions (
        referrer_id, seller_id, transaction_id, 
        commission_type, resource_type, amount, fxu_amount
      )
      VALUES (
        v_referrer_id, 
        v_user_id,       -- the buyer (referred user)
        NULL,            -- no market transaction
        'plus_subscription', 
        p_payment_type,  -- 'fxu' or 'usdt'
        FLOOR(v_commission_amount)::bigint,  -- bigint column: truncate to integer
        v_commission_amount                   -- numeric column: exact value with decimals
      );

      -- Send notification message to referrer
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
