-- [ROULETTE1] Ruleta europea (0-36) del Casino Galactico, en TUNG.
--   * Solo cuentas de hero_access_allowlist (kingpipolol / jennierfs) y con la
--     Nave Insignia ESTACIONADA en el Casino (_casino_can_enter).
--   * Fee 20% descontado de la apuesta: 10% -> pools del jackpot, 10% -> empresa.
--     Del tramo empresa, 20% al referido (si tiene); el resto es ingreso de empresa
--     (record_admin_revenue -> dashboard financiero + reparto a accionistas).
--   * Se juega el 80% restante. Pagos (incluyen lo jugado): pleno x36, color/par-impar x2, docena x3.
--   * Ningun premio posible de una tirada puede superar el 10% del banco.
--   * Numero generado en el servidor con pgcrypto (gen_random_bytes, sin sesgo).
--   * Tablas con RLS y sin politicas: el cliente no puede leer ni escribir directo.
--   * NO se publica nada en realtime.
\set ON_ERROR_STOP on
BEGIN;

-- 1) Nuevo tipo de ingreso en el ledger financiero (misma lista + 'casino_roulette')
ALTER TABLE public.admin_revenue DROP CONSTRAINT admin_revenue_revenue_type_check;
ALTER TABLE public.admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check CHECK (revenue_type = ANY (ARRAY[
  'market_fee','withdrawal_fee','instant_build','instant_research','instant_ship','referral_bonus',
  'officer_fxu','expedition_fee','supply_box','fleet_acceleration','swap_fee','transfer_fee',
  'plus_subscription','colony_abandon','planet_rename','alliance_rename','alliance_creation',
  'lottery_fee','p2p_fee','blueprint_sale','hero_respec','hero_kit_sale','other','premium_mission',
  'hero_duel','daily_streak','deposit_gas_buffer','instant_unit_sale','casino_roulette'
]::text[]));

-- 2) Tablas
CREATE TABLE IF NOT EXISTS public.casino_roulette_bank (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance         numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  pool_pending    numeric NOT NULL DEFAULT 0 CHECK (pool_pending >= 0),
  enabled         boolean NOT NULL DEFAULT true,
  total_seeded    numeric NOT NULL DEFAULT 0,
  total_withdrawn numeric NOT NULL DEFAULT 0,
  total_wagered   numeric NOT NULL DEFAULT 0,
  total_fees      numeric NOT NULL DEFAULT 0,
  total_paid      numeric NOT NULL DEFAULT 0,
  total_spins     bigint  NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.casino_roulette_spins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bets           jsonb NOT NULL,
  total_bet      numeric NOT NULL CHECK (total_bet > 0),
  fee            numeric NOT NULL CHECK (fee >= 0),
  stake          numeric NOT NULL CHECK (stake >= 0),
  result         smallint NOT NULL CHECK (result BETWEEN 0 AND 36),
  color          text NOT NULL CHECK (color IN ('green','red','black')),
  payout         numeric NOT NULL CHECK (payout >= 0),
  pool_share     numeric NOT NULL DEFAULT 0,
  company_share  numeric NOT NULL DEFAULT 0,
  referrer_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  referrer_share numeric NOT NULL DEFAULT 0,
  bank_after     numeric NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS casino_roulette_spins_user_idx ON public.casino_roulette_spins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS casino_roulette_spins_wins_idx ON public.casino_roulette_spins (created_at DESC) WHERE payout > 0;

CREATE TABLE IF NOT EXISTS public.casino_roulette_bank_moves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('seed','deposit','withdraw','enable','disable')),
  amount     numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  admin_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  bank_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.casino_roulette_bank       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_roulette_spins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_roulette_bank_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.casino_roulette_bank, public.casino_roulette_spins, public.casino_roulette_bank_moves FROM PUBLIC, anon, authenticated, authenticator;

-- 3) Multiplicador de una apuesta para un numero (0 = pierde). Interno.
CREATE OR REPLACE FUNCTION public._roulette_payout_mult(p_type text, p_value integer, p_n integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_type = 'straight' AND p_n = p_value THEN 36
    WHEN p_type = 'red'   AND p_n = ANY (ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]) THEN 2
    WHEN p_type = 'black' AND p_n BETWEEN 1 AND 36
         AND NOT (p_n = ANY (ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])) THEN 2
    WHEN p_type = 'even'  AND p_n BETWEEN 1 AND 36 AND p_n % 2 = 0 THEN 2
    WHEN p_type = 'odd'   AND p_n BETWEEN 1 AND 36 AND p_n % 2 = 1 THEN 2
    WHEN p_type = 'dozen' AND p_value BETWEEN 1 AND 3
         AND p_n BETWEEN (p_value - 1) * 12 + 1 AND p_value * 12 THEN 3
    ELSE 0
  END;
