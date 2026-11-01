-- =====================================================================
-- P2P: KYC obligatorio para crear ofertas + expiracion 72h (VIP exento)
-- Fecha: 2026-05-14
-- Requisitos:
--   * Crear oferta (SELL o BUY) exige KYC aprobado. Comprar (aceptar) NO.
--   * Las ofertas se auto-cancelan a las 72h desde su creacion, EXCEPTO
--     las de usuarios con VIP activo (plus_subscriptions activa).
--   * Se mantiene soporte de TUNG y USDT como activos vendibles.
-- Notas:
--   * VIP = fila activa en plus_subscriptions (is_active AND expires_at > now()).
--   * Reutiliza p2p_expire_stale_offers (ya prueba refund de escrow) via
--     expires_at: no-VIP = now()+72h, VIP = futuro lejano (nunca expira).
--   * Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.p2p_create_offer(
  p_side text,
  p_asset text,
  p_fiat_currency text,
  p_price_per_unit numeric,
  p_total_amount numeric,
  p_min_trade_amount numeric DEFAULT 0,
  p_max_trade_amount numeric DEFAULT NULL::numeric,
  p_payment_method_ids integer[] DEFAULT '{}'::integer[],
  p_terms text DEFAULT NULL::text,
  p_country_code text DEFAULT NULL::text,
  p_time_limit_minutes integer DEFAULT 1440
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer_id uuid;
  v_fxu numeric;
  v_usdt numeric;
  v_kyc text;
  v_valid_methods int;
  v_side text := upper(coalesce(p_side,''));
  v_asset text := upper(coalesce(p_asset,''));
  v_fiat text := upper(coalesce(p_fiat_currency,''));
  v_internal_fiat boolean;
  v_is_vip boolean;
  v_expires_at timestamptz;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  -- Normalizacion de marca: TUNG (token del juego) == FXU (columna interna,
  -- espejada por trigger). Aceptamos ambos alias y almacenamos 'FXU'.
  IF v_asset = 'TUNG' THEN v_asset := 'FXU'; END IF;
  IF v_fiat  = 'TUNG' THEN v_fiat  := 'FXU'; END IF;

  IF v_side NOT IN ('SELL','BUY') THEN
    RAISE EXCEPTION 'side invalido';
  END IF;

  IF v_asset NOT IN ('FXU','USDT') THEN
    RAISE EXCEPTION 'Asset invalido';
  END IF;

  IF p_price_per_unit <= 0 OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Precio y monto deben ser > 0';
  END IF;

  IF p_min_trade_amount < 0 OR (p_max_trade_amount IS NOT NULL AND p_max_trade_amount <= 0) THEN
    RAISE EXCEPTION 'Min/Max trade invalidos';
  END IF;

  IF p_max_trade_amount IS NOT NULL AND p_max_trade_amount < p_min_trade_amount THEN
    RAISE EXCEPTION 'max_trade_amount debe ser >= min_trade_amount';
  END IF;

  IF p_time_limit_minutes < 5 OR p_time_limit_minutes > 1440 THEN
    RAISE EXCEPTION 'time_limit_minutes fuera de rango';
  END IF;

  IF array_length(p_payment_method_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Debes seleccionar al menos 1 metodo de pago';
  END IF;

  SELECT count(*) INTO v_valid_methods
  FROM p2p_payment_methods
  WHERE is_enabled = true
    AND id = ANY(p_payment_method_ids)
    AND upper(currency_code) = v_fiat;

  IF v_valid_methods <> array_length(p_payment_method_ids,1) THEN
    RAISE EXCEPTION 'Hay metodos de pago invalidos/deshabilitados o no corresponden a la moneda fiat';
  END IF;

  v_internal_fiat := v_fiat IN ('FXU','USDT');

  SELECT fxu_balance, usdt_balance, kyc_status
    INTO v_fxu, v_usdt, v_kyc
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;

  -- === KYC obligatorio para CREAR ofertas (venta o compra) ===
  IF coalesce(v_kyc,'none') <> 'approved' THEN
    RAISE EXCEPTION 'Debes completar la verificacion KYC y tenerla aprobada para crear ofertas en el P2P.';
  END IF;

  IF v_side = 'SELL' THEN
    IF v_asset = 'FXU' THEN
      IF coalesce(v_fxu,0) < p_total_amount THEN RAISE EXCEPTION 'Saldo TUNG insuficiente'; END IF;
      UPDATE profiles SET fxu_balance = fxu_balance - p_total_amount WHERE id = v_user_id;
    ELSE
      IF coalesce(v_usdt,0) < p_total_amount THEN RAISE EXCEPTION 'Saldo USDT insuficiente'; END IF;
      UPDATE profiles SET usdt_balance = usdt_balance - p_total_amount WHERE id = v_user_id;
    END IF;
  ELSE
    -- BUY: solo bloquear cuando fiat es interno
    IF v_internal_fiat THEN
      IF v_fiat = 'FXU' THEN
        IF coalesce(v_fxu,0) < (p_total_amount * p_price_per_unit) THEN
          RAISE EXCEPTION 'Saldo TUNG insuficiente para BUY';
        END IF;
        UPDATE profiles SET fxu_balance = fxu_balance - (p_total_amount * p_price_per_unit) WHERE id = v_user_id;
      ELSE
        IF coalesce(v_usdt,0) < (p_total_amount * p_price_per_unit) THEN
          RAISE EXCEPTION 'Saldo USDT insuficiente para BUY';
        END IF;
        UPDATE profiles SET usdt_balance = usdt_balance - (p_total_amount * p_price_per_unit) WHERE id = v_user_id;
      END IF;
    END IF;
  END IF;

  -- === VIP -> expiracion ===
  -- VIP activo = suscripcion Plus vigente. Las ofertas VIP no se auto-cancelan
  -- (expiran en un futuro lejano). Las de no-VIP expiran a las 72h.
  SELECT EXISTS (
    SELECT 1 FROM plus_subscriptions
    WHERE user_id = v_user_id
      AND is_active = true
      AND expires_at > now()
  ) INTO v_is_vip;

  v_expires_at := CASE
    WHEN v_is_vip THEN now() + interval '100 years'
    ELSE now() + interval '72 hours'
  END;

  INSERT INTO p2p_offers (
    user_id, side, asset, fiat_currency,
    price_per_unit, total_amount, available_amount, locked_amount,
    min_trade_amount, max_trade_amount, payment_method_ids,
    terms, country_code, time_limit_minutes, status, expires_at
  ) VALUES (
    v_user_id, lower(v_side), v_asset, v_fiat,
    p_price_per_unit, p_total_amount, p_total_amount, p_total_amount,
    coalesce(p_min_trade_amount,0), p_max_trade_amount, p_payment_method_ids,
    p_terms, p_country_code, p_time_limit_minutes, 'active', v_expires_at
  ) RETURNING id INTO v_offer_id;

  INSERT INTO p2p_audit_log(offer_id, actor_id, action, meta)
  VALUES (
    v_offer_id,
    v_user_id,
    'offer_created',
    jsonb_build_object(
      'side', lower(v_side),
      'asset', v_asset,
      'fiat_currency', v_fiat,
      'internal_fiat', v_internal_fiat,
      'amount', p_total_amount,
      'is_vip', v_is_vip,
      'expires_at', v_expires_at
    )
  );

  RETURN v_offer_id;
END;
$function$;

-- =====================================================================
-- Programar auto-cancelacion (expiracion) de ofertas via pg_cron cada 15 min.
-- p2p_expire_stale_offers ya devuelve el escrow y saca del libro las ofertas
-- cuyo expires_at <= now(). Como las ofertas VIP tienen expires_at lejano,
-- nunca seran tocadas.
-- =====================================================================
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Quitar cualquier job previo que ejecute esta funcion (evita duplicados)
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE command ILIKE '%p2p_expire_stale_offers%';

    PERFORM cron.schedule(
      'p2p_expire_offers_every_15min',
      '*/15 * * * *',
      'SELECT public.p2p_expire_stale_offers();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END
$cron$;
