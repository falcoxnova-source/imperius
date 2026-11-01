/*
  # Market Formula: Recoverable FXU Credit System

  Changes the market limit formula from permanent multiplier to recoverable credit:
  
  OLD: limit = ranking_points + FLOOR(fxu_spent × multiplier)
  NEW: limit = ranking_points + GREATEST(0, fxu_spent - fxu_earned_from_selling)

  The FXU spent creates a "credit line" that depletes as the user earns FXU 
  from market sales. Once they've recovered 100% of what they spent, 
  only ranking points remain as their limit.

  Changes:
  - NEW: get_user_market_earnings(p_user_id) — sums total_price from market_transactions for seller
  - MODIFY: calculate_monthly_market_limit — new formula with recoverable credit
  - MODIFY: get_my_monthly_market_sales — returns fxu_earned + fxu_credit instead of fxu_multiplier + fxu_bonus

  No tables created, no columns added, no renames.
*/

-- 1. New function: get total FXU earned from market sales (gross total_price)
CREATE OR REPLACE FUNCTION public.get_user_market_earnings(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(total_price), 0) INTO v_total
  FROM market_transactions
  WHERE seller_id = p_user_id;

  RETURN v_total;
END;
$function$;

-- 2. Modified calculate_monthly_market_limit: recoverable credit formula
CREATE OR REPLACE FUNCTION public.calculate_monthly_market_limit(p_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_points integer;
  v_fxu_spent numeric;
  v_fxu_earned numeric;
  v_fxu_credit numeric;
  v_monthly_limit bigint;
BEGIN
  SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = p_user_id;

  v_fxu_spent := get_user_lifetime_fxu_spent(p_user_id);
  v_fxu_earned := get_user_market_earnings(p_user_id);

  v_fxu_credit := GREATEST(0, v_fxu_spent - v_fxu_earned);

  v_monthly_limit := v_user_points + FLOOR(v_fxu_credit);

  RETURN v_monthly_limit;
END;
$function$;

-- 3. Modified get_my_monthly_market_sales: return new fields
CREATE OR REPLACE FUNCTION public.get_my_monthly_market_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_year_week text;
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
  v_fxu_earned numeric;
  v_fxu_credit numeric;
  v_metal_sold bigint;
  v_crystal_sold bigint;
  v_deuterium_sold bigint;
  v_db_ships_value_sold bigint;
  v_active_ships_value bigint;
  v_total_ships_value bigint;
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
  v_fxu_earned := get_user_market_earnings(v_user_id);
  v_fxu_credit := GREATEST(0, v_fxu_spent - v_fxu_earned);

  v_weekly_limit := calculate_monthly_market_limit(v_user_id);

  SELECT
    COALESCE(metal_sold, 0),
    COALESCE(crystal_sold, 0),
    COALESCE(deuterium_sold, 0),
    COALESCE(ships_value_sold, 0)
  INTO v_metal_sold, v_crystal_sold, v_deuterium_sold, v_db_ships_value_sold
  FROM market_monthly_sales
  WHERE user_id = v_user_id AND year_month = v_year_week;

  v_metal_sold := COALESCE(v_metal_sold, 0);
  v_crystal_sold := COALESCE(v_crystal_sold, 0);
  v_deuterium_sold := COALESCE(v_deuterium_sold, 0);
  v_db_ships_value_sold := COALESCE(v_db_ships_value_sold, 0);

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

  -- Active ship listings value
  SELECT COALESCE(SUM(
    ml.quantity * (COALESCE(st.metal_cost, 0) + COALESCE(st.crystal_cost, 0) + COALESCE(st.deuterium_cost, 0))
  ), 0) INTO v_active_ships_value
  FROM market_listings ml
  JOIN ship_types st ON st.code = ml.item_code
  WHERE ml.seller_id = v_user_id
    AND ml.listing_type = 'ship'
    AND ml.status = 'active'
    AND ml.created_at >= date_trunc('week', now());

  v_total_metal := v_metal_sold + v_active_metal;
  v_total_crystal := v_crystal_sold + v_active_crystal;
  v_total_deuterium := v_deuterium_sold + v_active_deuterium;

  v_total_ships_value := v_db_ships_value_sold + v_active_ships_value;

  RETURN jsonb_build_object(
    'success', true,
    'monthly_limit_enabled', true,
    'year_month', v_year_week,
    'user_points', v_user_points,
    'fxu_spent', v_fxu_spent,
    'fxu_earned', v_fxu_earned,
    'fxu_credit', FLOOR(v_fxu_credit),
    'monthly_limit', v_weekly_limit,
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
    'deuterium_remaining', GREATEST(0, v_weekly_limit - v_total_deuterium),
    'ships_value_sold', v_total_ships_value,
    'ships_value_completed', v_db_ships_value_sold,
    'ships_value_active', v_active_ships_value,
    'ships_value_remaining', GREATEST(0, v_weekly_limit - v_total_ships_value)
  );
END;
$function$;
