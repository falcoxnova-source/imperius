-- =====================================================================
-- SEC-2026-09-13  Endurecimiento de seguridad XNova
-- Idempotente y transaccional. NO cambia logica de negocio.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. OCULTAR BALANCE DE TESORERIA DEL ADMIN
--    Mantiene grant (el panel admin la usa) pero exige is_admin.
--    Los no-admin reciben excepcion; el frontend ya la captura -> 0.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_available_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_revenue_tung numeric;
  v_total_withdrawn    numeric;
  v_total_expenses     numeric;
  v_jwt_role           text;
BEGIN
  -- SEC_ADMIN_GUARD: solo administradores o service_role
  v_jwt_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');

  IF v_jwt_role <> 'service_role' THEN
    IF auth.uid() IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.profiles
                      WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN currency = 'USDT' THEN amount * 10000 ELSE amount END), 0)
  INTO v_total_revenue_tung
  FROM public.admin_revenue;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_withdrawn
  FROM public.admin_withdrawals
  WHERE status IN ('pending', 'processing', 'confirmed');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_expenses
  FROM public.admin_expenses;

  RETURN GREATEST(v_total_revenue_tung - v_total_withdrawn - v_total_expenses, 0);
END;
$function$;


-- ---------------------------------------------------------------------
-- 2. launch_missiles: exigir que el planeta de origen sea del jugador
--    (parche quirurgico sobre el cuerpo existente)
-- ---------------------------------------------------------------------
DO $mig$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'launch_missiles'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('SEC_OWNER_GUARD' in v_def) = 0
       AND position('v_attacker_id := v_origin_planet.owner_id;' in v_def) > 0 THEN
      v_def := replace(
        v_def,
        'v_attacker_id := v_origin_planet.owner_id;',
        'v_attacker_id := v_origin_planet.owner_id;'
        || E'\n\n  -- SEC_OWNER_GUARD\n  IF auth.uid() IS NOT NULL AND v_attacker_id IS DISTINCT FROM auth.uid() THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Planeta de origen no encontrado'');\n  END IF;\n'
      );
      EXECUTE v_def;
      RAISE NOTICE 'launch_missiles: guard de propiedad aplicado';
    ELSE
      RAISE NOTICE 'launch_missiles: sin cambios';
    END IF;
  END LOOP;
END
$mig$;


-- ---------------------------------------------------------------------
-- 3. get_hero_ship: bloquear IDOR (solo tu propio usuario)
-- ---------------------------------------------------------------------
DO $mig$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_hero_ship'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('SEC_IDOR_GUARD' in v_def) = 0
       AND position('PERFORM create_hero_ship(p_user_id);' in v_def) > 0 THEN
      v_def := replace(
        v_def,
        'PERFORM create_hero_ship(p_user_id);',
        '-- SEC_IDOR_GUARD'
        || E'\n  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN\n    RAISE EXCEPTION ''unauthorized'' USING ERRCODE = ''42501'';\n  END IF;\n  PERFORM create_hero_ship(p_user_id);'
      );
      EXECUTE v_def;
      RAISE NOTICE 'get_hero_ship: guard IDOR aplicado';
    ELSE
      RAISE NOTICE 'get_hero_ship: sin cambios';
    END IF;
  END LOOP;
END
$mig$;


-- ---------------------------------------------------------------------
-- 4. process_telegram_leave: la penalizacion nunca deja saldo negativo
--    (conserva la logica: revoca la recompensa, pero con tope en 0)
-- ---------------------------------------------------------------------
DO $mig$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'process_telegram_leave'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('SEC_NO_NEGATIVE' in v_def) = 0
       AND position('v_new_balance := v_old_balance - v_reward_amount;' in v_def) > 0 THEN
      v_def := replace(
        v_def,
        'v_new_balance := v_old_balance - v_reward_amount;',
        '-- SEC_NO_NEGATIVE: la penalizacion no puede dejar el saldo por debajo de 0'
        || E'\n    v_new_balance := GREATEST(COALESCE(v_old_balance, 0) - v_reward_amount, 0);'
      );
      EXECUTE v_def;
      RAISE NOTICE 'process_telegram_leave: tope en 0 aplicado';
    ELSE
      RAISE NOTICE 'process_telegram_leave: sin cambios';
    END IF;
  END LOOP;
