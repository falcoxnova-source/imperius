-- ============================================================================
-- FIX: purchase_plus_subscription - 2 bugs:
-- 1. Faltaba _internal_set_fxu_context() → trigger bloqueaba UPDATE fxu_balance
-- 2. INSERT usaba columnas incorrectas: "type" → "revenue_type", "user_id" → "related_user_id"
-- 3. Agregar 'plus_subscription' al CHECK constraint de admin_revenue
-- ============================================================================

-- Primero: agregar los tipos de revenue permitidos
ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee', 'withdrawal_fee', 'instant_build', 'instant_research',
    'instant_ship', 'referral_bonus', 'officer_fxu', 'expedition_fee',
    'supply_box', 'fleet_acceleration', 'swap_fee', 'transfer_fee',
    'plus_subscription', 'colony_abandon', 'other'
  ]));

-- Ahora: recrear la función con los fixes
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

  -- FIX 1: Desbloquear el trigger de protección de fxu_balance
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
    
    -- FIX 2: Columnas correctas: revenue_type + related_user_id (no type + user_id)
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
    
    -- FIX 2: Columnas correctas
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

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Suscripcion Plus activada hasta ' || to_char(v_expires_at, 'DD/MM/YYYY'),
    'subscription_id', v_sub_id,
    'expires_at', v_expires_at
  );
END;
$$;
