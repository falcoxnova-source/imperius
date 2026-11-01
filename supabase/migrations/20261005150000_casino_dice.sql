-- [DICE1] Dados (Sic Bo) del Casino Galactico, en TUNG. Misma logica de dinero que ruleta/tragamonedas.
--   * Abierto a todos los jugadores (respeta _casino_games_gate).
--   * Fee 20% descontado de la apuesta: 10% -> pools del jackpot, 10% -> empresa.
--     Del tramo empresa, 20% al referido (si tiene); el resto es ingreso de empresa
--     (record_admin_revenue 'casino_dice' -> dashboard financiero + accionistas).
--   * Se juega el 80% restante. 3 dados. Pagos (a:1) sobre lo jugado (Macau estandar):
--       chico 4-10 / grande 11-17 / par / impar 1:1 (pierden con cualquier triple)
--       numero 1-6: 1:1 / 2:1 / 3:1 segun aparezca en 1, 2 o 3 dados
--       doble especifico 10:1 | triple especifico 180:1 | cualquier triple 30:1
--       pareja de dos numeros distintos 5:1
--       total 4/17 60:1 | 5/16 30:1 | 6/15 17:1 | 7/14 12:1 | 8/13 8:1 | 9/10/11/12 6:1
--     RTP del juego entre 81% y 97,2% segun apuesta (siempre < 100%).
--   * Banco PROPIO (no comparte fondos con ruleta ni tragamonedas).
--   * Limites: premio maximo posible por tirada (peor caso entre todas las combinaciones)
--     <= 10% del banco, y perdida neta del banco por dia (UTC) <= 20% del banco al
--     inicio del dia. Nunca puede quedar en negativo.
--   * Resultado generado en el servidor con pgcrypto (gen_random_bytes, sin sesgo).
--   * Tablas con RLS y sin politicas, sin privilegios para anon/authenticated.
--   * NO se publica nada en realtime.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1) Nuevo tipo de ingreso en el ledger financiero (lista actual + 'casino_dice')
ALTER TABLE public.admin_revenue DROP CONSTRAINT admin_revenue_revenue_type_check;
ALTER TABLE public.admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check CHECK (revenue_type = ANY (ARRAY[
  'market_fee','withdrawal_fee','instant_build','instant_research','instant_ship','referral_bonus',
  'officer_fxu','expedition_fee','supply_box','fleet_acceleration','swap_fee','transfer_fee',
  'plus_subscription','colony_abandon','planet_rename','alliance_rename','alliance_creation',
  'lottery_fee','p2p_fee','blueprint_sale','hero_respec','hero_kit_sale','other','premium_mission',
  'hero_duel','daily_streak','deposit_gas_buffer','instant_unit_sale','casino_roulette','casino_slots',
  'casino_dice'
]::text[])) NOT VALID;

