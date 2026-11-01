-- ============================================================================
-- Dynamic TUNG pricing for Plus + Officers (live DexScreener price)
--
-- Goal (request):
--   * Plus and Officers have a price set in USDT.
--   * They are paid ONLY in TUNG. The TUNG amount is computed from the LIVE
--     TUNG price at purchase time: tung = ceil(usdt_price / live_tung_price).
--   * Buying officers with Dark Matter (materia oscura) is disabled.
--
-- Security:
--   * The live price is fetched by the existing `token-price` edge function from
--     DexScreener and stored server-side in game_settings (key 'tung_price_usd')
--     via set_live_tung_price() using the service role. The client can NEVER
--     set this value, so the charged amount cannot be falsified.
--   * Purchase RPCs read the live price via get_live_tung_price_usd(). If the
--     price is missing or stale (> 60 min) the purchase is rejected.
--
-- Constraints honored:
--   * No tables/functions renamed. Existing structures reused (game_settings,
--     token-price, purchase_* / admin_* function names unchanged).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Officers: add USDT price columns (paid in TUNG, priced in USDT)
-- ----------------------------------------------------------------------------
ALTER TABLE officer_types ADD COLUMN IF NOT EXISTS usdt_cost_7d  numeric DEFAULT 0;
ALTER TABLE officer_types ADD COLUMN IF NOT EXISTS usdt_cost_30d numeric DEFAULT 0;
ALTER TABLE officer_types ADD COLUMN IF NOT EXISTS usdt_cost_90d numeric DEFAULT 0;

-- Seed initial USDT prices from the previous fixed-rate TUNG costs (1 TUNG = $0.0001),
-- only where not already configured. Admin can adjust afterwards.
UPDATE officer_types
SET
  usdt_cost_7d  = ROUND(COALESCE(fxu_cost_7d, 0)  * 0.0001, 2),
  usdt_cost_30d = ROUND(COALESCE(fxu_cost_30d, 0) * 0.0001, 2),
  usdt_cost_90d = ROUND(COALESCE(fxu_cost_90d, 0) * 0.0001, 2)
WHERE COALESCE(usdt_cost_7d, 0) = 0
  AND COALESCE(usdt_cost_30d, 0) = 0
  AND COALESCE(usdt_cost_90d, 0) = 0;

-- ----------------------------------------------------------------------------
-- 2) Live TUNG price storage (reuses game_settings)
-- ----------------------------------------------------------------------------

