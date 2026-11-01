-- [SLOTS1] Tragamonedas del Casino Galactico, en TUNG. Misma logica de dinero que la ruleta.
--   * Abierta a todos los jugadores (respeta _casino_games_gate, igual que la ruleta).
--   * Fee 20% descontado de la apuesta: 10% -> pools del jackpot, 10% -> empresa.
--     Del tramo empresa, 20% al referido (si tiene); el resto es ingreso de empresa
--     (record_admin_revenue 'casino_slots' -> dashboard financiero + accionistas).
--   * Se juega el 80% restante. 3 rodillos, 1 linea. Pagos sobre lo jugado:
--       rocket x3 = x50 | planet x3 = x20 | star x3 = x10 | gem x3 = x5 | moon x3 = x3
--       exactamente 2 rockets (cualquier posicion) = x2
--     Pesos por rodillo (de 100): rocket 6, planet 7, star 9, gem 11, moon 67
--     -> RTP del juego base 95,42%; con la comision el jugador recupera ~76,3%.
--   * Banco PROPIO (no comparte fondos con la ruleta).
--   * Limites: premio maximo por tirada <= 10% del banco, y perdida neta del banco
--     por dia (UTC) <= 20% del banco al inicio del dia. Nunca puede quedar en negativo.
--   * Resultado generado en el servidor con pgcrypto (gen_random_bytes, sin sesgo).
--   * Tablas con RLS y sin politicas, sin privilegios para anon/authenticated.
--   * NO se publica nada en realtime.
\set ON_ERROR_STOP on
BEGIN;

-- 1) Nuevo tipo de ingreso en el ledger financiero (lista actual + 'casino_slots')
ALTER TABLE public.admin_revenue DROP CONSTRAINT admin_revenue_revenue_type_check;
ALTER TABLE public.admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check CHECK (revenue_type = ANY (ARRAY[
  'market_fee','withdrawal_fee','instant_build','instant_research','instant_ship','referral_bonus',
  'officer_fxu','expedition_fee','supply_box','fleet_acceleration','swap_fee','transfer_fee',
  'plus_subscription','colony_abandon','planet_rename','alliance_rename','alliance_creation',
  'lottery_fee','p2p_fee','blueprint_sale','hero_respec','hero_kit_sale','other','premium_mission',
  'hero_duel','daily_streak','deposit_gas_buffer','instant_unit_sale','casino_roulette','casino_slots'
]::text[]));

-- 2) Tablas
CREATE TABLE IF NOT EXISTS public.casino_slots_bank (
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
  day_date        date,
  day_start       numeric NOT NULL DEFAULT 0 CHECK (day_start >= 0),
  day_loss        numeric NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.casino_slots_spins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bet            numeric NOT NULL CHECK (bet > 0),
  fee            numeric NOT NULL CHECK (fee >= 0),
  stake          numeric NOT NULL CHECK (stake >= 0),
  reels          smallint[] NOT NULL CHECK (array_length(reels, 1) = 3),
  mult           integer NOT NULL CHECK (mult >= 0),
  payout         numeric NOT NULL CHECK (payout >= 0),
  pool_share     numeric NOT NULL DEFAULT 0,
  company_share  numeric NOT NULL DEFAULT 0,
  referrer_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  referrer_share numeric NOT NULL DEFAULT 0,
  bank_after     numeric NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS casino_slots_spins_user_idx ON public.casino_slots_spins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS casino_slots_spins_wins_idx ON public.casino_slots_spins (created_at DESC) WHERE payout > 0;

CREATE TABLE IF NOT EXISTS public.casino_slots_bank_moves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('seed','deposit','withdraw','enable','disable')),
  amount     numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  admin_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  bank_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.casino_slots_bank       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_slots_spins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_slots_bank_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.casino_slots_bank, public.casino_slots_spins, public.casino_slots_bank_moves FROM PUBLIC, anon, authenticated, authenticator;

