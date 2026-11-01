/*
  # Fix Jackpot Pools Totals

  1. Problem
    - Pool totals were initialized incorrectly
    - Monthly pool was using 20% instead of 30% during initialization
    - Totals don't match the actual jackpot total_contributed

  2. Fix
    - Recalculate pool totals based on jackpot total_contributed
    - Use correct percentages: 20%, 30%, 50%
    - Ensure balances are correct relative to totals

  3. Changes
    - Updates expedition_total to 20% of jackpot total
    - Updates monthly_total to 30% of jackpot total
    - Updates plus_total to 50% of jackpot total
    - Adjusts balances proportionally
*/

DO $$
DECLARE
  v_jackpot_total numeric;
  v_jackpot_balance numeric;
  v_exp_percent numeric;
  v_monthly_percent numeric;
  v_plus_percent numeric;
  v_current_exp_total numeric;
  v_current_monthly_total numeric;
  v_current_plus_total numeric;
  v_current_exp_balance numeric;
  v_current_monthly_balance numeric;
  v_current_plus_balance numeric;
BEGIN
  SELECT total_contributed, balance INTO v_jackpot_total, v_jackpot_balance FROM jackpot WHERE id = 1;
  
  SELECT 
    expedition_percent, monthly_percent, plus_percent,
    expedition_total, monthly_total, plus_total,
    expedition_balance, monthly_balance, plus_balance
  INTO 
    v_exp_percent, v_monthly_percent, v_plus_percent,
    v_current_exp_total, v_current_monthly_total, v_current_plus_total,
    v_current_exp_balance, v_current_monthly_balance, v_current_plus_balance
  FROM jackpot_pools WHERE id = 1;

  RAISE NOTICE 'Current jackpot: total=%, balance=%', v_jackpot_total, v_jackpot_balance;
  RAISE NOTICE 'Current pools: exp=%/%, monthly=%/%, plus=%/%', 
    v_current_exp_balance, v_current_exp_total,
    v_current_monthly_balance, v_current_monthly_total,
    v_current_plus_balance, v_current_plus_total;
  RAISE NOTICE 'Percentages: exp=%, monthly=%, plus=%', v_exp_percent, v_monthly_percent, v_plus_percent;

  UPDATE jackpot_pools
  SET 
    expedition_total = FLOOR(v_jackpot_total * v_exp_percent / 100),
    expedition_balance = FLOOR(v_jackpot_balance * v_exp_percent / 100),
    monthly_total = FLOOR(v_jackpot_total * v_monthly_percent / 100),
    monthly_balance = FLOOR(v_jackpot_balance * v_monthly_percent / 100),
    plus_total = FLOOR(v_jackpot_total * v_plus_percent / 100),
    plus_balance = FLOOR(v_jackpot_balance * v_plus_percent / 100),
    updated_at = now()
  WHERE id = 1;

  RAISE NOTICE 'Pools corrected based on percentages';
END $$;
