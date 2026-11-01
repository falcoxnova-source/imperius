CREATE OR REPLACE FUNCTION public.record_admin_revenue(p_revenue_type text, p_amount numeric, p_description text DEFAULT NULL::text, p_related_user_id uuid DEFAULT NULL::uuid, p_related_tx_id uuid DEFAULT NULL::uuid, p_currency text DEFAULT 'FXU'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_revenue_id uuid;
  v_currency   text;
BEGIN
  IF p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  v_currency := UPPER(COALESCE(p_currency, 'FXU'));
  IF v_currency NOT IN ('FXU', 'USDT') THEN
    RAISE EXCEPTION 'Invalid currency for admin_revenue: %', v_currency;
  END IF;

  INSERT INTO public.admin_revenue (revenue_type, amount, currency, description, related_user_id, related_tx_id)
  VALUES (p_revenue_type, p_amount, v_currency, p_description, p_related_user_id, p_related_tx_id)
  RETURNING id INTO v_revenue_id;

  -- Reparto a accionistas (no-op si no hay accionistas activos)
  PERFORM public._distribute_shareholder_share(v_revenue_id, p_revenue_type, p_amount, v_currency, p_related_user_id);

  RETURN v_revenue_id;
END;
$function$