-- Banco vacio y abierto: el admin lo financia desde el panel (Depositar).
INSERT INTO public.casino_slots_bank (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 3) Tirada
CREATE OR REPLACE FUNCTION public.casino_slots_spin(p_bet numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_min_bet         constant numeric := 1;
  c_max_bet         constant numeric := 10000000;
  c_fee_rate        constant numeric := 0.20;
  c_pool_rate       constant numeric := 0.10;
  c_ref_rate        constant numeric := 0.20;  -- del tramo empresa
  c_max_payout_rate constant numeric := 0.10;  -- del banco, por tirada
  c_daily_loss_rate constant numeric := 0.20;  -- del banco al inicio del dia
  c_top_mult        constant integer := 50;
  v_uid        uuid := auth.uid();
  v_gate       text;
  v_bank       public.casino_slots_bank%ROWTYPE;
  v_balance    numeric;
  v_last       timestamptz;
  v_fee        numeric;
  v_stake      numeric;
  v_pool       numeric;
  v_company    numeric;
  v_ref_share  numeric := 0;
  v_admin_share numeric;
  v_worst      numeric;
  v_limit      numeric;
  v_today      date := (now() AT TIME ZONE 'UTC')::date;
  v_day_start  numeric;
  v_day_loss   numeric;
  v_day_room   numeric;
  v_reels      smallint[] := ARRAY[]::smallint[];
  v_bytes      bytea;
  v_r          bigint;
  v_k          integer;
  i            integer;
  v_rockets    integer;
  v_mult       integer := 0;
  v_payout     numeric := 0;
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

  v_gate := public._casino_games_gate(v_uid);
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_gate);
  END IF;

  -- Validacion estricta (el cliente solo envia la apuesta; todo lo demas se decide aqui)
  IF p_bet IS NULL OR p_bet <> trunc(p_bet) OR p_bet < c_min_bet OR p_bet > c_max_bet THEN
    RETURN jsonb_build_object('success', false, 'error', 'La apuesta debe ser un numero entero de al menos ' || c_min_bet || ' TUNG');
  END IF;

  -- Serializa: primero el banco, luego el jugador
  SELECT * INTO v_bank FROM public.casino_slots_bank WHERE id = 1 FOR UPDATE;
  IF NOT FOUND OR NOT v_bank.enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'La tragamonedas esta cerrada temporalmente');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  -- Anti-spam: una tirada cada 2 segundos por jugador
  SELECT max(created_at) INTO v_last FROM public.casino_slots_spins WHERE user_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Espera a que termine la tirada anterior');
  END IF;

  IF v_balance < p_bet THEN
    RETURN jsonb_build_object('success', false, 'error',
      'TUNG insuficiente. Necesitas ' || p_bet || ' TUNG, tienes ' || floor(v_balance) || '.');
  END IF;

  v_fee   := p_bet * c_fee_rate;
  v_stake := p_bet - v_fee;
  v_worst := v_stake * c_top_mult;

  -- Limite 1: ningun premio posible supera el 10% del banco
  v_limit := floor(v_bank.balance * c_max_payout_rate);
  IF v_worst > v_limit THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Apuesta demasiado alta: el premio maximo posible (' || round(v_worst, 2) ||
      ' TUNG) supera el limite de la maquina (' || v_limit || ' TUNG = 10% del banco).');
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
  IF v_worst - v_stake > v_day_room THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_day_room < 1
        THEN 'La tragamonedas alcanzo su limite de premios de hoy. Vuelve manana.'
        ELSE 'Apuesta demasiado alta para el limite diario de la maquina. Prueba con una apuesta menor.'
      END);
  END IF;

  -- 3 rodillos, numero aleatorio seguro y sin sesgo (rechazo sobre 2^32)
  FOR i IN 1..3 LOOP
    LOOP
      v_bytes := extensions.gen_random_bytes(4);
      v_r := (get_byte(v_bytes, 0)::bigint << 24) + (get_byte(v_bytes, 1)::bigint << 16)
           + (get_byte(v_bytes, 2)::bigint << 8)  +  get_byte(v_bytes, 3)::bigint;
      EXIT WHEN v_r < 4294967200;  -- floor(2^32 / 100) * 100
    END LOOP;
    v_k := (v_r % 100)::integer;
    v_reels := array_append(v_reels, (CASE
      WHEN v_k < 6  THEN 0   -- rocket  6
      WHEN v_k < 13 THEN 1   -- planet  7
      WHEN v_k < 22 THEN 2   -- star    9
      WHEN v_k < 33 THEN 3   -- gem    11
      ELSE 4                 -- moon   67
    END)::smallint);
  END LOOP;

  IF v_reels[1] = v_reels[2] AND v_reels[2] = v_reels[3] THEN
    v_mult := CASE v_reels[1] WHEN 0 THEN 50 WHEN 1 THEN 20 WHEN 2 THEN 10 WHEN 3 THEN 5 ELSE 3 END;
  ELSE
    v_rockets := (v_reels[1] = 0)::integer + (v_reels[2] = 0)::integer + (v_reels[3] = 0)::integer;
    IF v_rockets = 2 THEN v_mult := 2; END IF;
  END IF;
  v_payout := v_stake * v_mult;

  -- Reparto del fee
  v_pool    := p_bet * c_pool_rate;
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
  UPDATE public.profiles SET fxu_balance = fxu_balance - p_bet + v_payout WHERE id = v_uid;

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
    VALUES (v_referrer, v_uid, NULL, 'casino_slots_referral', v_ref_share);
  END IF;

  -- Pools del jackpot: se acumula y se envia en multiplos de 10
  v_pending := v_bank.pool_pending + v_pool;
  v_flush := floor(v_pending / 10) * 10;
  IF v_flush > 0 THEN
    PERFORM public.contribute_to_jackpot(v_flush, 'casino_slots', v_uid);
    v_pending := v_pending - v_flush;
  END IF;

  -- Banco: recibe lo jugado (80%) y paga premios
  UPDATE public.casino_slots_bank
     SET balance       = balance + v_stake - v_payout,
         pool_pending  = v_pending,
         total_wagered = total_wagered + p_bet,
         total_fees    = total_fees + v_fee,
         total_paid    = total_paid + v_payout,
         total_spins   = total_spins + 1,
         day_date      = v_today,
         day_start     = v_day_start,
         day_loss      = v_day_loss + v_payout - v_stake,
         updated_at    = now()
   WHERE id = 1
  RETURNING balance INTO v_bank_after;

  INSERT INTO public.casino_slots_spins
    (id, user_id, bet, fee, stake, reels, mult, payout,
     pool_share, company_share, referrer_id, referrer_share, bank_after)
  VALUES
    (v_spin_id, v_uid, p_bet, v_fee, v_stake, v_reels, v_mult, v_payout,
     v_pool, v_admin_share, v_referrer, v_ref_share, v_bank_after);

  -- Ledger financiero + reparto a accionistas
  IF v_admin_share > 0 THEN
    PERFORM public.record_admin_revenue('casino_slots', v_admin_share,
      'Tragamonedas: comision de tirada', v_uid, v_spin_id);
  END IF;

  SELECT fxu_balance INTO v_new_bal FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'spin_id', v_spin_id,
    'reels', to_jsonb(v_reels),
    'mult', v_mult,
    'bet', p_bet,
    'fee', v_fee,
    'stake', v_stake,
    'payout', v_payout,
    'net', v_payout - p_bet,
    'balance', v_new_bal,
    'bank_balance', v_bank_after
  );
