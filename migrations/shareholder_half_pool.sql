-- Reparto accionistas: de la parte de empresa (lo que llega a record_admin_revenue),
-- la empresa se queda automaticamente el 50%; el otro 50% es el 100% a repartir
-- segun el % de cada accionista. Lo no asignado queda en la cuenta admin.
-- Referidos y pools sin cambios.

CREATE OR REPLACE FUNCTION public._distribute_shareholder_share(p_revenue_id uuid, p_revenue_type text, p_amount numeric, p_currency text, p_related_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id   uuid;
  v_admin_bal  numeric;
  v_sh         record;
  v_exact      numeric;
  v_pending    numeric;
  v_pay        numeric;
  v_fxu_equiv  numeric;
  v_sh_pool    numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('FXU','USDT') THEN RETURN; END IF;

  -- 'instant_ship' quema FXU del usuario (no llega a la billetera del admin): no repartir.
  IF p_revenue_type = 'instant_ship' THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.shareholders WHERE is_active AND percentage > 0) THEN RETURN; END IF;

  -- La empresa se queda el 50%; el otro 50% es el 100% de los accionistas.
  v_sh_pool := p_amount * 0.5;

  SELECT id INTO v_admin_id
  FROM public.profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NULL THEN RETURN; END IF;

  -- Bloquear primero la fila del admin (orden fijo de locks: admin -> accionistas)
  IF p_currency = 'FXU' THEN
    SELECT COALESCE(fxu_balance, 0) INTO v_admin_bal FROM public.profiles WHERE id = v_admin_id FOR UPDATE;
  ELSE
    SELECT COALESCE(usdt_balance, 0) INTO v_admin_bal FROM public.profiles WHERE id = v_admin_id FOR UPDATE;
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  FOR v_sh IN
    SELECT s.id, s.user_id, s.percentage
    FROM public.shareholders s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.is_active AND s.percentage > 0 AND s.user_id <> v_admin_id
    ORDER BY s.created_at, s.id
  LOOP
    v_exact := round(v_sh_pool * v_sh.percentage / 100.0, 8);
    IF v_exact <= 0 THEN CONTINUE; END IF;

    IF p_currency = 'FXU' THEN
      UPDATE public.shareholders SET pending_fxu = pending_fxu + v_exact
      WHERE id = v_sh.id RETURNING pending_fxu INTO v_pending;
      v_pay := floor(v_pending);
    ELSE
      UPDATE public.shareholders SET pending_usdt = pending_usdt + v_exact
      WHERE id = v_sh.id RETURNING pending_usdt INTO v_pending;
      v_pay := trunc(v_pending, 8);
    END IF;

    -- Nunca dejar al admin en negativo: si no alcanza, queda pendiente.
    IF v_pay <= 0 OR v_admin_bal < v_pay THEN CONTINUE; END IF;

    IF p_currency = 'FXU' THEN
      UPDATE public.profiles SET fxu_balance = fxu_balance - v_pay WHERE id = v_admin_id;
      UPDATE public.profiles SET fxu_balance = fxu_balance + v_pay WHERE id = v_sh.user_id;
      UPDATE public.shareholders SET pending_fxu = pending_fxu - v_pay WHERE id = v_sh.id;
      v_fxu_equiv := v_pay;
    ELSE
      UPDATE public.profiles SET usdt_balance = usdt_balance - v_pay WHERE id = v_admin_id;
      UPDATE public.profiles SET usdt_balance = usdt_balance + v_pay WHERE id = v_sh.user_id;
      UPDATE public.shareholders SET pending_usdt = pending_usdt - v_pay WHERE id = v_sh.id;
      v_fxu_equiv := v_pay * 10000;  -- equivalente FXU (1 USDT = 10000 FXU)
    END IF;
    v_admin_bal := v_admin_bal - v_pay;

    INSERT INTO public.shareholder_payouts
      (shareholder_id, user_id, revenue_type, amount, currency, percentage, related_revenue_id, related_user_id)
    VALUES
      (v_sh.id, v_sh.user_id, p_revenue_type, v_pay, p_currency, v_sh.percentage, p_revenue_id, p_related_user_id);

    INSERT INTO public.admin_expenses (expense_type, amount, description, related_user_id)
    VALUES ('shareholder_payout', v_fxu_equiv,
            'Reparto accionista ' || v_sh.percentage || '% del 50% (' || p_currency || ') ' || COALESCE(p_revenue_type,''),
            v_sh.user_id);
  END LOOP;
END;
$function$;

-- Funciones internas del flujo de ingresos: solo invocables desde otras funciones (SECURITY DEFINER).
REVOKE EXECUTE ON FUNCTION public._distribute_shareholder_share(uuid, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_admin_revenue(text, numeric, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.distribute_spend_fee(numeric, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contribute_to_jackpot(numeric, text, uuid) FROM PUBLIC, anon, authenticated;