-- Writer: only the service role (edge function) may set the live price.
CREATE OR REPLACE FUNCTION set_live_tung_price(p_price numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_price IS NULL OR p_price <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO game_settings (key, value, description, updated_at)
  VALUES (
    'tung_price_usd',
    p_price::text,
    'Live TUNG price in USD (DexScreener, auto-updated by token-price edge function)',
    now()
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION set_live_tung_price(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_live_tung_price(numeric) FROM anon;
REVOKE ALL ON FUNCTION set_live_tung_price(numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_live_tung_price(numeric) TO service_role;

-- Reader: returns the live price if fresh (< 60 min), otherwise NULL.
CREATE OR REPLACE FUNCTION get_live_tung_price_usd()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value text;
  v_updated timestamptz;
  v_price numeric;
BEGIN
  SELECT value, updated_at INTO v_value, v_updated
  FROM game_settings
  WHERE key = 'tung_price_usd';

  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  -- Reject stale prices (older than 60 minutes)
  IF v_updated IS NULL OR v_updated < now() - interval '60 minutes' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_price := v_value::numeric;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN NULL;
  END IF;

  RETURN v_price;
END;
$$;

GRANT EXECUTE ON FUNCTION get_live_tung_price_usd() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) Officers: purchase with TUNG at the live price (dynamic)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_officer_with_fxu(p_officer_type_id uuid, p_duration text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_officer officer_types%ROWTYPE;
  v_usdt_cost numeric;
  v_live_price numeric;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_days_to_add integer;
  v_existing_officer user_officers%ROWTYPE;
  v_new_expiry timestamptz;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_existing_officer
  FROM user_officers
  WHERE user_id = v_user_id
  AND officer_type_id = p_officer_type_id
  AND expires_at > NOW();

  IF v_existing_officer IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer is still active. Wait until it expires to purchase again.');
  END IF;

  SELECT * INTO v_officer FROM officer_types WHERE id = p_officer_type_id;
  IF v_officer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer type not found');
  END IF;

  -- USDT price by duration
  CASE p_duration
    WHEN '7d' THEN
      v_usdt_cost := v_officer.usdt_cost_7d;
      v_days_to_add := 7;
    WHEN '30d' THEN
      v_usdt_cost := v_officer.usdt_cost_30d;
      v_days_to_add := 30;
    WHEN '90d' THEN
      v_usdt_cost := v_officer.usdt_cost_90d;
      v_days_to_add := 90;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid duration');
  END CASE;

  IF v_usdt_cost IS NULL OR v_usdt_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio no configurado para este oficial');
  END IF;

  -- Live TUNG price (server-side, cannot be falsified by client)
  v_live_price := get_live_tung_price_usd();
  IF v_live_price IS NULL OR v_live_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio de TUNG no disponible, intenta de nuevo en unos segundos');
  END IF;

  -- TUNG amount, rounded up so we never undercharge
  v_fxu_cost := CEIL(v_usdt_cost / v_live_price);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient TUNG balance');
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles
  SET fxu_balance = fxu_balance - v_fxu_cost
  WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
  VALUES (
    'officer_fxu',
    v_fxu_cost,
    v_user_id,
    'Officer: ' || v_officer.name || ' (' || p_duration || ', $' || v_usdt_cost || ' USDT)'
  );

  v_new_expiry := NOW() + (v_days_to_add || ' days')::interval;

  DELETE FROM user_officers
  WHERE user_id = v_user_id
  AND officer_type_id = p_officer_type_id;

  INSERT INTO user_officers (user_id, officer_type_id, expires_at)
  VALUES (v_user_id, p_officer_type_id, v_new_expiry);

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expiry,
    'fxu_spent', v_fxu_cost
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4) Officers: Dark Matter purchase disabled (officers are TUNG-only now)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_officer_with_dark_matter(p_officer_type_id uuid, p_duration text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'La compra de oficiales con Materia Oscura esta deshabilitada. Usa TUNG.'
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5) Plus: TUNG (fxu) path charges the live-price-derived TUNG amount
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_plus_subscription(p_plan_code text, p_payment_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_plan plus_plans%ROWTYPE;
  v_price numeric;
  v_live_price numeric;
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
    -- TUNG amount derived from the USDT price at the live TUNG price
    v_live_price := get_live_tung_price_usd();
    IF v_live_price IS NULL OR v_live_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Precio de TUNG no disponible, intenta de nuevo en unos segundos');
    END IF;

    IF v_plan.price_usdt IS NULL OR v_plan.price_usdt <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Precio del plan no configurado');
    END IF;

    v_price := CEIL(v_plan.price_usdt / v_live_price);

    SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

    IF v_current_fxu IS NULL OR v_current_fxu < v_price THEN
      RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente. Necesitas ' || v_price || ' TUNG');
    END IF;

    UPDATE profiles SET fxu_balance = fxu_balance - v_price WHERE id = v_user_id;

    INSERT INTO public.admin_revenue (revenue_type, amount, currency, related_user_id, description)
    VALUES ('plus_subscription', v_price, 'FXU', v_user_id, 'Plus ' || v_plan.name || ' ($' || v_plan.price_usdt || ' USDT en TUNG)');

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
$function$;

-- ----------------------------------------------------------------------------
-- 6) Admin officer pricing: include USDT costs in get + bulk update
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_officer_pricing()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_officers jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sub.id, 'code', sub.code, 'name', sub.name,
    'dark_matter_cost_7d', sub.dark_matter_cost_7d,
    'dark_matter_cost_30d', sub.dark_matter_cost_30d,
    'dark_matter_cost_90d', sub.dark_matter_cost_90d,
    'fxu_cost_7d', sub.fxu_cost_7d,
    'fxu_cost_30d', sub.fxu_cost_30d,
    'fxu_cost_90d', sub.fxu_cost_90d,
    'usdt_cost_7d', sub.usdt_cost_7d,
    'usdt_cost_30d', sub.usdt_cost_30d,
    'usdt_cost_90d', sub.usdt_cost_90d,
    'sort_order', sub.sort_order
  ) ORDER BY sub.sort_order), '[]'::jsonb) INTO v_officers
  FROM (SELECT * FROM officer_types) sub;

  RETURN jsonb_build_object('success', true, 'officers', v_officers);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_bulk_update_officer_pricing(p_pricing jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_item jsonb;
  v_updated_count integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_pricing)
  LOOP
    UPDATE officer_types
    SET
      dark_matter_cost_7d = (v_item->>'dark_matter_cost_7d')::integer,
      dark_matter_cost_30d = (v_item->>'dark_matter_cost_30d')::integer,
      dark_matter_cost_90d = (v_item->>'dark_matter_cost_90d')::integer,
      fxu_cost_7d = (v_item->>'fxu_cost_7d')::integer,
      fxu_cost_30d = (v_item->>'fxu_cost_30d')::integer,
      fxu_cost_90d = (v_item->>'fxu_cost_90d')::integer,
      usdt_cost_7d = COALESCE((v_item->>'usdt_cost_7d')::numeric, usdt_cost_7d),
      usdt_cost_30d = COALESCE((v_item->>'usdt_cost_30d')::numeric, usdt_cost_30d),
      usdt_cost_90d = COALESCE((v_item->>'usdt_cost_90d')::numeric, usdt_cost_90d)
    WHERE id = (v_item->>'id')::uuid;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
END;
$function$;