END;
$$;
REVOKE ALL ON FUNCTION public.casino_slots_spin(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_slots_spin(numeric) TO authenticated;

-- 4) Estado (solo lectura)
CREATE OR REPLACE FUNCTION public.casino_slots_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_bank      public.casino_slots_bank%ROWTYPE;
  v_is_admin  boolean;
  v_balance   numeric;
  v_today     date := (now() AT TIME ZONE 'UTC')::date;
  v_bank_bal  numeric;
  v_limit     numeric;
  v_day_start numeric;
  v_day_loss  numeric;
  v_day_room  numeric;
  v_max_bet   numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bank FROM public.casino_slots_bank WHERE id = 1;
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
  v_day_room := floor(v_day_start * 0.20) - v_day_loss;
  -- Igual que la tirada: premio maximo = apuesta * 0,8 * 50 = 40x; perdida neta = 39,2x
  v_max_bet := greatest(0, least(floor(v_limit / 40.0), floor(v_day_room / 39.2), 10000000));

  RETURN jsonb_build_object(
    'allowed', true,
    'enabled', COALESCE(v_bank.enabled, false),
    'docked', (public._casino_games_gate(v_uid) IS NULL),
    'balance', COALESCE(v_balance, 0),
    'bank_balance', v_bank_bal,
    'max_payout', v_limit,
    'max_bet', v_max_bet,
    'min_bet', 1,
    'fee_pct', 20,
    'server_time', now(),
    'history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'reels', to_jsonb(s.reels), 'bet', s.bet, 'mult', s.mult,
               'payout', s.payout, 'created_at', s.created_at) ORDER BY s.created_at DESC), '[]'::jsonb)
      FROM (SELECT reels, bet, mult, payout, created_at FROM public.casino_slots_spins
            WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 10) s),
    'recent_wins', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'username', w.username, 'reels', to_jsonb(w.reels), 'mult', w.mult,
               'payout', w.payout, 'created_at', w.created_at) ORDER BY w.created_at DESC), '[]'::jsonb)
      FROM (SELECT p.username, s.reels, s.mult, s.payout, s.created_at
            FROM public.casino_slots_spins s JOIN public.profiles p ON p.id = s.user_id
            WHERE s.payout > 0 ORDER BY s.created_at DESC LIMIT 10) w),
    'admin', CASE WHEN v_is_admin THEN jsonb_build_object(
      'pool_pending', v_bank.pool_pending,
      'total_seeded', v_bank.total_seeded,
      'total_withdrawn', v_bank.total_withdrawn,
      'total_wagered', v_bank.total_wagered,
      'total_fees', v_bank.total_fees,
      'total_paid', v_bank.total_paid,
      'total_spins', v_bank.total_spins,
      'day_loss', v_day_loss,
      'day_limit', floor(v_day_start * 0.20)) ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.casino_slots_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_slots_status() TO authenticated;

