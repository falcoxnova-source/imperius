CREATE OR REPLACE FUNCTION public._bs_settle(p_match_id uuid, p_winner uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_pool_rate  constant numeric := 0.05;
  c_daily_rate constant numeric := 0.05;
  c_ref_rate   constant numeric := 0.20;
  m             public.battleship_matches%ROWTYPE;
  v_cfg         public.battleship_config%ROWTYPE;
  v_loser       uuid;
  v_fee         numeric;
  v_pool        numeric;
  v_daily       numeric;
  v_company     numeric;
  v_referrer    uuid;
  v_ref_share   numeric := 0;
  v_admin_share numeric;
  v_admin_id    uuid;
  v_pending     numeric;
  v_flush       numeric;
BEGIN
  SELECT * INTO m FROM public.battleship_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.status NOT IN ('placing', 'battle') OR p_winner NOT IN (m.player1, m.player2) THEN
    RETURN;
  END IF;
  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance + m.pot WHERE id = p_winner;
  UPDATE public.battleship_entries
     SET payout = CASE WHEN user_id = p_winner THEN m.pot ELSE 0 END
   WHERE match_id = p_match_id;
  UPDATE public.battleship_matches
     SET status = 'finished', winner = p_winner, end_reason = p_reason, payout = m.pot,
         turn = NULL, deadline = NULL, finished_at = now(), version = version + 1, updated_at = now()
   WHERE id = p_match_id;

  IF NOT m.loser_fee THEN
    -- Partidas antiguas: la comision ya se cobro al unirse
    UPDATE public.battleship_config SET total_paid = total_paid + m.pot, updated_at = now() WHERE id = 1;
    RETURN;
  END IF;

  v_loser   := CASE WHEN p_winner = m.player1 THEN m.player2 ELSE m.player1 END;
  v_fee     := m.stake * 2 - m.pot;                -- 20% de la apuesta del perdedor
  v_pool    := round(m.stake * c_pool_rate, 8);    -- 5%  pools normales
  v_daily   := round(m.stake * c_daily_rate, 8);   -- 5%  pool diario Batalla de Naves
  v_company := v_fee - v_pool - v_daily;           -- 10% empresa

  SELECT p.referred_by INTO v_referrer FROM public.profiles p WHERE p.id = v_loser;
  IF v_referrer IS NOT NULL AND v_referrer <> v_loser
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_referrer) THEN
    v_ref_share := round(v_company * c_ref_rate, 8);
  ELSE
    v_referrer := NULL;
    v_ref_share := 0;
  END IF;
  v_admin_share := v_company - v_ref_share;

  SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_share > 0 AND v_admin_id IS NOT NULL THEN
    UPDATE public.profiles SET fxu_balance = fxu_balance + v_admin_share WHERE id = v_admin_id;
  END IF;

  IF v_referrer IS NOT NULL AND v_ref_share > 0 THEN
    UPDATE public.profiles SET fxu_balance = fxu_balance + v_ref_share WHERE id = v_referrer;
    INSERT INTO public.referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer, v_loser, NULL, 'casino_battleship_referral', v_ref_share);
  END IF;

  UPDATE public.battleship_entries
     SET fee = v_fee, pool_share = v_pool, daily_pool_share = v_daily, company_share = v_admin_share,
         referrer_id = v_referrer, referrer_share = v_ref_share
   WHERE match_id = p_match_id AND user_id = v_loser;

  IF v_admin_share > 0 THEN
    -- record_admin_revenue reparte la parte de los accionistas
    PERFORM public.record_admin_revenue('casino_battleship', v_admin_share,
      'Batalla de Naves: comision del perdedor', v_loser, p_match_id);
  END IF;

  -- Pools normales: se acumula y se envia en multiplos de 10
  SELECT * INTO v_cfg FROM public.battleship_config WHERE id = 1 FOR UPDATE;
  v_pending := v_cfg.pool_pending + v_pool;
  v_flush := floor(v_pending / 10) * 10;
  IF v_flush > 0 THEN
    PERFORM public.contribute_to_jackpot(v_flush, 'casino_battleship', v_loser);
    v_pending := v_pending - v_flush;
  END IF;
  UPDATE public.battleship_config
     SET pool_pending        = v_pending,
         daily_pool          = daily_pool + v_daily,
         daily_pool_total_in = daily_pool_total_in + v_daily,
         total_fees          = total_fees + v_fee,
         total_paid          = total_paid + m.pot,
         updated_at          = now()
   WHERE id = 1;
END;
$function$

