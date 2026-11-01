-- ============================================================================
-- 20260714_referral_breakdown.sql
-- Agrega el desglose de comisiones POR ORIGEN a get_referral_stats, para que el
-- referidor vea de donde viene cada ganancia (mercado, retiros, misiones,
-- aceleraciones, oficiales, etc.). Solo lectura/agregacion, sin cambiar montos.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_referral_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_referral_code text;
  v_total_referrals int;
  v_total_fxu numeric;
  v_total_usdt numeric;
  v_total_metal numeric;
  v_total_crystal numeric;
  v_total_deuterium numeric;
  v_recent_commissions jsonb;
  v_by_type jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT referral_code INTO v_referral_code FROM profiles WHERE id = v_user_id;

  IF v_referral_code IS NULL THEN
    v_referral_code := UPPER(SUBSTRING(v_user_id::text, 1, 8));
    UPDATE profiles SET referral_code = v_referral_code WHERE id = v_user_id;
  END IF;

  SELECT COUNT(*) INTO v_total_referrals FROM profiles WHERE referred_by = v_user_id;

  -- Totales por moneda.
  SELECT
    COALESCE(SUM(CASE WHEN COALESCE(resource_type, 'fxu') = 'fxu' THEN COALESCE(fxu_amount, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN resource_type = 'usdt' THEN COALESCE(fxu_amount, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'metal' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'crystal' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'deuterium' THEN amount ELSE 0 END), 0)
  INTO v_total_fxu, v_total_usdt, v_total_metal, v_total_crystal, v_total_deuterium
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  -- Desglose por origen (commission_type) y moneda.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'commission_type', g.commission_type,
        'currency', g.currency,
        'resource_type', g.resource_type_out,
        'count', g.cnt,
        'total', g.total
      ) ORDER BY g.total DESC
    ),
    '[]'::jsonb
  )
  INTO v_by_type
  FROM (
    SELECT
      commission_type,
      CASE
        WHEN resource_type = 'usdt' THEN 'usdt'
        WHEN resource_type IN ('metal', 'crystal', 'deuterium') THEN 'resource'
        ELSE 'fxu'
      END AS currency,
      CASE WHEN resource_type IN ('metal', 'crystal', 'deuterium') THEN resource_type ELSE NULL END AS resource_type_out,
      COUNT(*) AS cnt,
      SUM(CASE WHEN resource_type IN ('metal', 'crystal', 'deuterium') THEN COALESCE(amount, 0) ELSE COALESCE(fxu_amount, 0) END) AS total
    FROM referral_commissions
    WHERE referrer_id = v_user_id
    GROUP BY 1, 2, 3
  ) g
  WHERE g.total > 0;

  -- Ultimas 20 comisiones.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'amount', x.disp_amount,
        'commission_type', x.commission_type,
        'resource_type', x.resource_type,
        'created_at', x.created_at,
        'seller_username', x.seller_username
      ) ORDER BY x.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_commissions
  FROM (
    SELECT
      rc.id,
      COALESCE(rc.fxu_amount, rc.amount) AS disp_amount,
      rc.commission_type,
      rc.resource_type,
      rc.created_at,
      p.username AS seller_username
    FROM referral_commissions rc
    JOIN profiles p ON p.id = rc.seller_id
    WHERE rc.referrer_id = v_user_id
    ORDER BY rc.created_at DESC
    LIMIT 20
  ) x;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_fxu', v_total_fxu,
    'total_usdt', v_total_usdt,
    'total_metal', v_total_metal,
    'total_crystal', v_total_crystal,
    'total_deuterium', v_total_deuterium,
    'by_type', v_by_type,
    'recent_commissions', v_recent_commissions
  );
END;
$function$;

COMMIT;
