-- =====================================================================
-- Panel admin > Inventario por Cuenta
-- Anade la posibilidad de QUITAR TUNG y de AGREGAR/QUITAR USDT.
--
-- No modifica ninguna funcion existente. Solo crea 3 RPC nuevas que
-- son copias simetricas de admin_credit_user_tokens (misma validacion
-- de admin, mismo guard de los triggers de proteccion y mismo registro
-- de auditoria en wallet_transactions).
--
-- Notas de esquema verificadas en produccion:
--   * profiles.fxu_balance es el saldo REAL de TUNG.
--     El trigger sync_tung_balance copia fxu_balance -> tung_balance.
--   * Los triggers protect_fxu_balance y protect_sensitive_profile_columns
--     exigen set_config('fxu.allow_update_9x7k2m','true',true).
--   * profiles.usdt_balance tiene CHECK (usdt_balance >= 0).
--   * wallet_transactions: amount > 0, fxu_amount > 0,
--     tx_type IN ('deposit','withdrawal'), token_type IN ('TUNG','USDT').
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) QUITAR TUNG
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_debit_user_tokens(
  p_user_id uuid,
  p_amount  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id    uuid;
  v_is_admin    boolean;
  v_old_balance numeric;
  v_new_balance numeric;
  v_username    text;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado: solo admin');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El monto debe ser mayor que 0');
  END IF;

  SELECT fxu_balance, username INTO v_old_balance, v_username
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  IF COALESCE(v_old_balance, 0) < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Saldo insuficiente: el jugador tiene ' || COALESCE(v_old_balance, 0)::text || ' TUNG'
    );
  END IF;

  v_new_balance := COALESCE(v_old_balance, 0) - p_amount;

  -- Auditoria primero para que log_fxu_movement pueda categorizar el movimiento
  INSERT INTO wallet_transactions (
    user_id, tx_hash, tx_type, amount, fxu_amount, wallet_address,
    status, confirmations, token_type, processed_at
  ) VALUES (
    p_user_id, 'admindebit-' || gen_random_uuid()::text, 'withdrawal',
    p_amount, p_amount, 'ADMIN_DEBIT',
    'confirmed', 0, 'TUNG', now()
  );

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  UPDATE profiles
  SET fxu_balance = v_new_balance,
      updated_at  = now()
  WHERE id = p_user_id;
  PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'username', v_username,
    'amount_debited', p_amount,
    'old_balance', COALESCE(v_old_balance, 0),
    'new_balance', v_new_balance
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) AGREGAR USDT
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_credit_user_usdt(
  p_user_id uuid,
  p_amount  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id    uuid;
  v_is_admin    boolean;
  v_old_balance numeric;
  v_new_balance numeric;
  v_username    text;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado: solo admin');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El monto debe ser mayor que 0');
  END IF;

  SELECT usdt_balance, username INTO v_old_balance, v_username
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  v_new_balance := COALESCE(v_old_balance, 0) + p_amount;

  INSERT INTO wallet_transactions (
    user_id, tx_hash, tx_type, amount, fxu_amount, wallet_address,
    status, confirmations, token_type, processed_at
  ) VALUES (
    p_user_id, 'admincreditusdt-' || gen_random_uuid()::text, 'deposit',
    p_amount, p_amount, 'ADMIN_CREDIT',
    'confirmed', 0, 'USDT', now()
  );

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  UPDATE profiles
  SET usdt_balance = v_new_balance,
      updated_at   = now()
  WHERE id = p_user_id;
  PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'username', v_username,
    'amount_credited', p_amount,
    'old_balance', COALESCE(v_old_balance, 0),
    'new_balance', v_new_balance
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) QUITAR USDT
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_debit_user_usdt(
  p_user_id uuid,
  p_amount  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id    uuid;
  v_is_admin    boolean;
  v_old_balance numeric;
  v_new_balance numeric;
  v_username    text;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado: solo admin');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El monto debe ser mayor que 0');
  END IF;

  SELECT usdt_balance, username INTO v_old_balance, v_username
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  IF COALESCE(v_old_balance, 0) < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Saldo insuficiente: el jugador tiene ' || COALESCE(v_old_balance, 0)::text || ' USDT'
    );
  END IF;

  v_new_balance := COALESCE(v_old_balance, 0) - p_amount;

  INSERT INTO wallet_transactions (
    user_id, tx_hash, tx_type, amount, fxu_amount, wallet_address,
    status, confirmations, token_type, processed_at
  ) VALUES (
    p_user_id, 'admindebitusdt-' || gen_random_uuid()::text, 'withdrawal',
    p_amount, p_amount, 'ADMIN_DEBIT',
    'confirmed', 0, 'USDT', now()
  );

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  UPDATE profiles
  SET usdt_balance = v_new_balance,
      updated_at   = now()
  WHERE id = p_user_id;
  PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'username', v_username,
    'amount_debited', p_amount,
    'old_balance', COALESCE(v_old_balance, 0),
    'new_balance', v_new_balance
  );
END;
$function$;

-- Mismos permisos que admin_credit_user_tokens
GRANT EXECUTE ON FUNCTION public.admin_debit_user_tokens(uuid, numeric)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_credit_user_usdt(uuid, numeric)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_debit_user_usdt(uuid, numeric)    TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