$$;
REVOKE ALL ON FUNCTION public._roulette_payout_mult(text, integer, integer) FROM PUBLIC, anon, authenticated;

-- 4) Tirada
CREATE OR REPLACE FUNCTION public.casino_roulette_spin(p_bets jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_min_bet         constant numeric := 10;
  c_max_bet_each    constant numeric := 10000000;
  c_max_bets        constant integer := 40;
  c_fee_rate        constant numeric := 0.20;
  c_pool_rate       constant numeric := 0.10;
  c_ref_rate        constant numeric := 0.20;  -- del tramo empresa
  c_max_payout_rate constant numeric := 0.10;  -- del banco
  v_uid        uuid := auth.uid();
  v_bank       public.casino_roulette_bank%ROWTYPE;
  v_balance    numeric;
  v_last       timestamptz;
  v_elem       jsonb;
  v_type       text;
  v_num        numeric;
  v_val        integer;
  v_amt        numeric;
  v_types      text[]    := ARRAY[]::text[];
  v_vals       integer[] := ARRAY[]::integer[];
  v_amts       numeric[] := ARRAY[]::numeric[];
  v_total      numeric := 0;
  v_fee        numeric;
  v_stake      numeric;
  v_pool       numeric;
  v_company    numeric;
  v_ref_share  numeric := 0;
  v_admin_share numeric;
  v_n          integer;
  i            integer;
  v_m          integer;
  v_p          numeric;
  v_max_payout numeric := 0;
  v_limit      numeric;
  v_bytes      bytea;
  v_r          bigint;
  v_result     integer;
  v_color      text;
  v_payout     numeric := 0;
  v_win_idx    integer[] := ARRAY[]::integer[];
  v_referrer   uuid;
  v_admin_id   uuid;
  v_flush      numeric;
  v_pending    numeric;
  v_bank_after numeric;
  v_new_bal    numeric;
  v_spin_id    uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Acceso: solo allowlist (no depende de hero_ship_public)
  IF NOT EXISTS (SELECT 1 FROM public.hero_access_allowlist WHERE user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La ruleta no esta disponible');
  END IF;

  -- Nave Insignia estacionada en el Casino (siempre obligatorio para la ruleta)
  IF NOT public._casino_can_enter(v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Para jugar debes tener tu Nave Insignia estacionada en el Casino Galactico');
  END IF;

  -- Validacion estricta de apuestas (todo se recalcula aqui; el cliente no decide nada)
  IF p_bets IS NULL OR jsonb_typeof(p_bets) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_bets) < 1 OR jsonb_array_length(p_bets) > c_max_bets THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apuesta invalida (1 a ' || c_max_bets || ' apuestas por tirada)');
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_bets) LOOP
    IF jsonb_typeof(v_elem) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_elem -> 'amount') IS DISTINCT FROM 'number' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Apuesta invalida');
    END IF;

    v_type := v_elem ->> 'type';
    v_amt  := (v_elem ->> 'amount')::numeric;
    IF v_amt <> trunc(v_amt) OR v_amt < c_min_bet OR v_amt > c_max_bet_each THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cada apuesta debe ser un numero entero de al menos ' || c_min_bet || ' TUNG');
    END IF;

    IF v_type IN ('straight', 'dozen') THEN
      IF jsonb_typeof(v_elem -> 'value') IS DISTINCT FROM 'number' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apuesta invalida');
      END IF;
      v_num := (v_elem ->> 'value')::numeric;
      IF v_num <> trunc(v_num)
         OR (v_type = 'straight' AND (v_num < 0 OR v_num > 36))
         OR (v_type = 'dozen'    AND (v_num < 1 OR v_num > 3)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apuesta invalida');
      END IF;
      v_val := v_num::integer;
    ELSIF v_type IN ('red', 'black', 'even', 'odd') THEN
      v_val := NULL;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de apuesta invalido');
    END IF;

    v_types := array_append(v_types, v_type);
    v_vals  := array_append(v_vals, v_val);
    v_amts  := array_append(v_amts, v_amt);
    v_total := v_total + v_amt;
  END LOOP;

  -- Serializa: primero el banco, luego el jugador
  SELECT * INTO v_bank FROM public.casino_roulette_bank WHERE id = 1 FOR UPDATE;
  IF NOT FOUND OR NOT v_bank.enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'La ruleta esta cerrada temporalmente');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  -- Anti-spam: una tirada cada 2 segundos por jugador
  SELECT max(created_at) INTO v_last FROM public.casino_roulette_spins WHERE user_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Espera a que termine la tirada anterior');
  END IF;

  IF v_balance < v_total THEN
    RETURN jsonb_build_object('success', false, 'error',
      'TUNG insuficiente. Necesitas ' || v_total || ' TUNG, tienes ' || floor(v_balance) || '.');
  END IF;

  v_fee   := v_total * c_fee_rate;
  v_stake := v_total - v_fee;

  -- Peor caso para el banco: premio maximo posible entre los 37 numeros
  FOR v_n IN 0..36 LOOP
    v_p := 0;
    FOR i IN 1..array_length(v_types, 1) LOOP
      v_m := public._roulette_payout_mult(v_types[i], v_vals[i], v_n);
      IF v_m > 0 THEN
        v_p := v_p + v_amts[i] * (1 - c_fee_rate) * v_m;
      END IF;
    END LOOP;
    IF v_p > v_max_payout THEN v_max_payout := v_p; END IF;
  END LOOP;

  v_limit := floor(v_bank.balance * c_max_payout_rate);
  IF v_max_payout > v_limit THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Apuesta demasiado alta: el premio maximo posible (' || round(v_max_payout, 2) ||
      ' TUNG) supera el limite de la mesa (' || v_limit || ' TUNG = 10% del banco).',
      'max_payout', v_limit);
  END IF;

  -- Numero aleatorio seguro y sin sesgo (rechazo sobre 2^32)
  LOOP
    v_bytes := extensions.gen_random_bytes(4);
    v_r := (get_byte(v_bytes, 0)::bigint << 24) + (get_byte(v_bytes, 1)::bigint << 16)
         + (get_byte(v_bytes, 2)::bigint << 8)  +  get_byte(v_bytes, 3)::bigint;
    EXIT WHEN v_r < 4294967289;  -- floor(2^32 / 37) * 37
  END LOOP;
  v_result := (v_r % 37)::integer;
  v_color := CASE
    WHEN v_result = 0 THEN 'green'
    WHEN v_result = ANY (ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]) THEN 'red'
    ELSE 'black'
  END;

  FOR i IN 1..array_length(v_types, 1) LOOP
    v_m := public._roulette_payout_mult(v_types[i], v_vals[i], v_result);
    IF v_m > 0 THEN
      v_payout := v_payout + v_amts[i] * (1 - c_fee_rate) * v_m;
      v_win_idx := array_append(v_win_idx, i - 1);
    END IF;
  END LOOP;

  -- Reparto del fee
  v_pool    := v_total * c_pool_rate;
  v_company := v_fee - v_pool;

  SELECT p.referred_by INTO v_referrer FROM public.profiles p WHERE p.id = v_uid;
  IF v_referrer IS NOT NULL AND v_referrer <> v_uid
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_referrer) THEN
    v_ref_share := round(v_company * c_ref_rate, 8);
  ELSE
    v_referrer := NULL;
    v_ref_share := 0;
  END IF;
  v_admin_share := v_company - v_ref_share;

  PERFORM public._internal_set_fxu_context();

  -- Jugador: cobra la apuesta y recibe el premio
  UPDATE public.profiles SET fxu_balance = fxu_balance - v_total + v_payout WHERE id = v_uid;

  -- Empresa (billetera admin, igual que el resto del juego)
  IF v_admin_share > 0 THEN
    SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE public.profiles SET fxu_balance = fxu_balance + v_admin_share WHERE id = v_admin_id;
    END IF;
  END IF;

  -- Referido
  IF v_referrer IS NOT NULL AND v_ref_share > 0 THEN
    UPDATE public.profiles SET fxu_balance = fxu_balance + v_ref_share WHERE id = v_referrer;
    INSERT INTO public.referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer, v_uid, NULL, 'casino_roulette_referral', v_ref_share);
  END IF;

  -- Pools del jackpot: se acumula y se envia en multiplos de 10 para que
  -- contribute_to_jackpot reparta entre sus pools sin perder decimales.
  v_pending := v_bank.pool_pending + v_pool;
  v_flush := floor(v_pending / 10) * 10;
  IF v_flush > 0 THEN
    PERFORM public.contribute_to_jackpot(v_flush, 'casino_roulette', v_uid);
    v_pending := v_pending - v_flush;
  END IF;

  -- Banco: recibe lo jugado (80%) y paga premios
  UPDATE public.casino_roulette_bank
     SET balance       = balance + v_stake - v_payout,
         pool_pending  = v_pending,
         total_wagered = total_wagered + v_total,
         total_fees    = total_fees + v_fee,
         total_paid    = total_paid + v_payout,
         total_spins   = total_spins + 1,
         updated_at    = now()
   WHERE id = 1
  RETURNING balance INTO v_bank_after;

  INSERT INTO public.casino_roulette_spins
    (id, user_id, bets, total_bet, fee, stake, result, color, payout,
     pool_share, company_share, referrer_id, referrer_share, bank_after)
  VALUES
    (v_spin_id, v_uid, p_bets, v_total, v_fee, v_stake, v_result, v_color, v_payout,
     v_pool, v_admin_share, v_referrer, v_ref_share, v_bank_after);

  -- Ledger financiero + reparto a accionistas
  IF v_admin_share > 0 THEN
    PERFORM public.record_admin_revenue('casino_roulette', v_admin_share,
      'Ruleta: comision de tirada', v_uid, v_spin_id);
  END IF;

  SELECT fxu_balance INTO v_new_bal FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'spin_id', v_spin_id,
    'result', v_result,
    'color', v_color,
    'total_bet', v_total,
    'fee', v_fee,
    'stake', v_stake,
    'payout', v_payout,
    'net', v_payout - v_total,
    'winning_bets', to_jsonb(v_win_idx),
    'balance', v_new_bal,
    'bank_balance', v_bank_after,
    'max_payout', floor(v_bank_after * c_max_payout_rate)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.casino_roulette_spin(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_roulette_spin(jsonb) TO authenticated;

-- 5) Estado (solo lectura)
CREATE OR REPLACE FUNCTION public.casino_roulette_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_bank     public.casino_roulette_bank%ROWTYPE;
  v_is_admin boolean;
  v_balance  numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.hero_access_allowlist WHERE user_id = v_uid) THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;

  SELECT * INTO v_bank FROM public.casino_roulette_bank WHERE id = 1;
  SELECT COALESCE(is_admin, false), fxu_balance INTO v_is_admin, v_balance FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'allowed', true,
    'enabled', COALESCE(v_bank.enabled, false),
    'docked', public._casino_can_enter(v_uid),
    'balance', COALESCE(v_balance, 0),
    'bank_balance', COALESCE(v_bank.balance, 0),
    'max_payout', floor(COALESCE(v_bank.balance, 0) * 0.10),
    'min_bet', 10,
    'fee_pct', 20,
    'max_bets', 40,
    'server_time', now(),
    'last_numbers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('n', s.result, 'color', s.color) ORDER BY s.created_at DESC), '[]'::jsonb)
      FROM (SELECT result, color, created_at FROM public.casino_roulette_spins
            WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 15) s),
    'history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'result', s.result, 'color', s.color, 'total_bet', s.total_bet,
               'payout', s.payout, 'created_at', s.created_at) ORDER BY s.created_at DESC), '[]'::jsonb)
      FROM (SELECT result, color, total_bet, payout, created_at FROM public.casino_roulette_spins
            WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 10) s),
    'recent_wins', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'username', w.username, 'result', w.result, 'color', w.color,
               'payout', w.payout, 'created_at', w.created_at) ORDER BY w.created_at DESC), '[]'::jsonb)
      FROM (SELECT p.username, s.result, s.color, s.payout, s.created_at
            FROM public.casino_roulette_spins s JOIN public.profiles p ON p.id = s.user_id
            WHERE s.payout > 0 ORDER BY s.created_at DESC LIMIT 10) w),
    'admin', CASE WHEN v_is_admin THEN jsonb_build_object(
      'pool_pending', v_bank.pool_pending,
      'total_seeded', v_bank.total_seeded,
      'total_withdrawn', v_bank.total_withdrawn,
      'total_wagered', v_bank.total_wagered,
      'total_fees', v_bank.total_fees,
      'total_paid', v_bank.total_paid,
      'total_spins', v_bank.total_spins) ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.casino_roulette_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_roulette_status() TO authenticated;

