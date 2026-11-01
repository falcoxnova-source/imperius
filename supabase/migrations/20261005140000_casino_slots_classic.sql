-- [SLOTS2] Tragamonedas estilo clasico (tipo "Double Diamond" / "Liberty Bell").
-- SOLO cambia el resultado de la tirada (simbolos + tabla de pagos) en casino_slots_spin.
-- Dinero, comision, pools, referido, banco, limites, cooldown y permisos: IDENTICOS a [SLOTS1].
--   Simbolos: 0 cohete, 1 planeta, 2 estrella, 3 gema, 4 luna, 5 HUECO (vacio, nunca paga).
--   Pesos por rodillo (de 100): cohete 9, planeta 10, estrella 12, gema 14, luna 36, hueco 19.
--   Pagos sobre lo jugado (80% de la apuesta), se paga solo la mejor combinacion:
--     3 cohetes x50 | 3 planetas x20 | 3 estrellas x10 | 3 gemas x8
--     2 cohetes (cualquier posicion) x5
--     cualquier mezcla de planeta/estrella/gema x4   (estilo "cualquier BAR")
--     3 lunas x3
--     1 cohete (cualquier posicion) x2                (estilo "cereza")
--   RTP del juego base 95,81% (exacto, enumerando 216 combinaciones); aciertos 34%.
--   Con la comision el jugador recupera ~76,6% (antes 76,3%).
--   Premio maximo sigue siendo x50 -> limites del banco y max_bet de casino_slots_status sin cambios.
\set ON_ERROR_STOP on
BEGIN;

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
      WHEN v_k < 9  THEN 0   -- cohete    9
      WHEN v_k < 19 THEN 1   -- planeta  10
      WHEN v_k < 31 THEN 2   -- estrella 12
      WHEN v_k < 45 THEN 3   -- gema     14
      WHEN v_k < 81 THEN 4   -- luna     36
      ELSE 5                 -- hueco    19
    END)::smallint);
  END LOOP;

  -- Tabla de pagos clasica: se paga solo la mejor combinacion
  v_rockets := (v_reels[1] = 0)::integer + (v_reels[2] = 0)::integer + (v_reels[3] = 0)::integer;
  IF v_reels[1] = v_reels[2] AND v_reels[2] = v_reels[3] AND v_reels[1] <> 5 THEN
    v_mult := CASE v_reels[1] WHEN 0 THEN 50 WHEN 1 THEN 20 WHEN 2 THEN 10 WHEN 3 THEN 8 ELSE 3 END;
  ELSIF v_rockets = 2 THEN
    v_mult := 5;
  ELSIF v_rockets = 1 THEN
    v_mult := 2;
  ELSIF v_reels[1] BETWEEN 1 AND 3 AND v_reels[2] BETWEEN 1 AND 3 AND v_reels[3] BETWEEN 1 AND 3 THEN
    v_mult := 4;
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

COMMIT;

NOTIFY pgrst, 'reload schema';
