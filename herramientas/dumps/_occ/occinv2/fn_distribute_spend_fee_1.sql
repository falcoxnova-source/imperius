CREATE OR REPLACE FUNCTION public.distribute_spend_fee(p_amount numeric, p_source text, p_revenue_type text, p_user_id uuid, p_description text DEFAULT NULL::text, p_related_tx_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pool_pct numeric;
  v_ref_of_company_pct numeric;
  v_pool_share numeric;
  v_company_gross numeric;
  v_referrer_share numeric;
  v_admin_share numeric;
  v_referrer_id uuid;
  v_admin_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(value::numeric, 50) INTO v_pool_pct
  FROM game_settings WHERE key = 'spend_split_pool_share';
  SELECT COALESCE(value::numeric, 20) INTO v_ref_of_company_pct
  FROM game_settings WHERE key = 'spend_referral_of_company_pct';

  v_pool_pct := COALESCE(v_pool_pct, 50);
  v_ref_of_company_pct := COALESCE(v_ref_of_company_pct, 20);
  IF v_pool_pct < 0 THEN v_pool_pct := 0; END IF;
  IF v_pool_pct > 100 THEN v_pool_pct := 100; END IF;
  IF v_ref_of_company_pct < 0 THEN v_ref_of_company_pct := 0; END IF;
  IF v_ref_of_company_pct > 100 THEN v_ref_of_company_pct := 100; END IF;

  -- Pool base = pool_pct% del importe (50%)
  v_pool_share := FLOOR(p_amount * v_pool_pct / 100);
  -- Empresa (bruto) = resto (absorbe redondeo) (50%)
  v_company_gross := p_amount - v_pool_share;

  -- La parte del referido es SIEMPRE 20% de la parte de empresa (=10% del total)
  v_referrer_share := FLOOR(v_company_gross * v_ref_of_company_pct / 100);
  -- Empresa se queda SIEMPRE con el resto (=40% del total)
  v_admin_share := v_company_gross - v_referrer_share;
  IF v_admin_share < 0 THEN v_admin_share := 0; END IF;

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_user_id;

  IF v_referrer_id IS NULL THEN
    -- OPCION B: sin referido, su parte (10%) va al POOL, no a la empresa.
    v_pool_share := v_pool_share + v_referrer_share;
    v_referrer_share := 0;
  END IF;

  -- Habilitar el contexto para mover fxu_balance (trigger de proteccion)
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Empresa: wallet admin + ledger financiero
  IF v_admin_share > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL AND v_admin_id != p_user_id THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_admin_share WHERE id = v_admin_id;
    END IF;
    PERFORM record_admin_revenue(p_revenue_type, v_admin_share, COALESCE(p_description, p_source), p_user_id, p_related_tx_id);
  END IF;

  -- Pool: jackpot / destruccion
  IF v_pool_share > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_share, p_source, p_user_id);
  END IF;

  -- Referido: comision directa (sin spam de mensajes)
  IF v_referrer_share > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_referrer_share WHERE id = v_referrer_id;
    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer_id, p_user_id, NULL, p_source || '_referral', v_referrer_share);
  END IF;
END;
$function$

