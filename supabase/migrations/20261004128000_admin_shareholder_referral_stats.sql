-- [SHREF1] Economia de referidos por accionista (SOLO LECTURA, solo admin).
-- Referido activo = last_activity en los ultimos 7 dias.
-- Depositos/retiros = wallet_transactions con status 'confirmed'.
-- Comisiones = referral_commissions.fxu_amount cobradas por el accionista.

CREATE OR REPLACE FUNCTION public.admin_shareholder_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH sh AS (
    SELECT s.id, s.user_id, s.email, s.percentage, s.is_active, s.created_at, p.username
    FROM public.shareholders s
    JOIN public.profiles p ON p.id = s.user_id
  ),
  refs AS (
    SELECT r.id, r.referred_by, r.created_at, r.last_activity, COALESCE(r.is_banned, false) AS banned
    FROM public.profiles r
    WHERE r.referred_by IN (SELECT user_id FROM sh)
  ),
  wt AS (
    SELECT w.user_id,
      COALESCE(SUM(w.amount) FILTER (WHERE w.tx_type = 'deposit'    AND w.token_type = 'TUNG'), 0) AS dep_tung,
      COALESCE(SUM(w.amount) FILTER (WHERE w.tx_type = 'deposit'    AND w.token_type = 'USDT'), 0) AS dep_usdt,
      COALESCE(SUM(w.amount) FILTER (WHERE w.tx_type = 'withdrawal' AND w.token_type = 'TUNG'), 0) AS wd_tung,
      COALESCE(SUM(w.amount) FILTER (WHERE w.tx_type = 'withdrawal' AND w.token_type = 'USDT'), 0) AS wd_usdt,
      COUNT(*) FILTER (WHERE w.tx_type = 'deposit') AS dep_count
    FROM public.wallet_transactions w
    WHERE w.status = 'confirmed'
      AND w.user_id IN (SELECT id FROM refs)
    GROUP BY w.user_id
  ),
  com AS (
    SELECT c.referrer_id, COALESCE(SUM(c.fxu_amount), 0) AS com_tung
    FROM public.referral_commissions c
    WHERE c.referrer_id IN (SELECT user_id FROM sh)
    GROUP BY c.referrer_id
  ),
  agg AS (
    SELECT r.referred_by AS user_id,
      COUNT(*) AS referrals_total,
      COUNT(*) FILTER (WHERE r.last_activity >= now() - interval '7 days' AND NOT r.banned) AS referrals_active,
      COUNT(*) FILTER (WHERE r.created_at >= now() - interval '30 days') AS referrals_new_30d,
      COUNT(*) FILTER (WHERE r.banned) AS referrals_banned,
      COUNT(*) FILTER (WHERE COALESCE(wt.dep_count, 0) > 0) AS investors,
      COALESCE(SUM(wt.dep_tung), 0) AS dep_tung,
      COALESCE(SUM(wt.dep_usdt), 0) AS dep_usdt,
      COALESCE(SUM(wt.wd_tung), 0)  AS wd_tung,
      COALESCE(SUM(wt.wd_usdt), 0)  AS wd_usdt,
      MAX(r.created_at) AS last_referral_at
    FROM refs r
    LEFT JOIN wt ON wt.user_id = r.id
    GROUP BY r.referred_by
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'shareholder_id', sh.id,
      'user_id', sh.user_id,
      'username', sh.username,
      'email', sh.email,
      'percentage', sh.percentage,
      'is_active', sh.is_active,
      'referrals_total', COALESCE(agg.referrals_total, 0),
      'referrals_active', COALESCE(agg.referrals_active, 0),
      'referrals_inactive', COALESCE(agg.referrals_total, 0) - COALESCE(agg.referrals_active, 0),
      'referrals_new_30d', COALESCE(agg.referrals_new_30d, 0),
      'referrals_banned', COALESCE(agg.referrals_banned, 0),
      'investors', COALESCE(agg.investors, 0),
      'dep_tung', COALESCE(agg.dep_tung, 0),
      'dep_usdt', COALESCE(agg.dep_usdt, 0),
      'wd_tung', COALESCE(agg.wd_tung, 0),
      'wd_usdt', COALESCE(agg.wd_usdt, 0),
      'commissions_tung', COALESCE(com.com_tung, 0),
      'last_referral_at', agg.last_referral_at
    ) ORDER BY COALESCE(agg.referrals_total, 0) DESC), '[]'::jsonb)
  INTO v_result
  FROM sh
  LEFT JOIN agg ON agg.user_id = sh.user_id
  LEFT JOIN com ON com.referrer_id = sh.user_id;

  RETURN jsonb_build_object('success', true, 'generated_at', now(), 'active_days', 7, 'shareholders', v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_shareholder_referrals(p_shareholder_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT user_id INTO v_user FROM public.shareholders WHERE id = p_shareholder_id;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accionista no encontrado');
  END IF;

  WITH refs AS (
    SELECT r.id, r.username, r.created_at, r.last_activity, COALESCE(r.is_banned, false) AS banned
    FROM public.profiles r
    WHERE r.referred_by = v_user
  ),
  wt AS (
    SELECT w.user_id,
      COALESCE(SUM(w.amount) FILTER (WHERE w.tx_type = 'deposit'    AND w.token_type = 'TUNG'), 0) AS dep_tung,
      COALESCE(SUM(w.amount) FILTER (WHERE w.tx_type = 'deposit'    AND w.token_type = 'USDT'), 0) AS dep_usdt,
      COALESCE(SUM(w.amount) FILTER (WHERE w.tx_type = 'withdrawal' AND w.token_type = 'TUNG'), 0) AS wd_tung,
      COALESCE(SUM(w.amount) FILTER (WHERE w.tx_type = 'withdrawal' AND w.token_type = 'USDT'), 0) AS wd_usdt
    FROM public.wallet_transactions w
    WHERE w.status = 'confirmed'
      AND w.user_id IN (SELECT id FROM refs)
    GROUP BY w.user_id
  ),
  com AS (
    SELECT c.seller_id, COALESCE(SUM(c.fxu_amount), 0) AS com_tung
    FROM public.referral_commissions c
    WHERE c.referrer_id = v_user
      AND c.seller_id IN (SELECT id FROM refs)
    GROUP BY c.seller_id
  ),
  rows AS (
    SELECT r.username, r.created_at, r.last_activity, r.banned,
      (r.last_activity >= now() - interval '7 days' AND NOT r.banned) AS is_active,
      COALESCE(wt.dep_tung, 0) AS dep_tung, COALESCE(wt.dep_usdt, 0) AS dep_usdt,
      COALESCE(wt.wd_tung, 0)  AS wd_tung,  COALESCE(wt.wd_usdt, 0)  AS wd_usdt,
      COALESCE(com.com_tung, 0) AS commissions_tung
    FROM refs r
    LEFT JOIN wt  ON wt.user_id  = r.id
    LEFT JOIN com ON com.seller_id = r.id
    ORDER BY COALESCE(wt.dep_tung, 0) DESC, COALESCE(wt.dep_usdt, 0) DESC, r.last_activity DESC NULLS LAST
    LIMIT 1000
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) INTO v_result FROM rows;

  RETURN jsonb_build_object('success', true, 'referrals', v_result);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_shareholder_referral_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_shareholder_referrals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_shareholder_referral_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_shareholder_referrals(uuid) TO authenticated, service_role;

-- Endurecimiento: anon no necesita leer accionistas ni sus pagos (RLS ya devolvia 0 filas).
REVOKE SELECT ON public.shareholders, public.shareholder_payouts FROM anon;

NOTIFY pgrst, 'reload schema';
