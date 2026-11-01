/*
  # Add swap_fee_percent to get_wallet_stats

  ## Changes
  - Update get_wallet_stats function to return swap_fee_percent from wallet_config

  ## Notes
  - This allows the frontend to use the configurable swap fee instead of hardcoded value
*/

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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT fxu_balance, usdt_balance INTO v_fxu_balance, v_usdt_balance FROM profiles WHERE id = v_user_id;

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposited
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'deposit' AND token_type = 'FXU' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_withdrawn
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'FXU' AND status = 'confirmed';

  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_pending_withdrawals
  FROM wallet_transactions
  WHERE user_id = v_user_id AND tx_type = 'withdrawal' AND token_type = 'FXU' AND status IN ('pending', 'processing');

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
    'swap_fee_percent', COALESCE(v_config.swap_fee_percent, 1.0)
  );
END;
$function$;
