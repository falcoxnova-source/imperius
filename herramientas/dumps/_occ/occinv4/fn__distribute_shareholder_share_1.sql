CREATE OR REPLACE FUNCTION public._distribute_shareholder_share(p_revenue_id uuid, p_revenue_type text, p_amount numeric, p_currency text, p_related_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id    uuid;
  v_admin_bal   numeric;
  v_total_pct   numeric;
  v_total_share numeric;
  v_sh          record;
  v_share       numeric;
  v_fxu_equiv   numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('FXU','USDT') THEN RETURN; END IF;

  -- 'instant_ship' quema FXU del usuario (no llega a la billetera del admin): no repartir.
  IF p_revenue_type = 'instant_ship' THEN RETURN; END IF;

  SELECT COALESCE(SUM(percentage), 0) INTO v_total_pct
  FROM public.shareholders WHERE is_active AND percentage > 0;
  IF v_total_pct <= 0 THEN RETURN; END IF;

  SELECT id INTO v_admin_id
  FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NULL THEN RETURN; END IF;

  -- Total a repartir (nunca mas del 100% del fee) y saldo actual del admin.
  IF p_currency = 'FXU' THEN
    v_total_share := floor(p_amount * LEAST(v_total_pct, 100) / 100.0);
    SELECT COALESCE(fxu_balance, 0) INTO v_admin_bal FROM public.profiles WHERE id = v_admin_id;
  ELSE
    v_total_share := round(p_amount * LEAST(v_total_pct, 100) / 100.0, 8);
    SELECT COALESCE(usdt_balance, 0) INTO v_admin_bal FROM public.profiles WHERE id = v_admin_id;
  END IF;

  -- Defensa dura: si por cualquier motivo el admin no tiene fondos, no repartir
  -- (asi nunca queda en negativo).
  IF v_total_share <= 0 OR v_admin_bal < v_total_share THEN RETURN; END IF;

  -- Permitir mover fxu_balance / usdt_balance (triggers de proteccion).
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  FOR v_sh IN
    SELECT s.id, s.user_id, s.percentage
    FROM public.shareholders s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.is_active AND s.percentage > 0 AND s.user_id <> v_admin_id
    ORDER BY s.created_at
  LOOP
    IF p_currency = 'FXU' THEN
      v_share := floor(p_amount * v_sh.percentage / 100.0);
    ELSE
      v_share := round(p_amount * v_sh.percentage / 100.0, 8);
    END IF;

    IF v_share <= 0 THEN CONTINUE; END IF;

    IF p_currency = 'FXU' THEN
      UPDATE public.profiles SET fxu_balance  = fxu_balance  - v_share WHERE id = v_admin_id;
      UPDATE public.profiles SET fxu_balance  = fxu_balance  + v_share WHERE id = v_sh.user_id;
      v_fxu_equiv := v_share;
    ELSE
      UPDATE public.profiles SET usdt_balance = usdt_balance - v_share WHERE id = v_admin_id;
      UPDATE public.profiles SET usdt_balance = usdt_balance + v_share WHERE id = v_sh.user_id;
      v_fxu_equiv := v_share * 10000;  -- equivalente FXU (1 USDT = 10000 FXU)
    END IF;

    INSERT INTO public.shareholder_payouts
      (shareholder_id, user_id, revenue_type, amount, currency, percentage, related_revenue_id, related_user_id)
    VALUES
      (v_sh.id, v_sh.user_id, p_revenue_type, v_share, p_currency, v_sh.percentage, p_revenue_id, p_related_user_id);

    -- Contabilizar como gasto para que get_admin_available_balance siga exacto.
    INSERT INTO public.admin_expenses (expense_type, amount, description, related_user_id)
    VALUES ('shareholder_payout', v_fxu_equiv,
            'Reparto accionista ' || v_sh.percentage || '% (' || p_currency || ') ' || COALESCE(p_revenue_type,''),
            v_sh.user_id);
  END LOOP;
END;
$function$