-- 2) Tablas
CREATE TABLE IF NOT EXISTS public.casino_dice_bank (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance         numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  pool_pending    numeric NOT NULL DEFAULT 0 CHECK (pool_pending >= 0),
  enabled         boolean NOT NULL DEFAULT true,
  total_seeded    numeric NOT NULL DEFAULT 0,
  total_withdrawn numeric NOT NULL DEFAULT 0,
  total_wagered   numeric NOT NULL DEFAULT 0,
  total_fees      numeric NOT NULL DEFAULT 0,
  total_paid      numeric NOT NULL DEFAULT 0,
  total_rolls     bigint  NOT NULL DEFAULT 0,
  day_date        date,
  day_start       numeric NOT NULL DEFAULT 0 CHECK (day_start >= 0),
  day_loss        numeric NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.casino_dice_rolls (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bets           jsonb NOT NULL,
  total_bet      numeric NOT NULL CHECK (total_bet > 0),
  fee            numeric NOT NULL CHECK (fee >= 0),
  stake          numeric NOT NULL CHECK (stake >= 0),
  dice           smallint[] NOT NULL CHECK (array_length(dice, 1) = 3),
  total          smallint NOT NULL CHECK (total BETWEEN 3 AND 18),
  payout         numeric NOT NULL CHECK (payout >= 0),
  pool_share     numeric NOT NULL DEFAULT 0,
  company_share  numeric NOT NULL DEFAULT 0,
  referrer_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  referrer_share numeric NOT NULL DEFAULT 0,
  bank_after     numeric NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS casino_dice_rolls_user_idx ON public.casino_dice_rolls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS casino_dice_rolls_created_idx ON public.casino_dice_rolls (created_at DESC);
CREATE INDEX IF NOT EXISTS casino_dice_rolls_wins_idx ON public.casino_dice_rolls (created_at DESC) WHERE payout > 0;

CREATE TABLE IF NOT EXISTS public.casino_dice_bank_moves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('seed','deposit','withdraw','enable','disable')),
  amount     numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  admin_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  bank_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.casino_dice_bank       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_dice_rolls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_dice_bank_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.casino_dice_bank, public.casino_dice_rolls, public.casino_dice_bank_moves FROM PUBLIC, anon, authenticated, authenticator;

-- Banco vacio y abierto: el admin lo financia desde el panel (Depositar).
INSERT INTO public.casino_dice_bank (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 3) Multiplicador total (incluye lo jugado) de una apuesta para unos dados. 0 = pierde.
CREATE OR REPLACE FUNCTION public._dice_payout_mult(p_type text, p_value integer, a integer, b integer, c integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_type IN ('small', 'big', 'odd', 'even') AND a = b AND b = c THEN 0
    WHEN p_type = 'small' THEN CASE WHEN a + b + c BETWEEN 4 AND 10 THEN 2 ELSE 0 END
    WHEN p_type = 'big'   THEN CASE WHEN a + b + c BETWEEN 11 AND 17 THEN 2 ELSE 0 END
    WHEN p_type = 'odd'   THEN CASE WHEN (a + b + c) % 2 = 1 THEN 2 ELSE 0 END
    WHEN p_type = 'even'  THEN CASE WHEN (a + b + c) % 2 = 0 THEN 2 ELSE 0 END
    WHEN p_type = 'single' THEN CASE
      WHEN (a = p_value)::int + (b = p_value)::int + (c = p_value)::int > 0
        THEN 1 + (a = p_value)::int + (b = p_value)::int + (c = p_value)::int
      ELSE 0 END
    WHEN p_type = 'double' THEN CASE
      WHEN (a = p_value)::int + (b = p_value)::int + (c = p_value)::int >= 2 THEN 11 ELSE 0 END
    WHEN p_type = 'triple' THEN CASE WHEN a = p_value AND b = p_value AND c = p_value THEN 181 ELSE 0 END
    WHEN p_type = 'any_triple' THEN CASE WHEN a = b AND b = c THEN 31 ELSE 0 END
    WHEN p_type = 'total' THEN CASE WHEN a + b + c <> p_value THEN 0 ELSE CASE
      WHEN p_value IN (4, 17)  THEN 61
      WHEN p_value IN (5, 16)  THEN 31
      WHEN p_value IN (6, 15)  THEN 18
      WHEN p_value IN (7, 14)  THEN 13
      WHEN p_value IN (8, 13)  THEN 9
      WHEN p_value IN (9, 10, 11, 12) THEN 7
      ELSE 0 END END
    WHEN p_type = 'combo' THEN CASE
      WHEN (p_value / 10) IN (a, b, c) AND (p_value % 10) IN (a, b, c) THEN 6 ELSE 0 END
    ELSE 0
  END;
$$;
REVOKE ALL ON FUNCTION public._dice_payout_mult(text, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;

-- 4) Tirada
CREATE OR REPLACE FUNCTION public.casino_dice_roll(p_bets jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_min_bet         constant numeric := 1;
  c_max_bet_each    constant numeric := 10000000;
  c_max_bets        constant integer := 40;
  c_fee_rate        constant numeric := 0.20;
  c_pool_rate       constant numeric := 0.10;
  c_ref_rate        constant numeric := 0.20;  -- del tramo empresa
  c_max_payout_rate constant numeric := 0.10;  -- del banco, por tirada
  c_daily_loss_rate constant numeric := 0.20;  -- del banco al inicio del dia
  v_uid        uuid := auth.uid();
  v_gate       text;
  v_bank       public.casino_dice_bank%ROWTYPE;
  v_balance    numeric;
  v_last       timestamptz;
  v_elem       jsonb;
  v_type       text;
  v_amt        numeric;
  v_num        numeric;
  v_val        integer;
  v_types      text[] := ARRAY[]::text[];
  v_vals       integer[] := ARRAY[]::integer[];
  v_amts       numeric[] := ARRAY[]::numeric[];
  v_norm       jsonb := '[]'::jsonb;
  v_total      numeric := 0;
  v_fee        numeric;
  v_stake      numeric;
  v_pool       numeric;
  v_company    numeric;
  v_ref_share  numeric := 0;
  v_admin_share numeric;
  v_max_payout numeric := 0;
  v_p          numeric;
  v_m          integer;
  v_limit      numeric;
  v_today      date := (now() AT TIME ZONE 'UTC')::date;
  v_day_start  numeric;
  v_day_loss   numeric;
  v_day_room   numeric;
  a            integer;
  b            integer;
  c            integer;
  i            integer;
  v_dice       smallint[] := ARRAY[]::smallint[];
  v_bytes      bytea;
  v_r          bigint;
  v_sum        integer;
  v_payout     numeric := 0;
  v_win_idx    integer[] := ARRAY[]::integer[];
  v_referrer   uuid;
  v_admin_id   uuid;
  v_flush      numeric;
  v_pending    numeric;
  v_bank_after numeric;
  v_new_bal    numeric;
  v_roll_id    uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  v_gate := public._casino_games_gate(v_uid);
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_gate);
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

    IF v_type IN ('single', 'double', 'triple', 'total', 'combo') THEN
      IF jsonb_typeof(v_elem -> 'value') IS DISTINCT FROM 'number' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apuesta invalida');
      END IF;
      v_num := (v_elem ->> 'value')::numeric;
      IF v_num <> trunc(v_num)
         OR (v_type IN ('single', 'double', 'triple') AND (v_num < 1 OR v_num > 6))
         OR (v_type = 'total' AND (v_num < 4 OR v_num > 17))
         OR (v_type = 'combo' AND (v_num < 12 OR v_num > 56
              OR trunc(v_num / 10) < 1 OR (v_num % 10) > 6
              OR trunc(v_num / 10) >= (v_num % 10))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apuesta invalida');
      END IF;
      v_val := v_num::integer;
    ELSIF v_type IN ('small', 'big', 'odd', 'even', 'any_triple') THEN
      v_val := NULL;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de apuesta invalido');
    END IF;

    v_types := array_append(v_types, v_type);
    v_vals  := array_append(v_vals, v_val);
    v_amts  := array_append(v_amts, v_amt);
    v_norm  := v_norm || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('type', v_type, 'value', v_val, 'amount', v_amt)));
    v_total := v_total + v_amt;
  END LOOP;

  -- Serializa: primero el banco, luego el jugador
  SELECT * INTO v_bank FROM public.casino_dice_bank WHERE id = 1 FOR UPDATE;
  IF NOT FOUND OR NOT v_bank.enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'La mesa de dados esta cerrada temporalmente');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  -- Anti-spam: una tirada cada 2 segundos por jugador
  SELECT max(created_at) INTO v_last FROM public.casino_dice_rolls WHERE user_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Espera a que termine la tirada anterior');
  END IF;

  IF v_balance < v_total THEN
    RETURN jsonb_build_object('success', false, 'error',
      'TUNG insuficiente. Necesitas ' || v_total || ' TUNG, tienes ' || floor(v_balance) || '.');
  END IF;

  v_fee   := v_total * c_fee_rate;
  v_stake := v_total - v_fee;

  -- Peor caso para el banco: premio maximo posible entre las 56 combinaciones (orden irrelevante)
  FOR a IN 1..6 LOOP
    FOR b IN a..6 LOOP
      FOR c IN b..6 LOOP
        v_p := 0;
        FOR i IN 1..array_length(v_types, 1) LOOP
          v_m := public._dice_payout_mult(v_types[i], v_vals[i], a, b, c);
          IF v_m > 0 THEN
            v_p := v_p + v_amts[i] * (1 - c_fee_rate) * v_m;
          END IF;
        END LOOP;
        IF v_p > v_max_payout THEN v_max_payout := v_p; END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Limite 1: ningun premio posible supera el 10% del banco
  v_limit := floor(v_bank.balance * c_max_payout_rate);
  IF v_max_payout > v_limit THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Apuesta demasiado alta: el premio maximo posible (' || round(v_max_payout, 2) ||
      ' TUNG) supera el limite de la mesa (' || v_limit || ' TUNG = 10% del banco).',
      'max_payout', v_limit);
  END IF;

  -- Limite 2: perdida neta diaria del banco <= 20% del banco al inicio del dia
  IF v_bank.day_date IS DISTINCT FROM v_today THEN
    v_day_start := v_bank.balance;
    v_day_loss  := 0;
  ELSE
    v_day_start := v_bank.day_start;
    v_day_loss  := v_bank.day_loss;
  END IF;
  v_day_room := floor(v_day_start * c_daily_loss_rate) - v_day_loss;
  IF v_max_payout - v_stake > v_day_room THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_day_room < 1
        THEN 'La mesa de dados alcanzo su limite de premios de hoy. Vuelve manana.'
        ELSE 'Apuesta demasiado alta para el limite diario de la mesa. Prueba con una apuesta menor.'
      END);
  END IF;

  -- 3 dados, numero aleatorio seguro y sin sesgo (rechazo sobre 2^32)
  FOR i IN 1..3 LOOP
    LOOP
      v_bytes := extensions.gen_random_bytes(4);
      v_r := (get_byte(v_bytes, 0)::bigint << 24) + (get_byte(v_bytes, 1)::bigint << 16)
           + (get_byte(v_bytes, 2)::bigint << 8)  +  get_byte(v_bytes, 3)::bigint;
      EXIT WHEN v_r < 4294967292;  -- floor(2^32 / 6) * 6
    END LOOP;
    v_dice := array_append(v_dice, (1 + v_r % 6)::smallint);
  END LOOP;
  v_sum := v_dice[1] + v_dice[2] + v_dice[3];

  FOR i IN 1..array_length(v_types, 1) LOOP
    v_m := public._dice_payout_mult(v_types[i], v_vals[i], v_dice[1], v_dice[2], v_dice[3]);
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
    VALUES (v_referrer, v_uid, NULL, 'casino_dice_referral', v_ref_share);
  END IF;

  -- Pools del jackpot: se acumula y se envia en multiplos de 10
  v_pending := v_bank.pool_pending + v_pool;
  v_flush := floor(v_pending / 10) * 10;
  IF v_flush > 0 THEN
    PERFORM public.contribute_to_jackpot(v_flush, 'casino_dice', v_uid);
    v_pending := v_pending - v_flush;
  END IF;

  -- Banco: recibe lo jugado (80%) y paga premios
  UPDATE public.casino_dice_bank
     SET balance       = balance + v_stake - v_payout,
         pool_pending  = v_pending,
         total_wagered = total_wagered + v_total,
         total_fees    = total_fees + v_fee,
         total_paid    = total_paid + v_payout,
         total_rolls   = total_rolls + 1,
         day_date      = v_today,
         day_start     = v_day_start,
         day_loss      = v_day_loss + v_payout - v_stake,
         updated_at    = now()
   WHERE id = 1
  RETURNING balance INTO v_bank_after;

  INSERT INTO public.casino_dice_rolls
    (id, user_id, bets, total_bet, fee, stake, dice, total, payout,
     pool_share, company_share, referrer_id, referrer_share, bank_after)
  VALUES
    (v_roll_id, v_uid, v_norm, v_total, v_fee, v_stake, v_dice, v_sum, v_payout,
     v_pool, v_admin_share, v_referrer, v_ref_share, v_bank_after);

  -- Ledger financiero + reparto a accionistas
  IF v_admin_share > 0 THEN
    PERFORM public.record_admin_revenue('casino_dice', v_admin_share,
      'Dados: comision de tirada', v_uid, v_roll_id);
  END IF;

  SELECT fxu_balance INTO v_new_bal FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'roll_id', v_roll_id,
    'dice', to_jsonb(v_dice),
    'total', v_sum,
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
REVOKE ALL ON FUNCTION public.casino_dice_roll(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_dice_roll(jsonb) TO authenticated;

-- 5) Estado (solo lectura)
CREATE OR REPLACE FUNCTION public.casino_dice_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_bank      public.casino_dice_bank%ROWTYPE;
  v_is_admin  boolean;
  v_balance   numeric;
  v_today     date := (now() AT TIME ZONE 'UTC')::date;
  v_bank_bal  numeric;
  v_limit     numeric;
  v_day_start numeric;
  v_day_loss  numeric;
  v_day_room  numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bank FROM public.casino_dice_bank WHERE id = 1;
  SELECT COALESCE(is_admin, false), fxu_balance INTO v_is_admin, v_balance FROM public.profiles WHERE id = v_uid;

  v_bank_bal := COALESCE(v_bank.balance, 0);
  v_limit := floor(v_bank_bal * 0.10);
  IF v_bank.day_date IS DISTINCT FROM v_today THEN
    v_day_start := v_bank_bal;
    v_day_loss  := 0;
  ELSE
    v_day_start := v_bank.day_start;
    v_day_loss  := v_bank.day_loss;
  END IF;
  v_day_room := greatest(floor(v_day_start * 0.20) - v_day_loss, 0);

  RETURN jsonb_build_object(
    'allowed', true,
    'enabled', COALESCE(v_bank.enabled, false),
    'docked', (public._casino_games_gate(v_uid) IS NULL),
    'balance', COALESCE(v_balance, 0),
    'bank_balance', v_bank_bal,
    'max_payout', v_limit,
    'day_room', v_day_room,
    'min_bet', 1,
    'max_bets', 40,
    'fee_pct', 20,
    'server_time', now(),
    'last_rolls', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('dice', to_jsonb(r.dice), 'total', r.total) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM (SELECT dice, total, created_at FROM public.casino_dice_rolls ORDER BY created_at DESC LIMIT 12) r),
    'history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'dice', to_jsonb(s.dice), 'total', s.total, 'total_bet', s.total_bet,
               'payout', s.payout, 'created_at', s.created_at) ORDER BY s.created_at DESC), '[]'::jsonb)
      FROM (SELECT dice, total, total_bet, payout, created_at FROM public.casino_dice_rolls
            WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 10) s),
    'recent_wins', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'username', w.username, 'dice', to_jsonb(w.dice), 'total', w.total,
               'total_bet', w.total_bet, 'payout', w.payout, 'created_at', w.created_at) ORDER BY w.created_at DESC), '[]'::jsonb)
      FROM (SELECT p.username, s.dice, s.total, s.total_bet, s.payout, s.created_at
            FROM public.casino_dice_rolls s JOIN public.profiles p ON p.id = s.user_id
            WHERE s.payout > 0 ORDER BY s.created_at DESC LIMIT 10) w),
    'admin', CASE WHEN v_is_admin THEN jsonb_build_object(
      'pool_pending', v_bank.pool_pending,
      'total_seeded', v_bank.total_seeded,
      'total_withdrawn', v_bank.total_withdrawn,
      'total_wagered', v_bank.total_wagered,
      'total_fees', v_bank.total_fees,
      'total_paid', v_bank.total_paid,
      'total_rolls', v_bank.total_rolls,
      'day_loss', v_day_loss,
      'day_limit', floor(v_day_start * 0.20)) ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.casino_dice_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_dice_status() TO authenticated;

