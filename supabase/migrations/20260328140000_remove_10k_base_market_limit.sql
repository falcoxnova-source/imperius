/*
  # Remove 10K base from market sell limit formula

  Old formula: 10,000 + points_total + FLOOR(fxu_spent × multiplier)
  New formula: points_total + FLOOR(fxu_spent × multiplier)

  No other changes.
*/

CREATE OR REPLACE FUNCTION calculate_monthly_market_limit(p_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_points integer;
  v_fxu_spent numeric;
  v_multiplier numeric;
  v_monthly_limit bigint;
BEGIN
  SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = p_user_id;

  v_fxu_spent := get_user_lifetime_fxu_spent(p_user_id);

  SELECT COALESCE(value::numeric, 10) INTO v_multiplier
  FROM game_settings WHERE key = 'monthly_limit_fxu_multiplier';
  v_multiplier := COALESCE(v_multiplier, 10);

  v_monthly_limit := v_user_points + FLOOR(v_fxu_spent * v_multiplier);

  RETURN v_monthly_limit;
END;
$$;
