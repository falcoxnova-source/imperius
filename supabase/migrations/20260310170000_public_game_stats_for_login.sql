/*
  # Public game stats RPC for login page

  Creates a function callable WITHOUT authentication (anon role) that returns
  aggregate game statistics to display on the login page.

  No sensitive data is exposed - only aggregate counts and totals.
*/

CREATE OR REPLACE FUNCTION get_public_game_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_total_players bigint;
  v_ranked_players bigint;
  v_total_deposited numeric;
  v_total_withdrawn numeric;
  v_market_transactions bigint;
  v_market_volume_usdt numeric;
  v_expedition_pool_fxu numeric;
  v_monthly_pool_fxu numeric;
BEGIN
  -- Total registered players
  SELECT COUNT(*) INTO v_total_players
  FROM profiles
  WHERE COALESCE(is_banned, false) = false;

  -- Players with points (active in ranking)
  SELECT COUNT(*) INTO v_ranked_players
  FROM profiles
  WHERE COALESCE(is_banned, false) = false
    AND COALESCE(points_total, 0) > 0;

  -- Total USDT deposited (confirmed transactions)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited
  FROM wallet_transactions
  WHERE tx_type = 'deposit' AND status = 'confirmed';

  -- Total USDT withdrawn (confirmed transactions)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_withdrawn
  FROM wallet_transactions
  WHERE tx_type = 'withdrawal' AND status = 'confirmed';

  -- Total P2P market transactions (total_price is in FXU, convert to USDT)
  SELECT COUNT(*), COALESCE(SUM(total_price), 0) * 0.0001
  INTO v_market_transactions, v_market_volume_usdt
  FROM market_transactions;

  -- Jackpot pools (FXU values)
  SELECT COALESCE(expedition_balance, 0), COALESCE(monthly_balance, 0)
  INTO v_expedition_pool_fxu, v_monthly_pool_fxu
  FROM jackpot_pools WHERE id = 1;

  RETURN jsonb_build_object(
    'total_players', v_total_players,
    'ranked_players', v_ranked_players,
    'total_deposited', ROUND(v_total_deposited, 2),
    'total_withdrawn', ROUND(v_total_withdrawn, 2),
    'market_transactions', v_market_transactions,
    'market_volume_usdt', ROUND(v_market_volume_usdt, 2),
    'expedition_pool_fxu', ROUND(v_expedition_pool_fxu, 3),
    'monthly_pool_fxu', ROUND(v_monthly_pool_fxu, 3),
    'total_jackpot_fxu', ROUND(v_expedition_pool_fxu + v_monthly_pool_fxu, 3)
  );
END;
$$;

-- Grant to both anon (login page) and authenticated
GRANT EXECUTE ON FUNCTION get_public_game_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_public_game_stats() TO authenticated;
