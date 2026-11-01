/*
  # Fix v_sales record field names in get_my_monthly_market_sales

  ## Problem
  When no sales record exists for the current week, the function assigns
  `v_sales := ROW(0::bigint, 0::bigint, 0::bigint)` which creates an anonymous
  record without named fields. Subsequent access to `v_sales.metal_sold` fails
  with error: 'record "v_sales" has no field "metal_sold"'.

  ## Fix
  Instead of assigning an anonymous ROW, assign default values to individual
  variables, avoiding the unnamed record issue entirely.

  ## Security
  - No security changes
*/

CREATE OR REPLACE FUNCTION public.get_my_monthly_market_sales()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_user_id uuid;
v_year_week text;
v_metal_sold bigint;
v_crystal_sold bigint;
v_deuterium_sold bigint;
v_limits RECORD;
v_active_metal bigint;
v_active_crystal bigint;
v_active_deuterium bigint;
v_total_metal bigint;
v_total_crystal bigint;
v_total_deuterium bigint;
v_user_points integer;
v_weekly_limit bigint;
v_fxu_spent numeric;
v_multiplier numeric;
v_week_resets_at timestamptz;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
END IF;

v_year_week := to_char(now(), 'IYYY-"W"IW');

SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;

IF NOT v_limits.monthly_limit_enabled THEN
RETURN jsonb_build_object(
'success', true,
'monthly_limit_enabled', false
);
END IF;

SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = v_user_id;
v_fxu_spent := get_user_lifetime_fxu_spent(v_user_id);

SELECT COALESCE(value::numeric, 10) INTO v_multiplier
FROM game_settings WHERE key = 'monthly_limit_fxu_multiplier';
v_multiplier := COALESCE(v_multiplier, 10);

v_weekly_limit := calculate_monthly_market_limit(v_user_id);

v_week_resets_at := date_trunc('week', now()) + interval '7 days';

SELECT
COALESCE(metal_sold, 0),
COALESCE(crystal_sold, 0),
COALESCE(deuterium_sold, 0)
INTO v_metal_sold, v_crystal_sold, v_deuterium_sold
FROM market_monthly_sales
WHERE user_id = v_user_id AND year_month = v_year_week;

IF NOT FOUND THEN
  v_metal_sold := 0;
  v_crystal_sold := 0;
  v_deuterium_sold := 0;
END IF;

SELECT
COALESCE(SUM(CASE WHEN item_code = 'metal' THEN quantity ELSE 0 END), 0),
COALESCE(SUM(CASE WHEN item_code = 'crystal' THEN quantity ELSE 0 END), 0),
COALESCE(SUM(CASE WHEN item_code = 'deuterium' THEN quantity ELSE 0 END), 0)
INTO v_active_metal, v_active_crystal, v_active_deuterium
FROM market_listings
WHERE seller_id = v_user_id
AND listing_type = 'resource'
AND status = 'active'
AND created_at >= date_trunc('week', now());

v_total_metal := v_metal_sold + v_active_metal;
v_total_crystal := v_crystal_sold + v_active_crystal;
v_total_deuterium := v_deuterium_sold + v_active_deuterium;

RETURN jsonb_build_object(
'success', true,
'monthly_limit_enabled', true,
'year_month', v_year_week,
'user_points', v_user_points,
'fxu_spent', v_fxu_spent,
'fxu_multiplier', v_multiplier,
'fxu_bonus', FLOOR(v_fxu_spent * v_multiplier),
'weekly_limit', v_weekly_limit,
'monthly_limit', v_weekly_limit,
'week_resets_at', v_week_resets_at,
'metal_sold', v_total_metal,
'crystal_sold', v_total_crystal,
'deuterium_sold', v_total_deuterium,
'metal_completed', v_metal_sold,
'crystal_completed', v_crystal_sold,
'deuterium_completed', v_deuterium_sold,
'metal_active', v_active_metal,
'crystal_active', v_active_crystal,
'deuterium_active', v_active_deuterium,
'metal_remaining', GREATEST(0, v_weekly_limit - v_total_metal),
'crystal_remaining', GREATEST(0, v_weekly_limit - v_total_crystal),
'deuterium_remaining', GREATEST(0, v_weekly_limit - v_total_deuterium)
);
END;
$function$;