END
$mig$;


-- ---------------------------------------------------------------------
-- 5. CERRAR FUNCIONES INTERNAS / CRON / CRYPTO AL PUBLICO
--    Se revoca de PUBLIC, anon y authenticated; se garantiza a
--    service_role y postgres (Edge Functions y pg_cron siguen igual).
--    EXCLUIDAS a proposito (dependencia de purchase_market_listing):
--      _internal_set_fxu_context, update_planet_resources
-- ---------------------------------------------------------------------
DO $mig$
DECLARE
  r record;
  v_targets text[] := ARRAY[
    -- Precio del token (solo Edge Function token-price / cron)
    'set_live_tung_price','refresh_tung_price','refresh_tung_price_from_dex','tung_price_health',
    -- Bypass de guard tokens
    'set_fxu_update_context',
    -- Retiros crypto (ningun cliente los llama)
    'mark_withdrawal_signed','confirm_contract_withdrawal','prepare_withdrawal_for_signing',
    -- Sabotaje / juego
    'safe_deduct_resources','stronghold_release','bot_ai_tick',
    -- Telegram (solo Edge Functions)
    'process_telegram_leave',
    -- Enumeracion de usuarios (solo Edge Function de reset)
    'get_user_by_email','get_user_by_email_for_verification',
    -- Tesoreria / ingresos
    'take_weekly_revenue_snapshot',
    -- Config interna
    'get_contract_config',
    -- IDOR duelos (no usada por el cliente)
    'get_my_hero_duel',
    -- Cron / mantenimiento
    'batch_update_player_points','process_all_user_shipyard_queues','p2p_expire_stale_offers',
    'global_process_all_expired_queues','process_all_pending_fleets',
    'optimized_global_queue_processor','process_all_research_completion',
    'clean_all_expired_cosmetics','update_all_ranks','recalculate_all_player_points',
    'auto_cancel_insufficient_listings'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = ANY(v_targets)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', r.sig);
    RAISE NOTICE 'cerrada: %', r.sig;
  END LOOP;
END
$mig$;


-- ---------------------------------------------------------------------
-- 6. SALDOS NEGATIVOS: normalizar a 0 y blindar con CHECK
-- ---------------------------------------------------------------------
-- 6a. Registrar el estado previo (auditoria)
CREATE TABLE IF NOT EXISTS public.sec_negative_balance_fix (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL,
  username      text,
  old_fxu       numeric,
  old_tung      numeric,
  fixed_at      timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.sec_negative_balance_fix FROM PUBLIC, anon, authenticated;

INSERT INTO public.sec_negative_balance_fix (user_id, username, old_fxu, old_tung)
SELECT id, username, fxu_balance, tung_balance
FROM public.profiles
WHERE fxu_balance < 0 OR tung_balance < 0;

-- 6b. Normalizar (el trigger sync_tung_balance replica a tung_balance)
UPDATE public.profiles
SET fxu_balance  = GREATEST(COALESCE(fxu_balance, 0), 0),
    tung_balance = GREATEST(COALESCE(tung_balance, 0), 0)
WHERE fxu_balance < 0 OR tung_balance < 0;

-- 6c. Constraints de no-negatividad
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.profiles'::regclass
                   AND conname = 'profiles_fxu_balance_non_negative') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_fxu_balance_non_negative CHECK (fxu_balance >= 0);
    RAISE NOTICE 'CHECK fxu_balance >= 0 creado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.profiles'::regclass
                   AND conname = 'profiles_tung_balance_non_negative') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_tung_balance_non_negative CHECK (tung_balance >= 0);
    RAISE NOTICE 'CHECK tung_balance >= 0 creado';
  END IF;
END
$mig$;

COMMIT;
