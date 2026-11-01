-- Fix get_my_monthly_market_sales to return monthly_limit_enabled and related fields
-- that the frontend MarketPage expects
CREATE OR REPLACE FUNCTION get_my_monthly_market_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id uuid;
  v_year_week text;
  v_metal_sold bigint := 0;
  v_crystal_sold bigint := 0;
  v_deuterium_sold bigint := 0;
  v_limit_metal bigint := 0;
  v_limit_crystal bigint := 0;
  v_limit_deuterium bigint := 0;
  v_active_metal bigint := 0;
  v_active_crystal bigint := 0;
  v_active_deuterium bigint := 0;
  v_total_metal bigint;
  v_total_crystal bigint;
  v_total_deuterium bigint;
  v_limits RECORD;
  v_is_plus boolean;
  v_limit_enabled boolean;
  v_fxu_spent numeric := 0;
  v_fxu_earned numeric := 0;
  v_fxu_limit numeric := 0;
  v_fxu_value_sold numeric := 0;
  v_fxu_value_active numeric := 0;
  v_fxu_remaining numeric;
  v_has_credit boolean := false;
  v_fxu_exhausted boolean := false;
  v_ships_value_sold bigint := 0;
  v_active_ships_value bigint := 0;
  v_ships_value_remaining bigint;
  v_user_points bigint := 0;
  v_monthly_limit bigint := 0;
  v_week_reset timestamp;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  v_year_week := to_char(now(), 'IYYY-"W"IW');

  -- Get limits config
  SELECT * INTO v_limits FROM market_resource_limits WHERE id = 1;
  v_limit_enabled := COALESCE(v_limits.monthly_limit_enabled, false);
  v_limit_metal := COALESCE(v_limits.monthly_limit_metal, 0);
  v_limit_crystal := COALESCE(v_limits.monthly_limit_crystal, 0);
  v_limit_deuterium := COALESCE(v_limits.monthly_limit_deuterium, 0);

  -- Check VIP Plus
  v_is_plus := is_user_plus(v_user_id);

  -- Get completed sales this week
  SELECT COALESCE(metal_sold,0), COALESCE(crystal_sold,0), COALESCE(deuterium_sold,0),
         COALESCE(fxu_value_sold,0), COALESCE(ships_value_sold,0)
  INTO v_metal_sold, v_crystal_sold, v_deuterium_sold, v_fxu_value_sold, v_ships_value_sold
  FROM market_monthly_sales WHERE user_id = v_user_id AND year_month = v_year_week;

  -- Get active listings
  SELECT COALESCE(SUM(CASE WHEN item_code='metal' THEN quantity ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN item_code='crystal' THEN quantity ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN item_code='deuterium' THEN quantity ELSE 0 END),0)
  INTO v_active_metal, v_active_crystal, v_active_deuterium
  FROM market_listings WHERE seller_id = v_user_id AND listing_type = 'resource' AND status = 'active'
  AND created_at >= date_trunc('week', now());

  -- Active ships value
  SELECT COALESCE(SUM(ml.quantity * (COALESCE(st.metal_cost,0) + COALESCE(st.crystal_cost,0) + COALESCE(st.deuterium_cost,0))), 0)
  INTO v_active_ships_value
  FROM market_listings ml JOIN ship_types st ON st.code = ml.item_code
  WHERE ml.seller_id = v_user_id AND ml.listing_type = 'ship' AND ml.status = 'active'
    AND ml.created_at >= date_trunc('week', now());

  -- Active FXU value
  SELECT COALESCE(SUM(ml.quantity * ml.price_per_unit), 0) INTO v_fxu_value_active
  FROM market_listings ml
  WHERE ml.seller_id = v_user_id AND ml.status = 'active'
    AND ml.listing_type IN ('resource', 'ship')
    AND ml.created_at >= date_trunc('week', now());

  v_total_metal := v_metal_sold + v_active_metal;
  v_total_crystal := v_crystal_sold + v_active_crystal;
  v_total_deuterium := v_deuterium_sold + v_active_deuterium;

  -- Calculate FXU limit and credit
  v_fxu_limit := calculate_fxu_weekly_limit(v_user_id);
  v_fxu_remaining := v_fxu_limit - v_fxu_value_sold - v_fxu_value_active;
  v_has_credit := v_fxu_limit > 0;
  v_fxu_exhausted := v_has_credit AND v_fxu_remaining <= 0;

  -- Calculate monthly limit based on points
  v_monthly_limit := calculate_monthly_market_limit(v_user_id);
  SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = v_user_id;

  -- Ships value remaining
  v_ships_value_remaining := v_monthly_limit - v_ships_value_sold - v_active_ships_value;

  -- Week reset: next Monday midnight UTC
  v_week_reset := date_trunc('week', now()) + interval '7 days';

  RETURN jsonb_build_object(
    'success', true,
    'monthly_limit_enabled', v_limit_enabled,
    'vip_unlimited', v_is_plus,
    'year_month', v_year_week,
    'monthly_limit', v_monthly_limit,
    'user_points', v_user_points,
    'fxu_spent', 0,
    'fxu_earned', 0,
    'fxu_credit', v_fxu_limit,
    'fxu_limit', v_fxu_limit,
    'fxu_value_sold', v_fxu_value_sold,
    'fxu_value_remaining', GREATEST(0, v_fxu_remaining),
    'has_credit', v_has_credit,
    'fxu_exhausted', v_fxu_exhausted,
    'metal_sold', v_total_metal,
    'crystal_sold', v_total_crystal,
    'deuterium_sold', v_total_deuterium,
    'metal_completed', v_metal_sold,
    'crystal_completed', v_crystal_sold,
    'deuterium_completed', v_deuterium_sold,
    'metal_active', v_active_metal,
    'crystal_active', v_active_crystal,
    'deuterium_active', v_active_deuterium,
    'metal_limit', v_limit_metal,
    'crystal_limit', v_limit_crystal,
    'deuterium_limit', v_limit_deuterium,
    'metal_remaining', GREATEST(0, v_limit_metal - v_total_metal),
    'crystal_remaining', GREATEST(0, v_limit_crystal - v_total_crystal),
    'deuterium_remaining', GREATEST(0, v_limit_deuterium - v_total_deuterium),
    'ships_value_sold', v_ships_value_sold + v_active_ships_value,
    'ships_value_remaining', GREATEST(0, v_ships_value_remaining),
    'week_resets_at', to_char(v_week_reset, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
END;
$$;
