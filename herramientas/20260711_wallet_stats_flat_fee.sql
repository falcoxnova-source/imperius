-- Expose flat withdrawal fees + live TUNG price via get_wallet_stats so the
-- withdraw UI can show the real (flat) fee instead of a stale percentage.
-- Only NEW keys are added; every existing key is preserved unchanged.
CREATE OR REPLACE FUNCTION public.get_wallet_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_fxu_balance numeric;
  v_usdt_balance numeric;
  v_total_deposited numeric;
  v_total_withdrawn numeric;
  v_total_deposited_usdt numeric;
  v_total_withdrawn_usdt numeric;
  v_pending_withdrawals numeric;
  v_pending_withdrawals_usdt numeric;
  v_daily_withdrawn numeric;
  v_daily_withdrawn_usdt numeric;
  v_config wallet_config%ROWTYPE;
  v_fee_usd numeric;
  v_fee_usdt_flat numeric;
  v_tung_price numeric;
  v_fee_tung numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT fxu_balance, usdt_balance INTO v_fxu_balance, v_usdt_balance FROM profiles WHERE id = v_user_id;

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposited
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'deposit' AND token_type = 'TUNG' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawn
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'TUNG' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'TUNG' AND status IN ('pending', 'processing');

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposited_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'deposit' AND token_type = 'USDT' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawn_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'USDT' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals_usdt
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'USDT' AND status IN ('pending', 'processing');

  v_daily_withdrawn := get_daily_withdrawal_total(v_user_id);
  v_daily_withdrawn_usdt := get_daily_usdt_withdrawal_total(v_user_id);

  SELECT * INTO v_config FROM wallet_config WHERE id = 1;

  -- Flat withdrawal fees (source of truth used by request_withdrawal*)
  SELECT COALESCE(value::numeric, 1) INTO v_fee_usd FROM game_settings WHERE key = 'withdrawal_fee_usd';
  v_fee_usd := COALESCE(v_fee_usd, 1);
  SELECT COALESCE(value::numeric, 1) INTO v_fee_usdt_flat FROM game_settings WHERE key = 'usdt_withdrawal_fee_flat';
  v_fee_usdt_flat := COALESCE(v_fee_usdt_flat, 1);
  v_tung_price := get_live_tung_price_usd();
  IF v_tung_price IS NOT NULL AND v_tung_price > 0 THEN
    v_fee_tung := v_fee_usd / v_tung_price;
  ELSE
    v_fee_tung := NULL;
  END IF;

  RETURN jsonb_build_object(
    'fxu_balance', v_fxu_balance,
    'usdt_balance', v_usdt_balance,
    'total_deposited', v_total_deposited,
    'total_withdrawn', v_total_withdrawn,
    'total_deposited_usdt', v_total_deposited_usdt,
    'total_withdrawn_usdt', v_total_withdrawn_usdt,
    'pending_withdrawals', v_pending_withdrawals,
    'pending_withdrawals_usdt', v_pending_withdrawals_usdt,
    'daily_withdrawn', v_daily_withdrawn,
    'daily_withdrawn_usdt', v_daily_withdrawn_usdt,
    'daily_limit', v_config.max_withdrawal_daily,
    'daily_limit_usdt', v_config.usdt_max_withdrawal_daily,
    'daily_remaining', v_config.max_withdrawal_daily - v_daily_withdrawn,
    'daily_remaining_usdt', v_config.usdt_max_withdrawal_daily - v_daily_withdrawn_usdt,
    'min_amount', v_config.min_deposit,
    'min_amount_usdt', v_config.usdt_min_deposit,
    'withdrawal_fee_percent', v_config.withdrawal_fee_percent,
    'withdrawal_fee_percent_usdt', v_config.usdt_withdrawal_fee_percent,
    'deposits_enabled', v_config.is_deposits_enabled,
    'withdrawals_enabled', v_config.is_withdrawals_enabled,
    'usdt_deposits_enabled', v_config.is_usdt_deposits_enabled,
    'usdt_withdrawals_enabled', v_config.is_usdt_withdrawals_enabled,
    'usdt_contract', v_config.usdt_contract_address,
    'swap_enabled', v_config.is_swap_enabled,
    'swap_rate', v_config.swap_rate_fxu_per_usdt,
    'swap_min_fxu', v_config.swap_min_fxu,
    'swap_min_usdt', v_config.swap_min_usdt,
    'swap_fee_percent', COALESCE(v_config.swap_fee_percent, 1.0),
    -- NEW: flat fee model
    'withdrawal_fee_flat_usd', v_fee_usd,
    'usdt_withdrawal_fee_flat', v_fee_usdt_flat,
    'tung_price_usd', v_tung_price,
    'withdrawal_fee_tung', v_fee_tung
  );
END;
$function$;
