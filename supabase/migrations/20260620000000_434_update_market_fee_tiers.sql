-- ============================================
-- Update market sell commission tiers
-- VIP -> 10%, Top 50 -> 15%, Top 100 -> 20%, Top 200 -> 30%, Rest -> 40%
-- Only updates fee values, keeps function name/signature intact.
-- ============================================
CREATE OR REPLACE FUNCTION get_market_fee_for_user(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank integer;
  v_is_plus boolean;
BEGIN
  -- Check VIP first
  v_is_plus := is_user_plus(p_user_id);

  IF v_is_plus THEN
    RETURN 10;
  END IF;

  -- Get user ranking
  SELECT COALESCE(rank_position, 9999) INTO v_rank
  FROM profiles WHERE id = p_user_id;

  -- Fee tiers by ranking
  IF v_rank <= 50 THEN
    RETURN 15;
  ELSIF v_rank <= 100 THEN
    RETURN 20;
  ELSIF v_rank <= 200 THEN
    RETURN 30;
  ELSE
    RETURN 40;
  END IF;
END;
$$;

-- Keep get_my_market_fee fallback consistent with the "Rest" tier (40%)
CREATE OR REPLACE FUNCTION get_my_market_fee()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fee numeric;
  v_is_plus boolean;
  v_rank integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('fee_percent', 40, 'is_plus', false, 'rank', 9999);
  END IF;

  v_is_plus := is_user_plus(v_user_id);

  SELECT COALESCE(rank_position, 9999) INTO v_rank
  FROM profiles WHERE id = v_user_id;

  v_fee := get_market_fee_for_user(v_user_id);

  RETURN jsonb_build_object(
    'fee_percent', v_fee,
    'is_plus', v_is_plus,
    'rank', v_rank
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_market_fee_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_market_fee() TO authenticated;
