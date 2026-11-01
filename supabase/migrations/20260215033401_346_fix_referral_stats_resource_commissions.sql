/*
  # Fix get_referral_stats() - Resource Commissions Invisible

  ## Problem
  `get_referral_stats()` used `COALESCE(fxu_amount, amount)` to compute totals.
  Resource commissions are stored with `fxu_amount = 0` (not NULL), so
  `COALESCE(0, amount)` returns 0 instead of falling through to `amount`.
  All resource-type commissions (metal, crystal, deuterium) were counted as 0,
  making them invisible to users on the referral stats page.

  Additionally, `commission_type` and `resource_type` were hardcoded to 'fxu'
  in the recent commissions array, hiding the actual resource type.

  ## Fix
  - Separate totals: `total_fxu`, `total_metal`, `total_crystal`, `total_deuterium`
  - Use `CASE WHEN` instead of `COALESCE` to pick the correct amount column
  - Return actual `commission_type` and `resource_type` per commission entry

  ## Impact
  - No tables changed
  - No RLS changes
  - Read-only stats function, zero risk to existing data
*/

CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_referral_code text;
  v_total_referrals int;
  v_total_fxu numeric;
  v_total_metal numeric;
  v_total_crystal numeric;
  v_total_deuterium numeric;
  v_recent_commissions jsonb;
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

  SELECT
    COALESCE(SUM(CASE WHEN commission_type = 'fxu' THEN fxu_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'metal' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'crystal' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN commission_type = 'resource' AND resource_type = 'deuterium' THEN amount ELSE 0 END), 0)
  INTO v_total_fxu, v_total_metal, v_total_crystal, v_total_deuterium
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'amount', CASE WHEN rc.commission_type = 'fxu' THEN rc.fxu_amount ELSE rc.amount END,
        'commission_type', rc.commission_type,
        'resource_type', rc.resource_type,
        'created_at', rc.created_at,
        'seller_username', p.username
      ) ORDER BY rc.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_commissions
  FROM referral_commissions rc
  JOIN profiles p ON p.id = rc.seller_id
  WHERE rc.referrer_id = v_user_id
  LIMIT 20;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_fxu', v_total_fxu,
    'total_metal', v_total_metal,
    'total_crystal', v_total_crystal,
    'total_deuterium', v_total_deuterium,
    'recent_commissions', v_recent_commissions
  );
END;
$$;