-- 5) Administracion del banco (solo is_admin). Usa la billetera de empresa
--    (primer admin, la misma que recibe las comisiones).
CREATE OR REPLACE FUNCTION public.casino_slots_admin(p_action text, p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_bank     public.casino_slots_bank%ROWTYPE;
  v_admin_id uuid;
  v_bal      numeric;
  v_after    numeric;
  v_today    date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_admin = true) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bank FROM public.casino_slots_bank WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Banco no inicializado');
  END IF;

  IF p_action IN ('enable', 'disable') THEN
    UPDATE public.casino_slots_bank SET enabled = (p_action = 'enable'), updated_at = now() WHERE id = 1;
    INSERT INTO public.casino_slots_bank_moves (kind, amount, admin_id, bank_after)
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
    UPDATE public.casino_slots_bank
       SET balance = balance + p_amount, total_seeded = total_seeded + p_amount,
           day_start = CASE WHEN day_date = v_today THEN day_start + p_amount ELSE day_start END,
           updated_at = now()
     WHERE id = 1 RETURNING balance INTO v_after;
    INSERT INTO public.admin_expenses (expense_type, amount, description, related_user_id)
    VALUES ('other', p_amount, 'Tragamonedas: deposito al banco del casino', v_admin_id);
  ELSE
    IF v_bank.balance < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'El banco no tiene saldo suficiente');
    END IF;
    UPDATE public.casino_slots_bank
       SET balance = balance - p_amount, total_withdrawn = total_withdrawn + p_amount,
           day_start = CASE WHEN day_date = v_today THEN greatest(day_start - p_amount, 0) ELSE day_start END,
           updated_at = now()
     WHERE id = 1 RETURNING balance INTO v_after;
    UPDATE public.profiles SET fxu_balance = fxu_balance + p_amount WHERE id = v_admin_id;
  END IF;

  INSERT INTO public.casino_slots_bank_moves (kind, amount, admin_id, bank_after)
  VALUES (p_action, p_amount, v_uid, v_after);

  RETURN jsonb_build_object('success', true, 'bank_balance', v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.casino_slots_admin(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_slots_admin(text, numeric) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