-- 6) Administracion del banco (solo is_admin). Usa la billetera de empresa
--    (primer admin, la misma que recibe las comisiones).
CREATE OR REPLACE FUNCTION public.casino_dice_admin(p_action text, p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_bank     public.casino_dice_bank%ROWTYPE;
  v_admin_id uuid;
  v_bal      numeric;
  v_after    numeric;
  v_today    date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_admin = true) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bank FROM public.casino_dice_bank WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Banco no inicializado');
  END IF;

  IF p_action IN ('enable', 'disable') THEN
    UPDATE public.casino_dice_bank SET enabled = (p_action = 'enable'), updated_at = now() WHERE id = 1;
    INSERT INTO public.casino_dice_bank_moves (kind, amount, admin_id, bank_after)
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

  -- El limite diario se ajusta con depositos/retiros del mismo dia
  IF p_action = 'deposit' THEN
    IF v_bal < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'La billetera de empresa no tiene saldo suficiente');
    END IF;
    UPDATE public.profiles SET fxu_balance = fxu_balance - p_amount WHERE id = v_admin_id;
    UPDATE public.casino_dice_bank
       SET balance = balance + p_amount, total_seeded = total_seeded + p_amount,
           day_start = CASE WHEN day_date = v_today THEN day_start + p_amount ELSE day_start END,
           updated_at = now()
     WHERE id = 1 RETURNING balance INTO v_after;
    INSERT INTO public.admin_expenses (expense_type, amount, description, related_user_id)
    VALUES ('other', p_amount, 'Dados: deposito al banco del casino', v_admin_id);
  ELSE
    IF v_bank.balance < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'El banco no tiene saldo suficiente');
    END IF;
    UPDATE public.casino_dice_bank
       SET balance = balance - p_amount, total_withdrawn = total_withdrawn + p_amount,
           day_start = CASE WHEN day_date = v_today THEN greatest(day_start - p_amount, 0) ELSE day_start END,
           updated_at = now()
     WHERE id = 1 RETURNING balance INTO v_after;
    UPDATE public.profiles SET fxu_balance = fxu_balance + p_amount WHERE id = v_admin_id;
  END IF;

  INSERT INTO public.casino_dice_bank_moves (kind, amount, admin_id, bank_after)
  VALUES (p_action, p_amount, v_uid, v_after);

  RETURN jsonb_build_object('success', true, 'bank_balance', v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.casino_dice_admin(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_dice_admin(text, numeric) TO authenticated;

COMMIT;

-- Validacion sin bloquear escrituras (la lista nueva es superconjunto de la anterior)
ALTER TABLE public.admin_revenue VALIDATE CONSTRAINT admin_revenue_revenue_type_check;

NOTIFY pgrst, 'reload schema';