-- 6) Administracion del banco (solo is_admin). Usa la billetera de empresa
--    (primer admin, la misma que recibe las comisiones).
CREATE OR REPLACE FUNCTION public.casino_roulette_admin(p_action text, p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_bank     public.casino_roulette_bank%ROWTYPE;
  v_admin_id uuid;
  v_bal      numeric;
  v_after    numeric;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_admin = true) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bank FROM public.casino_roulette_bank WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Banco no inicializado');
  END IF;

  IF p_action IN ('enable', 'disable') THEN
    UPDATE public.casino_roulette_bank SET enabled = (p_action = 'enable'), updated_at = now() WHERE id = 1;
    INSERT INTO public.casino_roulette_bank_moves (kind, amount, admin_id, bank_after)
    VALUES (p_action, 0, v_uid, v_bank.balance);
    RETURN jsonb_build_object('success', true, 'enabled', p_action = 'enable', 'bank_balance', v_bank.balance);
  END IF;

  IF p_action NOT IN ('deposit', 'withdraw') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accion invalida');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount) OR p_amount > 100000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad invalida');
  END IF;

  SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  SELECT COALESCE(fxu_balance, 0) INTO v_bal FROM public.profiles WHERE id = v_admin_id FOR UPDATE;

  PERFORM public._internal_set_fxu_context();

  IF p_action = 'deposit' THEN
    IF v_bal < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'La billetera de empresa no tiene saldo suficiente');
    END IF;
    UPDATE public.profiles SET fxu_balance = fxu_balance - p_amount WHERE id = v_admin_id;
    UPDATE public.casino_roulette_bank
       SET balance = balance + p_amount, total_seeded = total_seeded + p_amount, updated_at = now()
     WHERE id = 1 RETURNING balance INTO v_after;
    INSERT INTO public.admin_expenses (expense_type, amount, description, related_user_id)
    VALUES ('other', p_amount, 'Ruleta: deposito al banco del casino', v_admin_id);
  ELSE
    IF v_bank.balance < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'El banco no tiene saldo suficiente');
    END IF;
    UPDATE public.casino_roulette_bank
       SET balance = balance - p_amount, total_withdrawn = total_withdrawn + p_amount, updated_at = now()
     WHERE id = 1 RETURNING balance INTO v_after;
    UPDATE public.profiles SET fxu_balance = fxu_balance + p_amount WHERE id = v_admin_id;
  END IF;

  INSERT INTO public.casino_roulette_bank_moves (kind, amount, admin_id, bank_after)
  VALUES (p_action, p_amount, v_uid, v_after);

  RETURN jsonb_build_object('success', true, 'bank_balance', v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.casino_roulette_admin(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_roulette_admin(text, numeric) TO authenticated;

-- 7) Banco inicial: 1000 TUNG desde la billetera de empresa (solo la primera vez)
DO $$
DECLARE
  v_admin_id uuid;
  v_bal numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.casino_roulette_bank WHERE id = 1) THEN
    RAISE NOTICE 'Banco de ruleta ya existe, no se vuelve a sembrar';
    RETURN;
  END IF;

  SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No hay cuenta admin para sembrar el banco';
  END IF;
  SELECT COALESCE(fxu_balance, 0) INTO v_bal FROM public.profiles WHERE id = v_admin_id FOR UPDATE;
  IF v_bal < 1000 THEN
    RAISE EXCEPTION 'El admin no tiene 1000 TUNG (tiene %)', v_bal;
  END IF;

  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance - 1000 WHERE id = v_admin_id;

  INSERT INTO public.casino_roulette_bank (id, balance, total_seeded) VALUES (1, 1000, 1000);
  INSERT INTO public.casino_roulette_bank_moves (kind, amount, admin_id, bank_after)
  VALUES ('seed', 1000, v_admin_id, 1000);
  INSERT INTO public.admin_expenses (expense_type, amount, description, related_user_id)
  VALUES ('other', 1000, 'Ruleta: fondo inicial del banco del casino', v_admin_id);
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
